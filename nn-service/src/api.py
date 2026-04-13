"""nn-service FastAPI application.

Endpoints:
  POST /detect/anomaly         — Score a state vector for anomalies
  POST /detect/anomaly/batch   — Score multiple state vectors
  POST /train/trigger          — Trigger model retraining from Neo4j data
  POST /models/reload          — Hot-reload a model from disk
  GET  /models/status          — List all models and their metadata
  GET  /health                 — Liveness check
"""
from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

from src import config
from src.inference.anomaly_detector import registry
from src.training.anomaly_trainer import train_biological_vae

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(name)s] %(levelname)s — %(message)s",
)
logger = logging.getLogger("nn-service")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Load models on startup."""
    logger.info("nn-service starting on %s:%d", config.HOST, config.PORT)
    # Try to load pre-trained models
    for model_name in ("biological_vae", "cross_platform_vae"):
        instance = registry.load(model_name)
        if instance:
            logger.info("Pre-loaded model: %s", model_name)
        else:
            logger.info("No pre-trained model found for '%s' — train first", model_name)
    yield
    logger.info("nn-service shutting down")


app = FastAPI(
    title="ZWM Neural Network Service",
    version="0.1.0",
    lifespan=lifespan,
)


# ---------------------------------------------------------------------------
# Request / Response models
# ---------------------------------------------------------------------------

class AnomalyRequest(BaseModel):
    model_name: str = Field(default="biological_vae", description="Which trained model to use")
    features: list[float] = Field(description="State vector (e.g., [serotonin, dopamine, cortisol, gaba])")
    n_samples: int = Field(default=10, ge=1, le=100, description="Monte Carlo samples for scoring")
    entity_id: str | None = Field(default=None, description="Entity ID for audit trail")
    substrate_event_id: str | None = Field(default=None, description="SubstrateEvent that triggered this detection")


class AnomalyResponse(BaseModel):
    anomaly_score: float = Field(description="Normalized score 0.0-1.0 (higher = more anomalous)")
    raw_score: float = Field(description="Unnormalized reconstruction error")
    is_anomaly: bool = Field(description="Whether raw_score exceeds trained threshold")
    threshold: float = Field(description="Training-set percentile threshold")
    model_version: int = Field(description="Model checkpoint version (Unix timestamp)")
    entity_id: str | None = None
    substrate_event_id: str | None = None


class BatchAnomalyRequest(BaseModel):
    model_name: str = "biological_vae"
    feature_matrix: list[list[float]] = Field(description="Matrix of state vectors (one row per sample)")
    n_samples: int = Field(default=10, ge=1, le=100)


class TrainRequest(BaseModel):
    model_name: str = "biological_vae"
    substrate: str = Field(default="biological", description="Which substrate to train on")


class ReloadRequest(BaseModel):
    model_name: str = "biological_vae"


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@app.post("/detect/anomaly", response_model=AnomalyResponse)
async def detect_anomaly(req: AnomalyRequest) -> AnomalyResponse:
    """Score a single state vector for anomalies."""
    model = registry.get(req.model_name)
    if model is None:
        raise HTTPException(
            status_code=503,
            detail=f"Model '{req.model_name}' not loaded. Train it first via POST /train/trigger",
        )

    expected_dim = model.metadata["input_dim"]
    if len(req.features) != expected_dim:
        raise HTTPException(
            status_code=422,
            detail=f"Expected {expected_dim} features, got {len(req.features)}",
        )

    result = model.score(req.features, n_samples=req.n_samples)
    return AnomalyResponse(
        **result,
        entity_id=req.entity_id,
        substrate_event_id=req.substrate_event_id,
    )


@app.post("/detect/anomaly/batch")
async def detect_anomaly_batch(req: BatchAnomalyRequest) -> list[dict]:
    """Score multiple state vectors at once."""
    model = registry.get(req.model_name)
    if model is None:
        raise HTTPException(
            status_code=503,
            detail=f"Model '{req.model_name}' not loaded",
        )

    expected_dim = model.metadata["input_dim"]
    for i, row in enumerate(req.feature_matrix):
        if len(row) != expected_dim:
            raise HTTPException(
                status_code=422,
                detail=f"Row {i}: expected {expected_dim} features, got {len(row)}",
            )

    return model.score_batch(req.feature_matrix, n_samples=req.n_samples)


@app.post("/train/trigger")
async def trigger_training(req: TrainRequest) -> dict:
    """Trigger model retraining from Neo4j data.

    This is a synchronous operation — for production, run via a background
    worker or cron job instead of blocking the API.
    """
    if req.substrate == "biological":
        try:
            metadata = train_biological_vae(model_name=req.model_name)
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e))
        # Hot-reload the newly trained model
        registry.reload(req.model_name)
        return {"status": "ok", "metadata": metadata}
    else:
        raise HTTPException(
            status_code=400,
            detail=f"Training not yet implemented for substrate '{req.substrate}'",
        )


@app.post("/models/reload")
async def reload_model(req: ReloadRequest) -> dict:
    """Hot-reload a model from disk (e.g., after external retraining)."""
    instance = registry.reload(req.model_name)
    if instance is None:
        raise HTTPException(status_code=404, detail=f"Model '{req.model_name}' not found on disk")
    return {"status": "ok", "model_name": req.model_name, "version": instance.metadata.get("version")}


@app.get("/models/status")
async def models_status() -> list[dict]:
    """List all available models and their metadata."""
    return registry.list_models()


@app.get("/health")
async def health() -> dict:
    """Liveness check."""
    models = registry.list_models()
    loaded_count = sum(1 for m in models if m.get("loaded"))
    return {
        "status": "ok",
        "models_available": len(models),
        "models_loaded": loaded_count,
    }
