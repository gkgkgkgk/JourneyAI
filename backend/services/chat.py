import os
from typing import Generator

from openai import OpenAI
from sqlalchemy import text
from sqlalchemy.orm import Session

from services.indexing import embed
from routers.settings import _read as read_settings

MODEL = "gpt-4o"

CHAT_SYSTEM = """You are an AI research assistant helping a writer explore their personal archive of sources (letters, documents, photographs, notes, recordings).

Answer the writer's question using only information found in the provided source materials. Be specific and quote directly when helpful. When you use information from a source, mention which source it came from by name. If the sources don't contain an answer, say so clearly — do not invent details.

Keep answers conversational but precise. This is a research dialogue, not a formal essay."""


def _client() -> OpenAI:
    api_key = os.environ.get("OPENAI_KEY")
    if not api_key:
        raise RuntimeError("OPENAI_KEY environment variable is not set.")
    return OpenAI(api_key=api_key)


def stream_chat(messages: list[dict], db: Session) -> Generator[dict, None, None]:
    """
    Generator that yields dicts:
      {"type": "sources", "sources": [...]}   — emitted before streaming, lists sources consulted
      {"type": "token", "text": "..."}        — each streamed token
      {"type": "done"}                        — finished
      {"type": "error", "message": "..."}     — on failure
    """
    user_messages = [m for m in messages if m.get("role") == "user"]
    if not user_messages:
        yield {"type": "error", "message": "No user message found."}
        return

    query = user_messages[-1]["content"]

    try:
        query_embedding = embed(query)
        embedding_str = "[" + ",".join(str(x) for x in query_embedding) + "]"

        rows = db.execute(
            text("""
                SELECT id, title, summary, transcription
                FROM sources
                WHERE embedding IS NOT NULL AND transcription IS NOT NULL
                ORDER BY embedding <=> CAST(:embedding AS vector)
                LIMIT 5
            """),
            {"embedding": embedding_str},
        ).fetchall()

        sources_out = [
            {
                "id": str(row.id),
                "title": row.title or "Untitled Source",
                "summary": row.summary or "",
            }
            for row in rows
        ]
        yield {"type": "sources", "sources": sources_out}

        source_context = ""
        for row in rows:
            label = row.title or "Untitled Source"
            source_context += f"\n\n--- {label} ---\n{row.transcription}"

        if not source_context:
            source_context = "\n\n(No indexed sources available.)"

        settings = read_settings()
        from routers.settings import build_author_context
        author_context = build_author_context(settings)

        system_content = CHAT_SYSTEM
        if author_context:
            system_content += f"\n\n{author_context}"
        system_content += f"\n\nRelevant source materials from the archive:{source_context}"

        gpt_messages = [{"role": "system", "content": system_content}] + messages

        client = _client()
        stream = client.chat.completions.create(
            model=MODEL,
            messages=gpt_messages,
            stream=True,
        )

        for chunk in stream:
            delta = chunk.choices[0].delta.content
            if delta:
                yield {"type": "token", "text": delta}

        yield {"type": "done"}

    except Exception as e:
        yield {"type": "error", "message": str(e)}
