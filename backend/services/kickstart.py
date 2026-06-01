import json
import os
from sqlalchemy.orm import Session
from openai import OpenAI
from services.indexing import embed
from services.search import hybrid_search
from routers.settings import _read as read_settings

MODEL = "gpt-4.1-mini"
TOP_N = 10
MAX_TOOL_ROUNDS = 5

LENGTH_TARGETS = {
    "short":  "250–350 words",
    "medium": "500–700 words",
    "long":   "1000–1400 words",
}

FORMAT_INSTRUCTIONS = {
    "prose": (
        "Write in polished, flowing prose as if this passage could appear in the finished book. "
        "Complete sentences, natural rhythm, vivid detail where the sources allow."
    ),
    "outline": (
        "Write as a detailed bullet-point outline. Each top-level bullet is a major point or section. "
        "Sub-bullets add supporting detail — names, dates, key facts from the sources. "
        "The writer will later expand this into prose."
    ),
    "rough": (
        "Write a rough draft in full sentences. Where personal detail, memory, or additional research is needed, "
        "insert a marker like [EXPAND: brief instruction here]. "
        "Be generous with markers — they are invitations, not gaps."
    ),
}

NOTE_TYPE_LABELS = {
    "chapter": "book chapter",
    "scene":   "scene or vignette",
    "note":    "writing note or reflection",
}

GET_SOURCE_TEXT_TOOL = {
    "type": "function",
    "function": {
        "name": "get_source_text",
        "description": "Fetch the full transcription text of a source from the catalog. Use this when a catalog source's title and summary suggest it contains relevant detail you need.",
        "parameters": {
            "type": "object",
            "properties": {
                "source_id": {
                    "type": "string",
                    "description": "The ID of the source to fetch (e.g. 'f99aaa85-2148-4010-aa41-73ddf06ec923').",
                }
            },
            "required": ["source_id"],
        },
    },
}


def _client() -> OpenAI:
    api_key = os.environ.get("OPENAI_KEY")
    if not api_key:
        raise RuntimeError("OPENAI_KEY environment variable is not set.")
    return OpenAI(api_key=api_key)


def generate_kickstart(prompt: str, note_type: str, length: str, fmt: str, db: Session) -> dict:
    client = _client()

    # Embed the prompt for hybrid search
    query_embedding = embed(prompt)
    embedding_str = "[" + ",".join(str(x) for x in query_embedding) + "]"

    # Fetch ALL indexed sources, sorted by hybrid (semantic + text) similarity
    rows = hybrid_search(db, prompt, embedding_str)

    top_rows = rows[:TOP_N]
    catalog_rows = rows[TOP_N:]

    # Build a lookup for deferred fetching
    transcription_by_id = {row.id: row.transcription for row in rows}

    source_ids = [row.id for row in top_rows]

    # Build two-section source context
    full_section = ""
    for row in top_rows:
        label = row.title or "Untitled Source"
        full_section += f"\n\n--- {label} (ID {row.id}) ---\n{row.transcription}"

    catalog_section = ""
    for row in catalog_rows:
        label = row.title or "Untitled Source"
        summary = row.summary or "No summary available."
        catalog_section += f"\n- [ID {row.id}] {label}: {summary}"

    if not full_section and not catalog_section:
        source_context = "\n\n(No indexed sources available — write from the prompt alone.)"
    else:
        source_context = ""
        if full_section:
            source_context += f"\n\n=== FULL SOURCES ===\nThese sources are provided in full.{full_section}"
        if catalog_section:
            source_context += f"\n\n=== SOURCE CATALOG ===\nThese sources are available by title and summary. Call get_source_text(source_id) to read any of them in full.{catalog_section}"

    # Author's manuscript context from settings
    from routers.settings import build_author_context
    author_context = build_author_context(read_settings())
    context_prefix = f"{author_context}\n\n" if author_context else ""

    note_type_label  = NOTE_TYPE_LABELS.get(note_type, "writing note")
    length_target    = LENGTH_TARGETS.get(length, LENGTH_TARGETS["medium"])
    format_instruction = FORMAT_INSTRUCTIONS.get(fmt, FORMAT_INSTRUCTIONS["prose"])

    user_prompt = f"""{context_prefix}You are helping a writer draft a {note_type_label} for their memoir or historical book.

The writer wants to write about: {prompt}

Target length: {length_target}

Format: {format_instruction}

Draw on the source materials below. Use specific names, dates, places, and details from the sources wherever relevant. Do not invent facts that are not in the sources. If you need more detail from a catalog source, call get_source_text to fetch it before writing.

Return JSON only:
{{
  "title": "a short, evocative title for this note (max 8 words)",
  "content": "the full generated text"
}}

Source materials:{source_context}"""

    messages = [{"role": "user", "content": user_prompt}]
    tools = [GET_SOURCE_TEXT_TOOL] if catalog_rows else None

    # Tool-call loop (max MAX_TOOL_ROUNDS rounds)
    for _ in range(MAX_TOOL_ROUNDS):
        kwargs: dict = {
            "model": MODEL,
            "response_format": {"type": "json_object"},
            "messages": messages,
        }
        if tools:
            kwargs["tools"] = tools

        response = client.chat.completions.create(**kwargs)
        choice = response.choices[0]

        if choice.finish_reason == "tool_calls" and choice.message.tool_calls:
            messages.append(choice.message)
            for tc in choice.message.tool_calls:
                args = json.loads(tc.function.arguments)
                sid = args.get("source_id")
                content = transcription_by_id.get(sid, "Source not found.")
                if sid and sid not in source_ids:
                    source_ids.append(sid)
                messages.append({
                    "role": "tool",
                    "tool_call_id": tc.id,
                    "content": content,
                })
            continue

        # Final response with content
        data = json.loads(choice.message.content or "{}")
        return {
            "title":      data.get("title") or prompt[:60],
            "content":    data.get("content", ""),
            "source_ids": source_ids,
        }

    # Fallback if we hit max rounds — use last response
    data = json.loads(response.choices[0].message.content or "{}")
    return {
        "title":      data.get("title") or prompt[:60],
        "content":    data.get("content", ""),
        "source_ids": source_ids,
    }
