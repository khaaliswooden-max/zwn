"""Anomaly detection inference — loads a trained VAE and scores new state vectors."""
from __future__ import annotations

import json
import logging
from pathlib import Path

import numpy as np
import torch

from src import config
from src.models.vae_anomaly import VAEAnomalyDetector, compute_anomaly_score
from src.training.anomaly_trainer import NormalizationParams

logger = logging.getLogger(__name__)


class AnomalyDetectorInstance:
    """Loaded model instance ready for inference."""

    def __init__(
        self,
        model: VAEAnomalyDetector,
        norm: NormalizationParams,
        threshold: float,
        metadata: dict,
    ) -> None:
        self.model = model
        self.norm = norm
        self.threshold = threshold
        self.metadata = metadata
        self.model.eval()

    def score(self, features: list[float], n_samples: int = 10) -> dict:
        """Score a single state vector.

        Returns:
            {
                "anomaly_score": float (0.0-1.0, normalized),
                "raw_score": float (unnormalized reconstruction error),
                "is_anomaly": bool,
                "threshold": float,
                "model_version": int,
            }
        """
        x = np.array([features], dtype=np.float32)
        x_norm = self.norm.normalize(x)
        x_tensor = torch.tensor(x_norm, dtype=torch.float32)

        raw_score = float(compute_anomaly_score(self.model, x_tensor, n_samples=n_samples)[0])

        # Normalize to [0, 1] using sigmoid centered on threshold
        # score < threshold → low anomaly (< 0.5)
        # score > threshold → high anomaly (> 0.5)
        if self.threshold > 0:
            normalized = 1.0 / (1.0 + np.exp(-(raw_score - self.threshold) / (self.threshold * 0.5)))
        else:
            normalized = min(raw_score, 1.0)

        return {
            "anomaly_score": round(float(normalized), 6),
            "raw_score": round(raw_score, 6),
            "is_anomaly": raw_score > self.threshold,
            "threshold": round(self.threshold, 6),
            "model_version": self.metadata.get("version", 0),
        }

    def score_batch(self, feature_matrix: list[list[float]], n_samples: int = 10) -> list[dict]:
        """Score multiple state vectors at once."""
        x = np.array(feature_matrix, dtype=np.float32)
        x_norm = self.norm.normalize(x)
        x_tensor = torch.tensor(x_norm, dtype=torch.float32)

        raw_scores = compute_anomaly_score(self.model, x_tensor, n_samples=n_samples)

        results = []
        for raw in raw_scores.tolist():
            if self.threshold > 0:
                normalized = 1.0 / (1.0 + np.exp(-(raw - self.threshold) / (self.threshold * 0.5)))
            else:
                normalized = min(raw, 1.0)
            results.append({
                "anomaly_score": round(float(normalized), 6),
                "raw_score": round(raw, 6),
                "is_anomaly": raw > self.threshold,
                "threshold": round(self.threshold, 6),
                "model_version": self.metadata.get("version", 0),
            })
        return results


class ModelRegistry:
    """Manages loaded model instances. Loads from disk on startup, supports hot-reload."""

    def __init__(self) -> None:
        self._models: dict[str, AnomalyDetectorInstance] = {}

    def load(self, model_name: str) -> AnomalyDetectorInstance | None:
        """Load a model from MODEL_DIR/<model_name>/."""
        model_dir = config.MODEL_DIR / model_name
        if not model_dir.exists():
            logger.warning("Model directory not found: %s", model_dir)
            return None

        meta_path = model_dir / "metadata.json"
        if not meta_path.exists():
            logger.warning("No metadata.json in %s", model_dir)
            return None

        metadata = json.loads(meta_path.read_text())

        model = VAEAnomalyDetector(
            input_dim=metadata["input_dim"],
            hidden_dim=metadata["hidden_dim"],
            latent_dim=metadata["latent_dim"],
        )
        model.load_state_dict(torch.load(model_dir / "model.pt", weights_only=True))
        model.eval()

        norm = NormalizationParams.load(model_dir / "norm_params.npz")
        threshold = metadata["anomaly_threshold"]

        instance = AnomalyDetectorInstance(model, norm, threshold, metadata)
        self._models[model_name] = instance
        logger.info("Loaded model '%s' (version %s)", model_name, metadata.get("version"))
        return instance

    def get(self, model_name: str) -> AnomalyDetectorInstance | None:
        """Get a loaded model, or try to load it from disk."""
        if model_name not in self._models:
            return self.load(model_name)
        return self._models.get(model_name)

    def reload(self, model_name: str) -> AnomalyDetectorInstance | None:
        """Force-reload a model from disk (e.g., after retraining)."""
        self._models.pop(model_name, None)
        return self.load(model_name)

    def list_models(self) -> list[dict]:
        """List all available models (loaded and on-disk)."""
        results = []
        if config.MODEL_DIR.exists():
            for d in config.MODEL_DIR.iterdir():
                if d.is_dir() and (d / "metadata.json").exists():
                    meta = json.loads((d / "metadata.json").read_text())
                    meta["loaded"] = d.name in self._models
                    results.append(meta)
        return results


# Global singleton
registry = ModelRegistry()
