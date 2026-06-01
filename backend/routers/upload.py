import json
import uuid
import os
import subprocess
from datetime import datetime, timezone
from typing import Optional
from fastapi import APIRouter, UploadFile, File, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from pydantic import BaseModel
from database import get_db
from models import Source
from services.transcription import transcribe, transcribe_stream
from services.indexing import index_source, extract_metadata, embed
from services.search import hybrid_search

router = APIRouter(prefix="/api/sources", tags=["sources"])

UPLOAD_DIR = "/app/uploads"


class SourceResponse(BaseModel):
    id: str
    original_filename: str
    stored_filename: str
    file_path: str
    file_size: int
    content_type: str
    uploaded_at: datetime
    transcription: Optional[str] = None
    title: Optional[str] = None
    summary: Optional[str] = None
    keywords: Optional[list] = None
    people: Optional[list] = None
    locations: Optional[list] = None
    timeline: Optional[list] = None
    indexed_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class SourceUpdate(BaseModel):
    transcription: Optional[str] = None
    title: Optional[str] = None


def _source_dict(source: Source) -> dict:
    """Serialize a Source ORM instance to a plain dict matching SourceResponse.
    Excludes the embedding vector (too large / not part of the public schema)."""
    def _iso(val: Optional[datetime]) -> Optional[str]:
        return val.isoformat() if val is not None else None

    return {
        "id": source.id,
        "original_filename": source.original_filename,
        "stored_filename": source.stored_filename,
        "file_path": source.file_path,
        "file_size": source.file_size,
        "content_type": source.content_type,
        "uploaded_at": _iso(source.uploaded_at),
        "transcription": source.transcription,
        "title": source.title,
        "summary": source.summary,
        "keywords": source.keywords,
        "people": source.people,
        "locations": source.locations,
        "timeline": source.timeline,
        "indexed_at": _iso(source.indexed_at),
    }


class SearchRequest(BaseModel):
    query: str
    limit: int = 5


@router.post("/search")
def search_sources(data: SearchRequest, db: Session = Depends(get_db)) -> list[dict]:
    embedding = embed(data.query)
    embedding_str = "[" + ",".join(str(x) for x in embedding) + "]"

    rows = hybrid_search(db, data.query, embedding_str, limit=data.limit)

    results: list[dict] = []
    for row in rows:
        source = db.query(Source).filter(Source.id == row.id).first()
        if source:
            d = _source_dict(source)
            d["score"] = row.combined_score
            results.append(d)

    return results


@router.post("/upload", response_model=SourceResponse, status_code=201)
async def upload_source(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
) -> SourceResponse:
    os.makedirs(UPLOAD_DIR, exist_ok=True)

    stored_filename = f"{uuid.uuid4()}_{file.filename}"
    file_path = os.path.join(UPLOAD_DIR, stored_filename)

    contents = await file.read()
    file_size = len(contents)

    try:
        with open(file_path, "wb") as f:
            f.write(contents)
    except OSError as e:
        raise HTTPException(status_code=500, detail=f"Failed to save file: {e}")

    source = Source(
        id=str(uuid.uuid4()),
        original_filename=file.filename,
        stored_filename=stored_filename,
        file_path=file_path,
        file_size=file_size,
        content_type=file.content_type or "application/octet-stream",
        uploaded_at=datetime.now(timezone.utc),
    )
    db.add(source)
    db.commit()
    db.refresh(source)

    return source


@router.get("/", response_model=list[SourceResponse])
def get_sources(db: Session = Depends(get_db)):
    return db.query(Source).order_by(Source.uploaded_at.desc()).all()


@router.delete("/{source_id}", status_code=204)
def delete_source(source_id: str, db: Session = Depends(get_db)):
    source = db.query(Source).filter(Source.id == source_id).first()
    if not source:
        raise HTTPException(status_code=404, detail="Source not found")

    try:
        if os.path.exists(source.file_path):
            os.remove(source.file_path)
    except OSError as e:
        print(f"Error deleting file {source.file_path}: {e}")

    db.delete(source)
    db.commit()


@router.patch("/{source_id}", response_model=SourceResponse)
def update_source(source_id: str, update_data: SourceUpdate, db: Session = Depends(get_db)):
    source = db.query(Source).filter(Source.id == source_id).first()
    if not source:
        raise HTTPException(status_code=404, detail="Source not found")

    if update_data.transcription is not None:
        source.transcription = update_data.transcription
    if update_data.title is not None:
        source.title = update_data.title

    db.commit()
    db.refresh(source)
    return source


@router.post("/{source_id}/transcribe", response_model=SourceResponse)
def transcribe_source(source_id: str, db: Session = Depends(get_db)):
    source = db.query(Source).filter(Source.id == source_id).first()
    if not source:
        raise HTTPException(status_code=404, detail="Source not found")

    try:
        result = transcribe(source.file_path, source.content_type, source.original_filename)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Transcription failed: {e}")

    source.transcription = result
    db.commit()
    db.refresh(source)
    return source


