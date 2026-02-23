import uuid
from datetime import datetime, timezone
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from database import get_db
from models import Note, Source
from services.feedback import generate_feedback

router = APIRouter(prefix="/api/notes", tags=["notes"])


class NoteCreate(BaseModel):
    title: Optional[str] = None
    content: str = ""
    note_type: str = "note"


class KickstartRequest(BaseModel):
    prompt: str
    note_type: str = "note"
    length: str = "medium"   # "short" | "medium" | "long"
    format: str = "prose"    # "prose" | "outline" | "rough"


class NoteUpdate(BaseModel):
    title: Optional[str] = None
    content: Optional[str] = None
    note_type: Optional[str] = None


class SourceBrief(BaseModel):
    id: str
    title: Optional[str] = None
    summary: Optional[str] = None
    tidbits: list[str] = []

    class Config:
        from_attributes = True


class NoteResponse(BaseModel):
    id: str
    title: Optional[str] = None
    content: str
    note_type: str
    created_at: datetime
    updated_at: datetime
    ai_feedback: Optional[dict] = None
    source_ids: Optional[list] = None
    feedback_at: Optional[datetime] = None
    matched_sources: Optional[list[SourceBrief]] = None
    recommended_sources: Optional[list[SourceBrief]] = None

    class Config:
        from_attributes = True


def _resolve_matched_sources(note: Note, db: Session) -> list[SourceBrief]:
    if not note.source_ids:
        return []
    source_quotes: dict = (note.ai_feedback or {}).get("source_quotes", {})
    sources = db.query(Source).filter(Source.id.in_(note.source_ids)).all()
    return [
        SourceBrief(id=s.id, title=s.title, summary=s.summary, tidbits=source_quotes.get(s.id, []))
        for s in sources
    ]


def _resolve_recommended_sources(note: Note, db: Session) -> list[SourceBrief]:
    ids = (note.ai_feedback or {}).get("recommended_source_ids", [])
    if not ids:
        return []
    sources = db.query(Source).filter(Source.id.in_(ids)).all()
    by_id = {s.id: s for s in sources}
    return [
        SourceBrief(id=sid, title=by_id[sid].title, summary=by_id[sid].summary, tidbits=[])
        for sid in ids if sid in by_id
    ]


@router.get("/", response_model=list[NoteResponse])
def get_notes(db: Session = Depends(get_db)):
    notes = db.query(Note).order_by(Note.updated_at.desc()).all()
    responses = []
    for note in notes:
        r = NoteResponse.model_validate(note)
        r.matched_sources = _resolve_matched_sources(note, db)
        r.recommended_sources = _resolve_recommended_sources(note, db)
        responses.append(r)
    return responses


@router.post("/kickstart", response_model=NoteResponse, status_code=201)
def kickstart_note(data: KickstartRequest, db: Session = Depends(get_db)):
    from services.kickstart import generate_kickstart

    if not data.prompt.strip():
        raise HTTPException(status_code=400, detail="Prompt is required.")

    try:
        result = generate_kickstart(data.prompt, data.note_type, data.length, data.format, db)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Kickstart failed: {e}")

    now = datetime.now(timezone.utc)
    note = Note(
        id=str(uuid.uuid4()),
        title=result["title"],
        content=result["content"],
        note_type=data.note_type,
        source_ids=result["source_ids"],
        created_at=now,
        updated_at=now,
    )
    db.add(note)
    db.commit()
    db.refresh(note)

    response = NoteResponse.model_validate(note)
    response.matched_sources = _resolve_matched_sources(note, db)
    return response


@router.post("/", response_model=NoteResponse, status_code=201)
def create_note(data: NoteCreate, db: Session = Depends(get_db)):
    now = datetime.now(timezone.utc)
    note = Note(
        id=str(uuid.uuid4()),
        title=data.title,
        content=data.content,
        note_type=data.note_type,
        created_at=now,
        updated_at=now,
    )
    db.add(note)
    db.commit()
    db.refresh(note)
    return note


@router.patch("/{note_id}", response_model=NoteResponse)
def update_note(note_id: str, data: NoteUpdate, db: Session = Depends(get_db)):
    note = db.query(Note).filter(Note.id == note_id).first()
    if not note:
        raise HTTPException(status_code=404, detail="Note not found")

    if data.title is not None:
        note.title = data.title
    if data.content is not None:
        note.content = data.content
    if data.note_type is not None:
        note.note_type = data.note_type
    note.updated_at = datetime.now(timezone.utc)

    db.commit()
    db.refresh(note)
    return note


@router.delete("/{note_id}", status_code=204)
def delete_note(note_id: str, db: Session = Depends(get_db)):
    note = db.query(Note).filter(Note.id == note_id).first()
    if not note:
        raise HTTPException(status_code=404, detail="Note not found")
    db.delete(note)
    db.commit()


@router.post("/{note_id}/feedback", response_model=NoteResponse)
def get_feedback(note_id: str, db: Session = Depends(get_db)):
    note = db.query(Note).filter(Note.id == note_id).first()
    if not note:
        raise HTTPException(status_code=404, detail="Note not found")

    if not note.content or not note.content.strip():
        raise HTTPException(status_code=400, detail="Note has no content to review.")

    try:
        result = generate_feedback(note.content, db)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Feedback generation failed: {e}")

    source_ids = result.pop("source_ids", [])
    # Store recommended_source_ids inside ai_feedback JSON (no extra column needed)
    note.ai_feedback = result
    note.source_ids = source_ids
    note.feedback_at = datetime.now(timezone.utc)
    note.updated_at = datetime.now(timezone.utc)

    db.commit()
    db.refresh(note)

    response = NoteResponse.model_validate(note)
    response.matched_sources = _resolve_matched_sources(note, db)
    response.recommended_sources = _resolve_recommended_sources(note, db)
    return response
