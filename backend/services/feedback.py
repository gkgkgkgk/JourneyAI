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

FEEDBACK_PROMPT = """You are a meticulous editor and fact-checker for a memoir or historical book being assembled from archival notes.

Review the following draft passage and compare it against the source materials provided. Be specific — reference what you actually see in the sources. Do not invent or assume anything not in the text.

You have access to two tiers of sources:
- **Full sources**: provided in their entirety below — use these freely.
- **Catalog sources**: listed by title and summary only. If a catalog source looks relevant to fact-checking a claim, call `get_source_text(source_id)` to read its full text before referencing it.

Return JSON only with this exact structure:
{
  "accurate": ["specific claims in the draft that are supported by or consistent with the sources"],
  "concerns": ["specific things that conflict with, contradict, or lack support from the sources"],
  "suggestions": ["concrete writing or content suggestions to improve depth, clarity, or accuracy"],
  "tone": "one sentence on the overall tone and authenticity of the writing",
  "source_quotes": {
    "<source ID>": ["short verbatim excerpt from that source most relevant to the draft"]
  }
}

In source_quotes, use the source ID (not title). Include 1-2 quotes per source that directly support or challenge something in the draft. Omit sources with no clearly relevant passage.

If no sources are available or relevant, note that in the concerns field and leave accurate and source_quotes empty.

Draft passage:
"""

GET_SOURCE_TEXT_TOOL = {
    "type": "function",
    "function": {
        "name": "get_source_text",
        "description": "Fetch the full transcription text of a source from the catalog. Use this when a catalog source's title and summary suggest it contains relevant detail you need for fact-checking.",
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


def generate_feedback(content: str, db: Session) -> dict:
    client = _client()

    # Prepend user's manuscript context if set
    from routers.settings import build_author_context
    author_context = build_author_context(read_settings())
    context_prefix = f"{author_context}\n\n" if author_context else ""

    # Embed the note content for hybrid search
    embedding = embed(content)
    embedding_str = "[" + ",".join(str(x) for x in embedding) + "]"

    # Fetch ALL indexed sources, sorted by hybrid similarity
    rows = hybrid_search(db, content, embedding_str)

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
        source_context = "\n\n(No indexed sources available to compare against.)"
    else:
        source_context = ""
        if full_section:
            source_context += f"\n\n=== FULL SOURCES ===\nThese sources are provided in full.{full_section}"
        if catalog_section:
            source_context += f"\n\n=== SOURCE CATALOG ===\nThese sources are available by title and summary. Call get_source_text(source_id) to read any of them in full.{catalog_section}"

    user_prompt = context_prefix + FEEDBACK_PROMPT + content + "\n\nSource materials:" + source_context

    messages: list[dict] = [{"role": "user", "content": user_prompt}]
    tools = [GET_SOURCE_TEXT_TOOL] if catalog_rows else None

    # Tool-call loop (max MAX_TOOL_ROUNDS rounds)
    response = None
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
                tc_content = transcription_by_id.get(sid, "Source not found.")
                if sid and sid not in source_ids:
                    source_ids.append(sid)
                messages.append({
                    "role": "tool",
                    "tool_call_id": tc.id,
                    "content": tc_content,
                })
            continue

        # Final response with content
        break

    data = json.loads(response.choices[0].message.content or "{}")

    # source_quotes is now keyed by source ID directly
    raw_quotes: dict = data.get("source_quotes", {})
    source_quotes: dict[str, list[str]] = {}
    for sid, quotes in raw_quotes.items():
        if isinstance(quotes, list):
            source_quotes[sid] = [q for q in quotes if isinstance(q, str)]

    return {
        "accurate": data.get("accurate", []),
        "concerns": data.get("concerns", []),
        "suggestions": data.get("suggestions", []),
        "tone": data.get("tone", ""),
        "source_ids": source_ids,
        "source_quotes": source_quotes,
    }
