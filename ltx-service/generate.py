"""LTX-Video 2.3 generation via fal.ai API.

Uses async job submission to avoid blocking the FastAPI server.
fal.ai endpoint: fal-ai/ltx-2/text-to-video
"""

import os
import uuid
import asyncio
import logging
from pathlib import Path
from typing import Literal

import fal_client
from dotenv import load_dotenv

from prompts import SCENE_PROMPTS

load_dotenv()

logger = logging.getLogger(__name__)

OUTPUTS_DIR = Path(__file__).parent / "outputs"
OUTPUTS_DIR.mkdir(exist_ok=True)

FAL_MODEL = "fal-ai/ltx-2/text-to-video"

# In-memory job store (replace with Redis for production)
_jobs: dict[str, dict] = {}


async def submit_generation(scene: str) -> str:
    """Submit an async LTX-Video generation job. Returns job_id."""
    if scene not in SCENE_PROMPTS:
        raise ValueError(f"Unknown scene: {scene}. Available: {list(SCENE_PROMPTS.keys())}")

    scene_config = SCENE_PROMPTS[scene]
    job_id = f"{scene}-{uuid.uuid4().hex[:8]}"
    _jobs[job_id] = {"status": "queued", "scene": scene, "video_path": None, "error": None}

    # Launch background task
    asyncio.create_task(_run_generation(job_id, scene_config, scene))
    return job_id


async def _run_generation(job_id: str, config: dict, scene: str) -> None:
    """Background task: calls fal.ai, downloads video, updates job state."""
    _jobs[job_id]["status"] = "running"
    try:
        logger.info(f"[{job_id}] Submitting to fal.ai: {FAL_MODEL}")

        result = await asyncio.to_thread(
            fal_client.run,
            FAL_MODEL,
            arguments={
                "prompt": config["prompt"],
                "negative_prompt": config.get("negative_prompt", ""),
                "num_inference_steps": 40,
                "guidance_scale": 3.5,
                "num_frames": config.get("duration", 10) * 24,
                "resolution": config.get("resolution", "768x432"),
                "seed": None,
            },
        )

        video_url: str = result["video"]["url"]
        logger.info(f"[{job_id}] Generation complete. Downloading from {video_url}")

        # Download the video
        output_path = OUTPUTS_DIR / f"{job_id}.mp4"
        await _download_file(video_url, output_path)

        _jobs[job_id]["status"] = "done"
        _jobs[job_id]["video_path"] = str(output_path)
        logger.info(f"[{job_id}] Saved to {output_path}")

    except Exception as exc:
        logger.exception(f"[{job_id}] Generation failed")
        _jobs[job_id]["status"] = "error"
        _jobs[job_id]["error"] = str(exc)


async def _download_file(url: str, dest: Path) -> None:
    """Download a file from a URL to a local path."""
    import httpx
    async with httpx.AsyncClient(timeout=120) as client:
        async with client.stream("GET", url) as response:
            response.raise_for_status()
            with open(dest, "wb") as f:
                async for chunk in response.aiter_bytes(chunk_size=65536):
                    f.write(chunk)


def get_job_status(job_id: str) -> dict | None:
    """Return job status dict, or None if job_id unknown."""
    return _jobs.get(job_id)
