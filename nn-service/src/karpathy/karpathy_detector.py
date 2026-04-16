"""Sequence-based anomaly detector using prediction error.

Anomaly signal: high cross-entropy loss on an incoming event given
its preceding context = unexpected event = anomalous.

Input:  a sequence of event type strings (recent history + new event)
Output: same dict shape as AnomalyDetectorInstance.score() for
        uniform handling by downstream consumers (Veyra, causal engine).
"""
from __future__ import annotations

import json
import logging
from pathlib import Path

import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as F

from src import config
from src.karpathy.karpathy_trainer import KarpathyModelType
from src.karpathy.makemore.dataset import EventTokenizer
from src.karpathy.makemore.models import BigramModel, MLPModel, WaveNetModel
from src.karpathy.nanogpt.model import GPT, GPTConfig

logger = logging.getLogger(__name__)


class KarpathyDetector:
    """Scores the last event in a sequence for anomalousness."""

    def __init__(
        self,
        model: nn.Module,
        tokenizer: EventTokenizer,
        threshold: float,
        metadata: dict,
        model_type: KarpathyModelType,
        context_len: int = 8,
    ) -> None:
        self.model = model
        self.tokenizer = tokenizer
        self.threshold = threshold
        self.metadata = metadata
        self.model_type = model_type
        self.context_len = context_len
        self.model.eval()

    def score(self, event_sequence: list[str], context_len: int | None = None) -> dict:
        """Score the LAST event in the sequence given preceding context.

        Returns dict matching AnomalyDetectorInstance.score() shape:
            anomaly_score: float 0.0-1.0 (sigmoid-normalized)
            raw_score: float (cross-entropy loss)
            is_anomaly: bool
            threshold: float
            model_version: int
        """
        if len(event_sequence) < 2:
            return {
                "anomaly_score": 0.0,
                "raw_score": 0.0,
                "is_anomaly": False,
                "threshold": round(self.threshold, 6),
                "model_version": self.metadata.get("version", 0),
            }

        ctx_len = context_len or self.context_len
        raw_score = self._compute_loss(event_sequence, ctx_len)

        # Sigmoid normalization identical to anomaly_detector.py:55-56
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

    def score_batch(self, sequences: list[list[str]], context_len: int | None = None) -> list[dict]:
        return [self.score(seq, context_len) for seq in sequences]

    @torch.no_grad()
    def _compute_loss(self, event_sequence: list[str], ctx_len: int) -> float:
        """Cross-entropy loss on the last event given context."""
        tokens = self.tokenizer.encode_sequence(event_sequence, add_bos=True, add_eos=False)
        target_id = tokens[-1]
        context = tokens[:-1]

        if self.model_type == KarpathyModelType.NANOGPT:
            # Use full sequence for GPT (causal LM)
            block_size = self.metadata.get("block_size", 64)
            if len(context) > block_size:
                context = context[-block_size:]
            x = torch.tensor([context], dtype=torch.long)
            logits, _ = self.model(x)
            logits_last = logits[:, -1, :]
        else:
            # Makemore models: fixed context window
            pad = self.tokenizer.pad_id
            if len(context) > ctx_len:
                context = context[-ctx_len:]
            elif len(context) < ctx_len:
                context = [pad] * (ctx_len - len(context)) + context
            x = torch.tensor([context], dtype=torch.long)
            logits_last = self.model(x)

        target = torch.tensor([target_id], dtype=torch.long)
        loss = F.cross_entropy(logits_last, target)
        return loss.item()

    @classmethod
    def load(cls, model_dir: Path) -> KarpathyDetector | None:
        """Reconstruct detector from saved artifacts."""
        meta_path = model_dir / "metadata.json"
        if not meta_path.exists():
            return None

        metadata = json.loads(meta_path.read_text())
        model_type = KarpathyModelType(metadata["model_type"])
        vocab_size = metadata["vocab_size"]
        context_len = metadata["context_len"]

        # Reconstruct tokenizer
        tok_path = model_dir / "tokenizer.json"
        if tok_path.exists():
            tokenizer = EventTokenizer.from_dict(json.loads(tok_path.read_text()))
        else:
            tokenizer = EventTokenizer()

        # Reconstruct model architecture
        if model_type == KarpathyModelType.BIGRAM:
            model = BigramModel(vocab_size)
            model.load_state_dict(torch.load(model_dir / "model.pt", weights_only=True))
        elif model_type == KarpathyModelType.MLP:
            model = MLPModel(
                vocab_size, context_len,
                emb_dim=metadata.get("emb_dim", 16),
                hidden_dim=metadata.get("hidden_dim", 128),
            )
            model.load_state_dict(torch.load(model_dir / "model.pt", weights_only=True))
        elif model_type == KarpathyModelType.WAVENET:
            model = WaveNetModel(
                vocab_size, context_len,
                emb_dim=metadata.get("emb_dim", 16),
            )
            model.load_state_dict(torch.load(model_dir / "model.pt", weights_only=True))
        elif model_type == KarpathyModelType.NANOGPT:
            from src.karpathy.nanogpt.trainer import NanoGPTTrainer
            model = NanoGPTTrainer.load_model(model_dir / "model.pt")
        else:
            logger.warning("Unknown model type: %s", model_type)
            return None

        # Load threshold
        threshold_path = model_dir / "threshold.json"
        if threshold_path.exists():
            threshold = json.loads(threshold_path.read_text())["threshold"]
        else:
            threshold = metadata.get("anomaly_threshold", 3.0)

        return cls(model, tokenizer, threshold, metadata, model_type, context_len)


class KarpathyModelRegistry:
    """Manages KarpathyDetector instances. Parallel to ModelRegistry."""

    def __init__(self) -> None:
        self._models: dict[str, KarpathyDetector] = {}

    def load(self, model_name: str) -> KarpathyDetector | None:
        model_dir = config.MODEL_DIR / model_name
        if not model_dir.exists():
            return None
        # Only load if it has karpathy-specific metadata
        meta_path = model_dir / "metadata.json"
        if not meta_path.exists():
            return None
        metadata = json.loads(meta_path.read_text())
        if "model_type" not in metadata or metadata.get("model_type") not in [e.value for e in KarpathyModelType]:
            return None  # Not a Karpathy model

        detector = KarpathyDetector.load(model_dir)
        if detector:
            self._models[model_name] = detector
            logger.info("Loaded Karpathy model '%s' (type=%s, version=%s)",
                        model_name, metadata.get("model_type"), metadata.get("version"))
        return detector

    def get(self, model_name: str) -> KarpathyDetector | None:
        if model_name not in self._models:
            return self.load(model_name)
        return self._models.get(model_name)

    def reload(self, model_name: str) -> KarpathyDetector | None:
        self._models.pop(model_name, None)
        return self.load(model_name)

    def list_models(self) -> list[dict]:
        results = []
        if config.MODEL_DIR.exists():
            for d in config.MODEL_DIR.iterdir():
                if d.is_dir() and (d / "metadata.json").exists():
                    meta = json.loads((d / "metadata.json").read_text())
                    # Only include Karpathy models
                    if meta.get("model_type") in [e.value for e in KarpathyModelType]:
                        meta["loaded"] = d.name in self._models
                        results.append(meta)
        return results


# Global singleton
karpathy_registry = KarpathyModelRegistry()
