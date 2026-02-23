import json
import os
from openai import OpenAI

EMBED_MODEL = "text-embedding-3-small"
EXTRACT_MODEL = "gpt-4o"

EXTRACT_PROMPT = """You are an archivist indexing a historical document or personal note.

Given the transcription below, extract the following and return valid JSON only:
- "title": a short, descriptive title for this document (max 10 words)
- "summary": a 2-3 sentence summary of what this document is about
- "keywords": list of important themes, topics, or terms (max 10)
- "people": list of people mentioned, using the most complete name form available (max 20)
- "locations": list of places mentioned — cities, countries, buildings, etc. (max 20)
- "timeline": list of dates, years, or time periods referenced in the text (max 20)

Rules:
- If a field has nothing to extract, return an empty list or empty string.
- Do not invent information not present in the text.
- Output raw JSON only — no markdown, no code fences.
"""

EXTRACT_PROMPT_TITLED = """You are an archivist indexing a historical document or personal note.

The author has already given this document the title: "{title}"
Use this title exactly as-is in your response — do not change or replace it.
Let the title inform your understanding of the document's context and subject matter.

Given the transcription below, extract the following and return valid JSON only:
- "title": use the author's title exactly: "{title}"
- "summary": a 2-3 sentence summary of what this document is about
- "keywords": list of important themes, topics, or terms (max 10)
- "people": list of people mentioned, using the most complete name form available (max 20)
- "locations": list of places mentioned — cities, countries, buildings, etc. (max 20)
- "timeline": list of dates, years, or time periods referenced in the text (max 20)

Rules:
- If a field has nothing to extract, return an empty list or empty string.
- Do not invent information not present in the text.
- Output raw JSON only — no markdown, no code fences.
"""


def _client() -> OpenAI:
    api_key = os.environ.get("OPENAI_KEY")
    if not api_key:
        raise RuntimeError("OPENAI_KEY environment variable is not set.")
    return OpenAI(api_key=api_key)


def extract_metadata(transcription: str, existing_title: str | None = None) -> dict:
    if existing_title:
        prompt = EXTRACT_PROMPT_TITLED.replace("{title}", existing_title) + "\nTranscription:\n" + transcription
    else:
        prompt = EXTRACT_PROMPT + "\nTranscription:\n" + transcription

    client = _client()
    response = client.chat.completions.create(
        model=EXTRACT_MODEL,
        response_format={"type": "json_object"},
        messages=[{"role": "user", "content": prompt}],
    )
    raw = response.choices[0].message.content or "{}"
    data = json.loads(raw)
    return {
        "title":     existing_title or data.get("title", ""),
        "summary":   data.get("summary", ""),
        "keywords":  data.get("keywords", []),
        "people":    data.get("people", []),
        "locations": data.get("locations", []),
        "timeline":  data.get("timeline", []),
    }


def embed(text: str) -> list[float]:
    client = _client()
    response = client.embeddings.create(
        model=EMBED_MODEL,
        input=text,
    )
    return response.data[0].embedding


def index_source(transcription: str, existing_title: str | None = None) -> dict:
    metadata = extract_metadata(transcription, existing_title=existing_title)
    embedding = embed(transcription)
    return {**metadata, "embedding": embedding}
