"""Unified orchestrator for training Karpathy Loop models.

Called by the API's POST /karpathy/train endpoint. Loads data,
instantiates the selected model, trains it, computes the anomaly
threshold, and saves all artifacts to MODEL_DIR/<model_name>/.
"""
from __future__ import annotations

import json
import logging
import time
from enum import Enum
from pathlib import Path

import numpy as np
import torch

from src import config
from src.karpathy.makemore.dataset import EventTokenizer, SubstrateEventDataset
from src.karpathy.makemore.models import BigramModel, MLPModel, WaveNetModel
from src.karpathy.makemore.trainer import MakemoreTrainer
from src.karpathy.nanogpt.model import GPT, GPTConfig
from src.karpathy.nanogpt.trainer import NanoGPTTrainer, NanoGPTTrainConfig

logger = logging.getLogger(__name__)


class KarpathyModelType(str, Enum):
    BIGRAM = "bigram"
    MLP = "mlp"
    WAVENET = "wavenet"
    NANOGPT = "nanogpt"


class KarpathyTrainConfig:
    """All hyperparameters — reads defaults from config.py env vars."""

    def __init__(
        self,
        model_type: KarpathyModelType = KarpathyModelType.NANOGPT,
        context_len: int | None = None,
        use_synthetic_data: bool | None = None,
        n_synthetic_actors: int | None = None,
        epochs: int | None = None,
        max_iters: int | None = None,
        batch_size: int | None = None,
        learning_rate: float | None = None,
        emb_dim: int = 16,
        hidden_dim: int = 128,
        n_layer: int | None = None,
        n_head: int | None = None,
        n_embd: int | None = None,
        block_size: int | None = None,
        anomaly_percentile: float | None = None,
    ) -> None:
        self.model_type = model_type
        self.context_len = context_len or config.KARPATHY_CONTEXT_LEN
        self.use_synthetic_data = use_synthetic_data if use_synthetic_data is not None else config.KARPATHY_USE_SYNTHETIC
        self.n_synthetic_actors = n_synthetic_actors or config.KARPATHY_N_SYNTHETIC_ACTORS
        self.epochs = epochs or config.KARPATHY_EPOCHS
        self.max_iters = max_iters or config.KARPATHY_MAX_ITERS
        self.batch_size = batch_size or config.KARPATHY_BATCH_SIZE
        self.learning_rate = learning_rate or config.KARPATHY_LR
        self.emb_dim = emb_dim
        self.hidden_dim = hidden_dim
        self.n_layer = n_layer or config.KARPATHY_N_LAYER
        self.n_head = n_head or config.KARPATHY_N_HEAD
        self.n_embd = n_embd or config.KARPATHY_N_EMBD
        self.block_size = block_size or config.KARPATHY_BLOCK_SIZE
        self.anomaly_percentile = anomaly_percentile or config.KARPATHY_ANOMALY_PERCENTILE

    def to_dict(self) -> dict:
        return {
            "model_type": self.model_type.value,
            "context_len": self.context_len,
            "use_synthetic_data": self.use_synthetic_data,
            "n_synthetic_actors": self.n_synthetic_actors,
            "epochs": self.epochs,
            "max_iters": self.max_iters,
            "batch_size": self.batch_size,
            "learning_rate": self.learning_rate,
            "emb_dim": self.emb_dim,
            "hidden_dim": self.hidden_dim,
            "n_layer": self.n_layer,
            "n_head": self.n_head,
            "n_embd": self.n_embd,
            "block_size": self.block_size,
            "anomaly_percentile": self.anomaly_percentile,
        }


