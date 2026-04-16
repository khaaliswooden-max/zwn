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
from src.karpathy.karpathy_detector import karpathy_registry
from src.karpathy.karpathy_trainer import KarpathyModelType, KarpathyTrainConfig, train_karpathy_model
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
    # Pre-load Karpathy models
    for model_name in ("zwm_nanogpt", "zwm_wavenet"):
        instance = karpathy_registry.load(model_name)
        if instance:
            logger.info("Pre-loaded Karpathy model: %s", model_name)
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
    karpathy_models = karpathy_registry.list_models()
    loaded_count = sum(1 for m in models if m.get("loaded"))
    karpathy_loaded = sum(1 for m in karpathy_models if m.get("loaded"))
    return {
        "status": "ok",
        "models_available": len(models) + len(karpathy_models),
        "models_loaded": loaded_count + karpathy_loaded,
        "vae_models": len(models),
        "karpathy_models": len(karpathy_models),
    }


# ---------------------------------------------------------------------------
# Karpathy Loop endpoints
# ---------------------------------------------------------------------------

class KarpathyTrainRequest(BaseModel):
    model_name: str = Field(default="zwm_nanogpt", description="Name for the trained model")
    model_type: str = Field(
        default="nanogpt",
        description="One of: bigram, mlp, wavenet, nanogpt",
    )
    use_synthetic_data: bool = Field(
        default=False,
        description="Use synthetic Markov data instead of Neo4j (for dev/testing)",
    )
    n_synthetic_actors: int = Field(default=100, ge=10, le=10000)


class KarpathyDetectRequest(BaseModel):
    model_name: str = Field(default="zwm_nanogpt")
    event_sequence: list[str] = Field(
        description="Ordered event types; last element is scored, preceding are context",
        min_length=2,
    )
    entity_id: str | None = Field(default=None, description="Entity ID for audit trail")
    substrate_event_id: str | None = Field(default=None, description="SubstrateEvent that triggered this")


class KarpathyDetectResponse(BaseModel):
    anomaly_score: float = Field(description="Normalized score 0.0-1.0 (higher = more anomalous)")
    raw_score: float = Field(description="Raw cross-entropy prediction loss")
    is_anomaly: bool = Field(description="Whether raw_score exceeds trained threshold")
    threshold: float
    model_version: int
    scored_event: str = Field(description="The event that was scored (last in sequence)")
    context_events: list[str] = Field(description="Preceding events used as context")
    entity_id: str | None = None
    substrate_event_id: str | None = None


@app.post("/karpathy/train")
async def karpathy_train(req: KarpathyTrainRequest) -> dict:
    """Train a Karpathy Loop sequence model on ZWM SubstrateEvent data."""
    try:
        model_type = KarpathyModelType(req.model_type)
    except ValueError:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid model_type '{req.model_type}'. Must be one of: bigram, mlp, wavenet, nanogpt",
        )

    train_config = KarpathyTrainConfig(
        model_type=model_type,
        use_synthetic_data=req.use_synthetic_data,
        n_synthetic_actors=req.n_synthetic_actors,
    )
    try:
        metadata = train_karpathy_model(model_name=req.model_name, train_config=train_config)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    karpathy_registry.reload(req.model_name)
    return {"status": "ok", "metadata": metadata}


@app.post("/karpathy/detect", response_model=KarpathyDetectResponse)
async def karpathy_detect(req: KarpathyDetectRequest) -> KarpathyDetectResponse:
    """Score the last event in a sequence for anomalousness using prediction error."""
    model = karpathy_registry.get(req.model_name)
    if model is None:
        raise HTTPException(
            status_code=503,
            detail=f"Karpathy model '{req.model_name}' not loaded. Train via POST /karpathy/train",
        )

    result = model.score(req.event_sequence)
    return KarpathyDetectResponse(
        **result,
        scored_event=req.event_sequence[-1],
        context_events=req.event_sequence[:-1],
        entity_id=req.entity_id,
        substrate_event_id=req.substrate_event_id,
    )


@app.get("/karpathy/status")
async def karpathy_status() -> list[dict]:
    """List loaded Karpathy models and their metadata."""
    return karpathy_registry.list_models()