@router.post("/{source_id}/index", response_model=SourceResponse)
def index_source_endpoint(source_id: str, db: Session = Depends(get_db)):
    source = db.query(Source).filter(Source.id == source_id).first()
    if not source:
        raise HTTPException(status_code=404, detail="Source not found")

    if not source.transcription:
        raise HTTPException(status_code=400, detail="Source must be transcribed before indexing.")

    try:
        result = index_source(source.transcription, existing_title=source.title or None)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Indexing failed: {e}")

    source.title = result["title"]
    source.summary = result["summary"]
    source.keywords = result["keywords"]
    source.people = result["people"]
    source.locations = result["locations"]
    source.timeline = result["timeline"]
    source.embedding = result["embedding"]
    source.indexed_at = datetime.now(timezone.utc)

    db.commit()
    db.refresh(source)
    return source


@router.post("/{source_id}/transcribe/stream")
def transcribe_source_stream(source_id: str) -> StreamingResponse:
    def generate():
        from database import SessionLocal
        db = SessionLocal()
        try:
            source = db.query(Source).filter(Source.id == source_id).first()
            if not source:
                yield f"data: {json.dumps({'type': 'error', 'message': 'Source not found'})}\n\n"
                return

            full_text = ""
            for event in transcribe_stream(source.file_path, source.content_type, source.original_filename):
                if event["type"] == "token":
                    full_text += event["text"]
                yield f"data: {json.dumps(event)}\n\n"

            source.transcription = full_text
            db.commit()
            db.refresh(source)
            yield f"data: {json.dumps({'type': 'done', 'source': _source_dict(source)})}\n\n"
        except Exception as e:
            yield f"data: {json.dumps({'type': 'error', 'message': str(e)})}\n\n"
        finally:
            db.close()

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@router.post("/{source_id}/index/stream")
def index_source_stream(source_id: str) -> StreamingResponse:
    def generate():
        from database import SessionLocal
        db = SessionLocal()
        try:
            source = db.query(Source).filter(Source.id == source_id).first()
            if not source:
                yield f"data: {json.dumps({'type': 'error', 'message': 'Source not found'})}\n\n"
                return
            if not source.transcription:
                yield f"data: {json.dumps({'type': 'error', 'message': 'Source must be transcribed before indexing.'})}\n\n"
                return

            msg_extract = json.dumps({"type": "status", "message": "Extracting metadata\u2026"})
            yield f"data: {msg_extract}\n\n"
            metadata = extract_metadata(source.transcription, existing_title=source.title or None)

            msg_embed = json.dumps({"type": "status", "message": "Generating embedding\u2026"})
            yield f"data: {msg_embed}\n\n"
            embedding = embed(source.transcription)

            msg_save = json.dumps({"type": "status", "message": "Saving to database\u2026"})
            yield f"data: {msg_save}\n\n"
            source.title = metadata["title"]
            source.summary = metadata["summary"]
            source.keywords = metadata["keywords"]
            source.people = metadata["people"]
            source.locations = metadata["locations"]
            source.timeline = metadata["timeline"]
            source.embedding = embedding
            source.indexed_at = datetime.now(timezone.utc)
            db.commit()
            db.refresh(source)

            yield f"data: {json.dumps({'type': 'done', 'source': _source_dict(source)})}\n\n"
        except Exception as e:
            yield f"data: {json.dumps({'type': 'error', 'message': str(e)})}\n\n"
        finally:
            db.close()

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@router.post("/{source_id}/convert-to-audio")
def convert_video_to_audio(source_id: str, db: Session = Depends(get_db)) -> dict:
    source = db.query(Source).filter(Source.id == source_id).first()
    if not source:
        raise HTTPException(status_code=404, detail="Source not found")

    if not source.content_type.startswith("video/"):
        raise HTTPException(
            status_code=400,
            detail=f"Source is not a video (content_type={source.content_type!r})",
        )

    # Derive the UUID prefix from the stored video filename so the mp3 is traceable.
    uuid_prefix = source.stored_filename.split("_")[0]
    mp3_filename = f"{uuid_prefix}.mp3"
    mp3_path = os.path.join(UPLOAD_DIR, mp3_filename)

    try:
        subprocess.run(
            [
                "ffmpeg",
                "-i", source.file_path,
                "-vn",
                "-acodec", "libmp3lame",
                "-q:a", "2",
                mp3_path,
                "-y",
            ],
            check=True,
            capture_output=True,
        )
    except subprocess.CalledProcessError as e:
        raise HTTPException(
            status_code=500,
            detail=f"ffmpeg failed: {e.stderr.decode(errors='replace')}",
        )

    try:
        mp3_size = os.path.getsize(mp3_path)
    except OSError as e:
        raise HTTPException(status_code=500, detail=f"Could not stat output file: {e}")

    # Derive the original audio filename from the video's original filename.
    video_stem = os.path.splitext(source.original_filename)[0]
    audio_original_filename = f"{video_stem}.mp3"

    audio_source = Source(
        id=str(uuid.uuid4()),
        original_filename=audio_original_filename,
        stored_filename=mp3_filename,
        file_path=mp3_path,
        file_size=mp3_size,
        content_type="audio/mpeg",
        uploaded_at=datetime.now(timezone.utc),
    )
    db.add(audio_source)

    # Clean up the original video record and file.
    video_file_path = source.file_path
    db.delete(source)
    db.commit()

    try:
        if os.path.exists(video_file_path):
            os.remove(video_file_path)
    except OSError as e:
        print(f"Warning: could not delete video file {video_file_path}: {e}")

    db.refresh(audio_source)
    return _source_dict(audio_source)
