from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from database import init_db
from routers import upload, notes, settings, chapters, chat, cite
import os

os.makedirs("/app/uploads", exist_ok=True)

init_db()

app = FastAPI(title="Journey API", version="0.1.0")

app.mount("/uploads", StaticFiles(directory="/app/uploads"), name="uploads")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(upload.router)
app.include_router(notes.router)
app.include_router(settings.router)
app.include_router(chapters.router)
app.include_router(chat.router)
app.include_router(cite.router)


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}
