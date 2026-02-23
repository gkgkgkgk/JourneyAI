import uuid
from datetime import datetime, timezone
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func
from pydantic import BaseModel
from database import get_db
from models import Chapter

router = APIRouter(prefix="/api/chapters", tags=["chapters"])


class ChapterCreate(BaseModel):
    title: Optional[str] = None
    content: str = ""


class ChapterUpdate(BaseModel):
    title: Optional[str] = None
    content: Optional[str] = None


class ChapterReorder(BaseModel):
    order_index: int


class ChapterResponse(BaseModel):
    id: str
    title: Optional[str] = None
    content: str
    order_index: int
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


@router.get("/", response_model=list[ChapterResponse])
def get_chapters(db: Session = Depends(get_db)):
    return db.query(Chapter).order_by(Chapter.order_index).all()


@router.post("/", response_model=ChapterResponse, status_code=201)
def create_chapter(data: ChapterCreate, db: Session = Depends(get_db)):
    # Place new chapter at the end
    max_order = db.query(func.max(Chapter.order_index)).scalar() or -1
    now = datetime.now(timezone.utc)
    chapter = Chapter(
        id=str(uuid.uuid4()),
        title=data.title,
        content=data.content,
        order_index=max_order + 1,
        created_at=now,
        updated_at=now,
    )
    db.add(chapter)
    db.commit()
    db.refresh(chapter)
    return chapter


@router.patch("/{chapter_id}", response_model=ChapterResponse)
def update_chapter(chapter_id: str, data: ChapterUpdate, db: Session = Depends(get_db)):
    chapter = db.query(Chapter).filter(Chapter.id == chapter_id).first()
    if not chapter:
        raise HTTPException(status_code=404, detail="Chapter not found")

    if data.title is not None:
        chapter.title = data.title
    if data.content is not None:
        chapter.content = data.content
    chapter.updated_at = datetime.now(timezone.utc)

    db.commit()
    db.refresh(chapter)
    return chapter


@router.patch("/{chapter_id}/reorder", response_model=list[ChapterResponse])
def reorder_chapter(chapter_id: str, data: ChapterReorder, db: Session = Depends(get_db)):
    """Move a chapter to a new position; shifts others to fill the gap."""
    chapter = db.query(Chapter).filter(Chapter.id == chapter_id).first()
    if not chapter:
        raise HTTPException(status_code=404, detail="Chapter not found")

    old_idx = chapter.order_index
    new_idx = data.order_index

    if old_idx == new_idx:
        return db.query(Chapter).order_by(Chapter.order_index).all()

    # Shift the chapters between old and new positions
    if new_idx < old_idx:
        db.query(Chapter).filter(
            Chapter.order_index >= new_idx,
            Chapter.order_index < old_idx,
        ).update({"order_index": Chapter.order_index + 1})
    else:
        db.query(Chapter).filter(
            Chapter.order_index > old_idx,
            Chapter.order_index <= new_idx,
        ).update({"order_index": Chapter.order_index - 1})

    chapter.order_index = new_idx
    db.commit()
    return db.query(Chapter).order_by(Chapter.order_index).all()


@router.delete("/{chapter_id}", status_code=204)
def delete_chapter(chapter_id: str, db: Session = Depends(get_db)):
    chapter = db.query(Chapter).filter(Chapter.id == chapter_id).first()
    if not chapter:
        raise HTTPException(status_code=404, detail="Chapter not found")
    deleted_order = chapter.order_index
    db.delete(chapter)
    # Close the gap
    db.query(Chapter).filter(Chapter.order_index > deleted_order).update(
        {"order_index": Chapter.order_index - 1}
    )
    db.commit()
