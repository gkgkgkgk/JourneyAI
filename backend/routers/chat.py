import json

from fastapi import APIRouter
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from services.chat import stream_chat

router = APIRouter(prefix="/api/chat", tags=["chat"])


class ChatMessage(BaseModel):
    role: str  # "user" | "assistant"
    content: str


class ChatRequest(BaseModel):
    messages: list[ChatMessage]


@router.post("/stream")
def chat_stream(data: ChatRequest) -> StreamingResponse:
    def generate():
        from database import SessionLocal

        db = SessionLocal()
        try:
            messages = [{"role": m.role, "content": m.content} for m in data.messages]
            for event in stream_chat(messages, db):
                yield f"data: {json.dumps(event)}\n\n"
        except Exception as e:
            error_event = json.dumps({"type": "error", "message": str(e)})
            yield f"data: {error_event}\n\n"
        finally:
            db.close()

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
