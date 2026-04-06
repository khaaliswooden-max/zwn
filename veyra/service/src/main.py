"""Veyra ZWM service — FastAPI entry point.

Listens on VEYRA_INGEST_URL (default port 8004).
Accepts POST /zwm/ingest with action=TRIGGER_REASONING.
"""
import logging
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

from src.reasoning.engine import ReasoningEngine

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(name)s %(levelname)s %(message)s",
)
logger = logging.getLogger(__name__)

_engine: ReasoningEngine | None = None


@asynccontextmanager
async def lifespan(app: FastAPI):  # type: ignore[type-arg]
    global _engine
    _engine = ReasoningEngine()
    port = os.getenv("PORT", "8004")
    logger.info("[veyra] service started on port %s", port)
    yield
    logger.info("[veyra] service shutting down")


app = FastAPI(title="Veyra ZWM Service", version="1.0.0", lifespan=lifespan)


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------


class IngestRequest(BaseModel):
    action: str
    params: dict
    triggerEventId: str


class IngestResponse(BaseModel):
    eventId: str
    status: str


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------


@app.post("/zwm/ingest", response_model=IngestResponse)
async def ingest(body: IngestRequest) -> IngestResponse:
    if body.action != "TRIGGER_REASONING":
        raise HTTPException(status_code=400, detail=f"Unknown action: {body.action}")

    assert _engine is not None, "Engine not initialized"
    result = await _engine.trigger_reasoning(body.params, body.triggerEventId)
    return IngestResponse(eventId=result["eventId"], status=result["status"])


@app.get("/health")
async def health() -> dict:
    return {"status": "ok"}
