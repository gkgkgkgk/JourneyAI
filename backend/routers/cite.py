from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session
import json, os
from openai import OpenAI
from database import get_db
from models import Source

router = APIRouter(prefix="/api/cite", tags=["cite"])

class CiteAnalyzeRequest(BaseModel):
    text: str           # the selected text from the author's note
    source_ids: list[str]   # IDs of sources to check against

@router.post("/analyze")
def analyze_citation(data: CiteAnalyzeRequest, db: Session = Depends(get_db)):
    sources = db.query(Source).filter(Source.id.in_(data.source_ids)).all()
    source_context = "\n\n".join(
        f"--- {s.title or 'Untitled'} ---\n{s.transcription}"
        for s in sources if s.transcription
    )
    if not source_context:
        return {"supported": "no", "verdict": "No indexed sources available.", "completion": "", "next_sentence": ""}

    system = """You are a research assistant helping an author verify and extend their writing based on archival sources.

Given a piece of text the author wrote and source materials from their archive, respond with a JSON object with exactly these fields:
{
  "supported": "yes" | "partial" | "no",
  "verdict": "One sentence: do the sources support, partially support, or contradict the text?",
  "completion": "If the text is an incomplete sentence/phrase, complete it naturally using the sources. If already complete, return empty string.",
  "next_sentence": "The most natural next sentence the author could write, drawing on the sources."
}"""

    user = f'Author\'s text: "{data.text}"\n\nSource materials:\n{source_context}'

    client = OpenAI(api_key=os.environ.get("OPENAI_KEY"))
    response = client.chat.completions.create(
        model="gpt-4o",
        messages=[{"role": "system", "content": system}, {"role": "user", "content": user}],
        response_format={"type": "json_object"},
    )
    return json.loads(response.choices[0].message.content)
