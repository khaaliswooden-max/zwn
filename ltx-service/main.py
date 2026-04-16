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
from pydantic import BaseModel, field_validator

from generate import submit_generation, get_job_status
from prompts import AVAILABLE_SCENES

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


@app.get("/health")
async def health() -> dict:
    fal_key_set = bool(os.getenv("FAL_KEY"))
    return {"ok": True, "fal_key_configured": fal_key_set}


@app.get("/scenes")
async def list_scenes() -> dict:
    return {"scenes": AVAILABLE_SCENES}


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
