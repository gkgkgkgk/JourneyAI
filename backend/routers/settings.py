import json
import os
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional

router = APIRouter(prefix="/api/settings", tags=["settings"])

SETTINGS_PATH = "/app/settings.json"

DEFAULTS = {
    "theme": "dark",
    "system_prompt": "",
    "reading_notes": "",
}


def _read() -> dict:
    if not os.path.exists(SETTINGS_PATH):
        return dict(DEFAULTS)
    try:
        with open(SETTINGS_PATH, "r") as f:
            data = json.load(f)
        # Merge with defaults so missing keys are always present
        return {**DEFAULTS, **data}
    except (json.JSONDecodeError, OSError):
        return dict(DEFAULTS)


def _write(data: dict) -> None:
    try:
        with open(SETTINGS_PATH, "w") as f:
            json.dump(data, f, indent=2)
    except OSError as e:
        raise HTTPException(status_code=500, detail=f"Failed to save settings: {e}")


def build_author_context(settings: dict) -> str:
    """Compose the full author-provided context block from settings.
    Returns an empty string if neither field is set."""
    context = settings.get("system_prompt", "").strip()
    notes = settings.get("reading_notes", "").strip()

    parts = []
    if context:
        parts.append(f"Project context provided by the author:\n{context}")
    if notes:
        parts.append(
            f"Archivist's notes — additional guidance for interpreting the source material:\n{notes}"
        )
    return "\n\n".join(parts)


class SettingsResponse(BaseModel):
    theme: str
    system_prompt: str
    reading_notes: str


class SettingsUpdate(BaseModel):
    theme: Optional[str] = None
    system_prompt: Optional[str] = None
    reading_notes: Optional[str] = None


@router.get("/", response_model=SettingsResponse)
def get_settings():
    return _read()


@router.patch("/", response_model=SettingsResponse)
def update_settings(data: SettingsUpdate):
    current = _read()
    if data.theme is not None:
        if data.theme not in ("dark", "light"):
            raise HTTPException(status_code=400, detail="theme must be 'dark' or 'light'")
        current["theme"] = data.theme
    if data.system_prompt is not None:
        current["system_prompt"] = data.system_prompt
    if data.reading_notes is not None:
        current["reading_notes"] = data.reading_notes
    _write(current)
    return current
