import base64
import io
import os
import tempfile
from collections.abc import Iterator
from openai import OpenAI
from pydub import AudioSegment
import mammoth

MODEL = "gpt-5"

TRANSCRIBE_PROMPT = (
    "Look at this source. "
    "If it contains handwritten or printed text (a document, letter, note, page, etc.), transcribe all text exactly as it appears — "
    "do not paraphrase, interpret, or correct spelling, and omit any crossed-out text. "
    "If it is a photograph or scene with no meaningful text, describe what you see in 2-4 sentences. "
    "Output only the transcription or description, nothing else."
)

TYPO_PROMPT = (
    "Fix only spelling and obvious typos in the text below. "
    "Do not change wording, sentence structure, punctuation style, or meaning in any way. "
    "Output only the corrected text, nothing else.\n\n"
)


def _system_prompt() -> str:
    """Load the composed author context from settings.json, or return empty string."""
    try:
        from routers.settings import _read, build_author_context
        return build_author_context(_read())
    except Exception:
        return ""


def _is_text_file(content_type: str, filename: str) -> bool:
    return content_type == "text/plain" or filename.lower().endswith(".txt")


def _is_docx_file(content_type: str, filename: str) -> bool:
    return (
        content_type == "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        or filename.lower().endswith(".docx")
    )


def _docx_to_markdown(file_bytes: bytes) -> str:
    result = mammoth.convert_to_markdown(io.BytesIO(file_bytes))
    return result.value


def _client() -> OpenAI:
    api_key = os.environ.get("OPENAI_KEY")
    if not api_key:
        raise RuntimeError("OPENAI_KEY environment variable is not set.")
    return OpenAI(api_key=api_key)


def transcribe(file_path: str, content_type: str, original_filename: str) -> str:
    with open(file_path, "rb") as f:
        file_bytes = f.read()

    # Plain text — just return as-is, no LLM needed
    if _is_text_file(content_type, original_filename):
        return file_bytes.decode("utf-8", errors="replace")

    # DOCX — convert to markdown, no LLM needed
    if _is_docx_file(content_type, original_filename):
        return _docx_to_markdown(file_bytes)

    client = _client()
    sys_prompt = _system_prompt()

    # Prepend author context when present (use to help decipher names, places, and dates)
    context_prefix = f"{sys_prompt}\n\n" if sys_prompt else ""

    if content_type.startswith("image/"):
        b64 = base64.b64encode(file_bytes).decode("utf-8")
        response = client.chat.completions.create(
            model=MODEL,
            messages=[
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "image_url",
                            "image_url": {
                                "url": f"data:{content_type};base64,{b64}",
                                "detail": "high",
                            },
                        },
                        {"type": "text", "text": context_prefix + TRANSCRIBE_PROMPT},
                    ],
                }
            ],
        )

    elif content_type == "application/pdf":
        b64 = base64.b64encode(file_bytes).decode("utf-8")
        response = client.chat.completions.create(
            model=MODEL,
            messages=[
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "file",
                            "file": {
                                "filename": original_filename,
                                "file_data": f"data:application/pdf;base64,{b64}",
                            },
                        },
                        {"type": "text", "text": context_prefix + TRANSCRIBE_PROMPT},
                    ],
                }
            ],
        )

    elif content_type.startswith("audio/") or original_filename.lower().endswith(
        (".mp3", ".mp4", ".mpeg", ".mpga", ".m4a", ".wav", ".webm", ".ogg")
    ):
        return _transcribe_audio(client, file_bytes, original_filename, sys_prompt)

    else:
        # Plain text — fix typos only
        text_content = file_bytes.decode("utf-8", errors="replace")
        response = client.chat.completions.create(
            model=MODEL,
            messages=[
                {
                    "role": "user",
                    "content": context_prefix + TYPO_PROMPT + text_content,
                }
            ],
        )

    return response.choices[0].message.content or ""


# Whisper API limit is 25 MB. Chunk anything larger into ~10-minute segments.
_WHISPER_MODEL = "whisper-1"
_CHUNK_MS = 10 * 60 * 1000       # 10 minutes in ms
_MAX_BYTES = 24 * 1024 * 1024    # 24 MB safety margin


