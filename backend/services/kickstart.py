import json
import os
from sqlalchemy.orm import Session
from sqlalchemy import text
from openai import OpenAI
from services.indexing import embed
from routers.settings import _read as read_settings

MODEL = "gpt-4o"

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


def _client() -> OpenAI:
    api_key = os.environ.get("OPENAI_KEY")
    if not api_key:
        raise RuntimeError("OPENAI_KEY environment variable is not set.")
    return OpenAI(api_key=api_key)


def generate_kickstart(prompt: str, note_type: str, length: str, fmt: str, db: Session) -> dict:
    client = _client()

    # Embed the prompt for vector search
    query_embedding = embed(prompt)
    embedding_str = "[" + ",".join(str(x) for x in query_embedding) + "]"

    # Find the most relevant indexed sources
    rows = db.execute(
        text("""
            SELECT id, title, transcription
            FROM sources
            WHERE embedding IS NOT NULL AND transcription IS NOT NULL
            ORDER BY embedding <=> CAST(:embedding AS vector)
            LIMIT 5
        """),
        {"embedding": embedding_str},
    ).fetchall()

    source_ids = [row.id for row in rows]
    source_context = ""
    for row in rows:
        label = row.title or "Untitled Source"
        source_context += f"\n\n--- {label} ---\n{row.transcription}"

    if not source_context:
        source_context = "\n\n(No indexed sources available — write from the prompt alone.)"

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

Draw on the source materials below. Use specific names, dates, places, and details from the sources wherever relevant. Do not invent facts that are not in the sources. If the sources don't directly address the topic, use them for atmosphere, context, or related detail.

Return JSON only:
{{
  "title": "a short, evocative title for this note (max 8 words)",
  "content": "the full generated text"
}}

Source materials:{source_context}"""

    response = client.chat.completions.create(
        model=MODEL,
        response_format={"type": "json_object"},
        messages=[{"role": "user", "content": user_prompt}],
    )

    data = json.loads(response.choices[0].message.content or "{}")
    return {
        "title":      data.get("title") or prompt[:60],
        "content":    data.get("content", ""),
        "source_ids": source_ids,
    }
