import json
import os
from typing import Generator

from openai import OpenAI
from sqlalchemy.orm import Session

from services.indexing import embed
from services.search import hybrid_search
from routers.settings import _read as read_settings

MODEL = "gpt-4.1-mini"
TOP_N = 10
MAX_TOOL_ROUNDS = 5

CHAT_SYSTEM = """You are an AI research assistant helping a writer explore their personal archive of sources (letters, documents, photographs, notes, recordings).

Answer the writer's question using only information found in the provided source materials. Be specific and quote directly when helpful. When you use information from a source, mention which source it came from by name. If the sources don't contain an answer, say so clearly — do not invent details.

You have access to two tiers of sources:
- **Full sources**: provided in their entirety below — use these freely.
- **Catalog sources**: listed by title and summary only. If a catalog source looks relevant, call `get_source_text(source_id)` to read its full text before citing it.

Keep answers conversational but precise. This is a research dialogue, not a formal essay."""

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


def stream_chat(messages: list[dict], db: Session) -> Generator[dict, None, None]:
    """
    Generator that yields dicts:
      {"type": "sources", "sources": [...]}        — emitted before streaming, lists top sources
      {"type": "source_added", "source": {...}}    — deferred source fetched by LLM mid-stream
      {"type": "token", "text": "..."}             — each streamed token
      {"type": "done"}                             — finished
      {"type": "error", "message": "..."}          — on failure
    """
    user_messages = [m for m in messages if m.get("role") == "user"]
    if not user_messages:
        yield {"type": "error", "message": "No user message found."}
        return

    query = user_messages[-1]["content"]

    try:
        query_embedding = embed(query)
        embedding_str = "[" + ",".join(str(x) for x in query_embedding) + "]"

        rows = hybrid_search(db, query, embedding_str)

        top_rows = rows[:TOP_N]
        catalog_rows = rows[TOP_N:]

        # Lookup for deferred fetching
        transcription_by_id = {row.id: row.transcription for row in rows}
        title_by_id = {row.id: row.title or "Untitled Source" for row in rows}
        summary_by_id = {row.id: row.summary or "" for row in rows}

        sources_out = [
            {
                "id": str(row.id),
                "title": row.title or "Untitled Source",
                "summary": row.summary or "",
            }
            for row in top_rows
        ]
        yield {"type": "sources", "sources": sources_out}

        # Build two-tier source context
        full_section = ""
        for row in top_rows:
            label = row.title or "Untitled Source"
            full_section += f"\n\n--- {label} (ID {row.id}) ---\n{row.transcription}"

        catalog_section = ""
        for row in catalog_rows:
            label = row.title or "Untitled Source"
            summary = row.summary or "No summary available."
            catalog_section += f"\n- [ID {row.id}] {label}: {summary}"

        source_context = ""
        if full_section:
            source_context += f"\n\n=== FULL SOURCES ===\nThese sources are provided in full.{full_section}"
        if catalog_section:
            source_context += f"\n\n=== SOURCE CATALOG ===\nThese sources are available by title and summary. Call get_source_text(source_id) to read any of them in full.{catalog_section}"
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
        tools = [GET_SOURCE_TEXT_TOOL] if catalog_rows else None

        # Streaming tool-call loop
        for _round in range(MAX_TOOL_ROUNDS):
            kwargs: dict = {
                "model": MODEL,
                "messages": gpt_messages,
                "stream": True,
            }
            if tools:
                kwargs["tools"] = tools

            stream = client.chat.completions.create(**kwargs)

            # Accumulate streamed content and tool calls
            acc_content = ""
            tool_calls_acc: dict[int, dict] = {}  # index -> {id, name, arguments}
            finish_reason = None

            for chunk in stream:
                choice = chunk.choices[0]
                finish_reason = choice.finish_reason or finish_reason
                delta = choice.delta

                # Stream text tokens
                if delta.content:
                    acc_content += delta.content
                    yield {"type": "token", "text": delta.content}

                # Accumulate tool call fragments
                if delta.tool_calls:
                    for tc in delta.tool_calls:
                        idx = tc.index
                        if idx not in tool_calls_acc:
                            tool_calls_acc[idx] = {"id": "", "name": "", "arguments": ""}
                        if tc.id:
                            tool_calls_acc[idx]["id"] = tc.id
                        if tc.function and tc.function.name:
                            tool_calls_acc[idx]["name"] = tc.function.name
                        if tc.function and tc.function.arguments:
                            tool_calls_acc[idx]["arguments"] += tc.function.arguments

            if finish_reason == "tool_calls" and tool_calls_acc:
                # Build the assistant message with tool_calls for the conversation
                built_tool_calls = []
                for idx in sorted(tool_calls_acc.keys()):
                    tc_data = tool_calls_acc[idx]
                    built_tool_calls.append({
                        "id": tc_data["id"],
                        "type": "function",
                        "function": {
                            "name": tc_data["name"],
                            "arguments": tc_data["arguments"],
                        },
                    })

                assistant_msg: dict = {"role": "assistant", "tool_calls": built_tool_calls}
                if acc_content:
                    assistant_msg["content"] = acc_content
                gpt_messages.append(assistant_msg)

                # Execute each tool call
                for tc_data in built_tool_calls:
                    args = json.loads(tc_data["function"]["arguments"])
                    sid = args.get("source_id")
                    content = transcription_by_id.get(sid, "Source not found.")

                    # Emit source_added event so the frontend can show the new chip
                    if sid and sid in transcription_by_id:
                        yield {
                            "type": "source_added",
                            "source": {
                                "id": str(sid),
                                "title": title_by_id.get(sid, "Untitled Source"),
                                "summary": summary_by_id.get(sid, ""),
                            },
                        }

                    gpt_messages.append({
                        "role": "tool",
                        "tool_call_id": tc_data["id"],
                        "content": content,
                    })

                # Loop to let the model continue with the tool results
                continue

            # Done — model finished with text
            yield {"type": "done"}
            return

        # Fallback: hit max rounds
        yield {"type": "done"}

    except Exception as e:
        yield {"type": "error", "message": str(e)}