def _transcribe_audio(client: OpenAI, file_bytes: bytes, filename: str, sys_prompt: str = "") -> str:
    ext = os.path.splitext(filename)[1].lower().lstrip(".") or "mp3"
    fmt = ext if ext in ("mp3", "wav", "ogg", "flac", "m4a", "webm") else "mp3"

    if len(file_bytes) <= _MAX_BYTES:
        return _whisper_bytes(client, file_bytes, filename, sys_prompt)

    # File too large — split into chunks with pydub
    audio = AudioSegment.from_file(io.BytesIO(file_bytes), format=fmt)
    chunks = [audio[i: i + _CHUNK_MS] for i in range(0, len(audio), _CHUNK_MS)]

    parts: list[str] = []
    for i, chunk in enumerate(chunks):
        buf = io.BytesIO()
        chunk.export(buf, format="mp3")
        chunk_bytes = buf.getvalue()
        chunk_name = f"chunk_{i:03d}.mp3"
        parts.append(_whisper_bytes(client, chunk_bytes, chunk_name, sys_prompt))

    return " ".join(parts)


def _whisper_bytes(client: OpenAI, data: bytes, filename: str, sys_prompt: str = "") -> str:
    # Whisper requires a file-like object with a name attribute
    buf = io.BytesIO(data)
    buf.name = filename
    kwargs: dict = {"model": _WHISPER_MODEL, "file": buf}
    if sys_prompt:
        # Whisper's prompt param biases recognition toward names/terms in the text
        kwargs["prompt"] = sys_prompt[:224]  # Whisper prompt is capped at ~224 tokens
    result = client.audio.transcriptions.create(**kwargs)
    return result.text


def transcribe_stream(
    file_path: str,
    content_type: str,
    original_filename: str,
) -> Iterator[dict]:
    """
    Generator that yields SSE-style dicts for the transcription pipeline.
    Yields {"type": "status", "message": ...} and {"type": "token", "text": ...}.
    The caller is responsible for accumulating tokens and persisting the result.
    """
    with open(file_path, "rb") as f:
        file_bytes = f.read()

    # Plain text — no LLM needed, just return the content
    if _is_text_file(content_type, original_filename):
        yield {"type": "status", "message": "Reading text file…"}
        text = file_bytes.decode("utf-8", errors="replace")
        yield {"type": "token", "text": text}
        return

    # DOCX — convert to markdown, no LLM needed
    if _is_docx_file(content_type, original_filename):
        yield {"type": "status", "message": "Converting DOCX to markdown…"}
        text = _docx_to_markdown(file_bytes)
        yield {"type": "token", "text": text}
        return

    client = _client()
    sys_prompt = _system_prompt()

    context_prefix = (
        f"Context about this archive (use to help decipher names, places, and dates):\n{sys_prompt}\n\n"
        if sys_prompt else ""
    )

    is_audio = content_type.startswith("audio/") or original_filename.lower().endswith(
        (".mp3", ".mp4", ".mpeg", ".mpga", ".m4a", ".wav", ".webm", ".ogg")
    )

    if is_audio:
        # Whisper doesn't support streaming — yield status then the full result as one token
        yield {"type": "status", "message": "Sending to Whisper…"}
        result = _transcribe_audio(client, file_bytes, original_filename, sys_prompt)
        yield {"type": "token", "text": result}
        return

    yield {"type": "status", "message": "Sending to transcription services..."}

    if content_type.startswith("image/"):
        b64 = base64.b64encode(file_bytes).decode("utf-8")
        stream = client.chat.completions.create(
            model=MODEL,
            stream=True,
            messages=[
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "image_url",
                            "image_url": {
                                "url": f"data:{content_type};base64,{b64}",
                                "detail": "high",
                            },
                        },
                        {"type": "text", "text": context_prefix + TRANSCRIBE_PROMPT},
                    ],
                }
            ],
        )

    elif content_type == "application/pdf":
        b64 = base64.b64encode(file_bytes).decode("utf-8")
        stream = client.chat.completions.create(
            model=MODEL,
            stream=True,
            messages=[
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "file",
                            "file": {
                                "filename": original_filename,
                                "file_data": f"data:application/pdf;base64,{b64}",
                            },
                        },
                        {"type": "text", "text": context_prefix + TRANSCRIBE_PROMPT},
                    ],
                }
            ],
        )

    else:
        # Plain text — typo fix with streaming
        text_content = file_bytes.decode("utf-8", errors="replace")
        stream = client.chat.completions.create(
            model=MODEL,
            stream=True,
            messages=[
                {
                    "role": "user",
                    "content": context_prefix + TYPO_PROMPT + text_content,
                }
            ],
        )

    for chunk in stream:
        delta = chunk.choices[0].delta.content
        if delta:
            yield {"type": "token", "text": delta}
