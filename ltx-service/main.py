"""LTX-Video 2.3 generation service for ZWM.

Start: uvicorn main:app --host 0.0.0.0 --port 8100 --reload

Endpoints:
  POST /generate       { "scene": "world-nebula" } → { "job_id": "...", "status": "queued" }
  GET  /status/{id}    → { "status": "done|running|queued|error", "video_path": "...", "error": "..." }
  GET  /scenes         → list of available scene names
  GET  /health         → { "ok": true }
"""

import logging
import os
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel, field_validator

from generate import submit_generation, get_job_status, get_preview_path
from prompts import AVAILABLE_SCENES, SCENE_PROMPTS

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")

app = FastAPI(title="LTX-Video ZWM Service", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "https://zwn.zuup.org"],
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)


class GenerateRequest(BaseModel):
    scene: str

    @field_validator("scene")
    @classmethod
    def validate_scene(cls, v: str) -> str:
        if v not in AVAILABLE_SCENES:
            raise ValueError(f"Unknown scene '{v}'. Available: {AVAILABLE_SCENES}")
        return v


class GenerateResponse(BaseModel):
    job_id: str
    status: str


class StatusResponse(BaseModel):
    status: str
    scene: str | None = None
    video_path: str | None = None
    error: str | None = None
    # Live countdown for UI spinners. 0 once the job leaves the running state.
    eta_seconds: float | None = None
    estimated_seconds: float | None = None


@app.get("/health")
async def health() -> dict:
    fal_key_set = bool(os.getenv("FAL_KEY"))
    return {"ok": True, "fal_key_configured": fal_key_set}


@app.get("/scenes")
async def list_scenes() -> dict:
    """Return scene names, plus per-scene metadata for gallery UIs."""
    scenes = [
        {
            "name": name,
            "duration": cfg.get("duration", 8),
            "resolution": cfg.get("resolution", "768x432"),
            "estimated_seconds": cfg.get("estimated_seconds", 60),
        }
        for name, cfg in SCENE_PROMPTS.items()
    ]
    return {"scenes": scenes}


@app.get("/preview/{scene}")
async def get_preview(scene: str) -> FileResponse:
    """Serve the first-frame PNG for a scene, if one has been cached."""
    if scene not in AVAILABLE_SCENES:
        raise HTTPException(status_code=404, detail=f"Unknown scene '{scene}'")
    path = get_preview_path(scene)
    if path is None:
        # 404 is the expected silent fallback — the UI degrades to a color block.
        raise HTTPException(status_code=404, detail=f"No preview available for '{scene}'")
    return FileResponse(path, media_type="image/png")


@app.post("/generate", response_model=GenerateResponse)
async def generate(req: GenerateRequest) -> GenerateResponse:
    if not os.getenv("FAL_KEY"):
        raise HTTPException(
            status_code=503,
            detail="FAL_KEY not configured. Set it in ltx-service/.env",
        )
    job_id = await submit_generation(req.scene)
    return GenerateResponse(job_id=job_id, status="queued")


@app.get("/status/{job_id}", response_model=StatusResponse)
async def get_status(job_id: str) -> StatusResponse:
    job = get_job_status(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail=f"Job '{job_id}' not found")
    return StatusResponse(**job)