def train_karpathy_model(
    model_name: str = "zwm_nanogpt",
    train_config: KarpathyTrainConfig | None = None,
) -> dict:
    """Full training pipeline. Returns metadata dict."""
    cfg = train_config or KarpathyTrainConfig()
    start_time = time.time()
    tokenizer = EventTokenizer()

    # ---- 1. Load dataset ----
    if cfg.use_synthetic_data:
        dataset = SubstrateEventDataset.synthetic(
            n_actors=cfg.n_synthetic_actors,
            context_len=cfg.context_len,
        )
        data_source = "synthetic"
    else:
        dataset = SubstrateEventDataset.from_neo4j(context_len=cfg.context_len)
        data_source = "neo4j"

    if len(dataset) < 10:
        raise ValueError(f"Insufficient training data: {len(dataset)} samples (minimum 10)")

    vocab_size = tokenizer.vocab_size

    # ---- 2. Instantiate model ----
    if cfg.model_type == KarpathyModelType.BIGRAM:
        model = BigramModel(vocab_size)
    elif cfg.model_type == KarpathyModelType.MLP:
        model = MLPModel(vocab_size, cfg.context_len, emb_dim=cfg.emb_dim, hidden_dim=cfg.hidden_dim)
    elif cfg.model_type == KarpathyModelType.WAVENET:
        model = WaveNetModel(vocab_size, cfg.context_len, emb_dim=cfg.emb_dim)
    elif cfg.model_type == KarpathyModelType.NANOGPT:
        gpt_config = GPTConfig(
            block_size=cfg.block_size,
            vocab_size=vocab_size,
            n_layer=cfg.n_layer,
            n_head=cfg.n_head,
            n_embd=cfg.n_embd,
        )
        model = GPT(gpt_config)
    else:
        raise ValueError(f"Unknown model type: {cfg.model_type}")

    n_params = sum(p.numel() for p in model.parameters())
    logger.info("Training %s model (%d params) on %d samples", cfg.model_type.value, n_params, len(dataset))

    # ---- 3. Train ----
    if cfg.model_type == KarpathyModelType.NANOGPT:
        nano_cfg = NanoGPTTrainConfig(
            max_iters=cfg.max_iters,
            learning_rate=cfg.learning_rate,
            batch_size=cfg.batch_size,
        )
        trainer = NanoGPTTrainer(model, dataset, nano_cfg)
        history = trainer.train()
        best_val_loss = min(history["val_loss"]) if history["val_loss"] else float("inf")
    else:
        trainer = MakemoreTrainer(
            model, dataset,
            lr=cfg.learning_rate,
            batch_size=cfg.batch_size,
        )
        history = trainer.train(epochs=cfg.epochs)
        best_val_loss = min(history["val_loss"]) if history["val_loss"] else float("inf")

    # ---- 4. Compute anomaly threshold ----
    model.eval()
    losses: list[float] = []
    with torch.no_grad():
        for i in range(min(len(dataset), 1000)):
            xb, yb = dataset[i]
            xb = xb.unsqueeze(0)
            yb_item = yb.item() if yb.dim() == 0 else yb

            if cfg.model_type == KarpathyModelType.NANOGPT:
                logits, _ = model(xb)
                loss = torch.nn.functional.cross_entropy(logits[:, -1, :], torch.tensor([yb_item]))
            else:
                logits = model(xb)
                loss = torch.nn.functional.cross_entropy(logits, torch.tensor([yb_item]))
            losses.append(loss.item())

    threshold = float(np.percentile(losses, cfg.anomaly_percentile)) if losses else 3.0
    logger.info("Anomaly threshold (p%d): %.4f", int(cfg.anomaly_percentile), threshold)

    # ---- 5. Save artifacts ----
    model_dir = config.MODEL_DIR / model_name
    model_dir.mkdir(parents=True, exist_ok=True)

    if cfg.model_type == KarpathyModelType.NANOGPT:
        trainer.save(model_dir / "model.pt")
    else:
        torch.save(model.state_dict(), model_dir / "model.pt")

    (model_dir / "tokenizer.json").write_text(json.dumps(tokenizer.to_dict(), indent=2))
    (model_dir / "threshold.json").write_text(json.dumps({"threshold": threshold, "percentile": cfg.anomaly_percentile}))

    version = int(time.time())
    metadata = {
        "model_name": model_name,
        "model_type": cfg.model_type.value,
        "vocab_size": vocab_size,
        "context_len": cfg.context_len,
        "training_samples": len(dataset),
        "anomaly_threshold": threshold,
        "anomaly_percentile": cfg.anomaly_percentile,
        "best_val_loss": round(best_val_loss, 6),
        "n_params": n_params,
        "training_time_s": round(time.time() - start_time, 2),
        "version": version,
        "data_source": data_source,
    }
    # Add model-specific config for reconstruction at load time
    if cfg.model_type == KarpathyModelType.NANOGPT:
        metadata.update({
            "block_size": cfg.block_size,
            "n_layer": cfg.n_layer,
            "n_head": cfg.n_head,
            "n_embd": cfg.n_embd,
        })
    elif cfg.model_type == KarpathyModelType.MLP:
        metadata.update({"emb_dim": cfg.emb_dim, "hidden_dim": cfg.hidden_dim})
    elif cfg.model_type == KarpathyModelType.WAVENET:
        metadata.update({"emb_dim": cfg.emb_dim})

    (model_dir / "metadata.json").write_text(json.dumps(metadata, indent=2))
    (model_dir / "train_config.json").write_text(json.dumps(cfg.to_dict(), indent=2))

    logger.info("Saved model artifacts to %s (version %d)", model_dir, version)
    return metadata
