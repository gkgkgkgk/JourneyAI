import json
import os
from sqlalchemy.orm import Session
from sqlalchemy import text
from openai import OpenAI
from services.indexing import embed
from routers.settings import _read as read_settings

MODEL = "gpt-4o"

FEEDBACK_PROMPT = """You are a meticulous editor and fact-checker for a memoir or historical book being assembled from archival notes.

Review the following draft passage and compare it against the source materials provided. Be specific — reference what you actually see in the sources. Do not invent or assume anything not in the text.

Return JSON only with this exact structure:
{
  "accurate": ["specific claims in the draft that are supported by or consistent with the sources"],
  "concerns": ["specific things that conflict with, contradict, or lack support from the sources"],
  "suggestions": ["concrete writing or content suggestions to improve depth, clarity, or accuracy"],
  "tone": "one sentence on the overall tone and authenticity of the writing",
  "source_quotes": {
    "<exact source title as provided>": ["short verbatim excerpt from that source most relevant to the draft"]
  }
}

In source_quotes, use the exact source title shown in the '--- Title ---' headers. Include 1-2 quotes per source that directly support or challenge something in the draft. Omit sources with no clearly relevant passage.

If no sources are available or relevant, note that in the concerns field and leave accurate and source_quotes empty.

Draft passage:
"""


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

    # Embed the note content for vector search
    embedding = embed(content)
    embedding_str = "[" + ",".join(str(x) for x in embedding) + "]"

    # Pull top 10 most relevant indexed sources
    rows = db.execute(
        text("""
            SELECT id, title, transcription
            FROM sources
            WHERE embedding IS NOT NULL AND transcription IS NOT NULL
            ORDER BY embedding <=> CAST(:embedding AS vector)
            LIMIT 10
        """),
        {"embedding": embedding_str},
    ).fetchall()

    # Top 5 are fed to GPT-4o for fact-checking; next 5 are surfaced as recommendations
    consulted = rows[:5]
    recommended = rows[5:]

    source_ids = []
    source_context = ""
    for row in consulted:
        source_ids.append(row.id)
        label = row.title or "Untitled Source"
        source_context += f"\n\n--- {label} ---\n{row.transcription}"

    if not source_context:
        source_context = "\n\n(No indexed sources available to compare against.)"

    recommended_source_ids = [row.id for row in recommended]

    response = client.chat.completions.create(
        model=MODEL,
        response_format={"type": "json_object"},
        messages=[{
            "role": "user",
            "content": context_prefix + FEEDBACK_PROMPT + content + "\n\nSource materials:" + source_context,
        }],
    )

    data = json.loads(response.choices[0].message.content or "{}")

    # Map source title → id so we can store quotes by ID
    title_to_id = {(row.title or "Untitled Source"): row.id for row in consulted}
    raw_quotes: dict = data.get("source_quotes", {})
    source_quotes: dict[str, list[str]] = {}
    for title, quotes in raw_quotes.items():
        sid = title_to_id.get(title)
        if sid and isinstance(quotes, list):
            source_quotes[sid] = [q for q in quotes if isinstance(q, str)]

    return {
        "accurate": data.get("accurate", []),
        "concerns": data.get("concerns", []),
        "suggestions": data.get("suggestions", []),
        "tone": data.get("tone", ""),
        "source_ids": source_ids,
        "recommended_source_ids": recommended_source_ids,
        "source_quotes": source_quotes,
    }
