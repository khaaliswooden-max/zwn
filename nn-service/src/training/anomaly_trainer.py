"""Training pipeline for VAE anomaly detector.

Workflow:
  1. Export normal state vectors from Neo4j (or load from file)
  2. Normalize features (z-score, saved for inference)
  3. Train VAE with ELBO loss
  4. Compute anomaly threshold from training set reconstruction errors
  5. Save model checkpoint + normalization params + threshold
"""
from __future__ import annotations

import json
import logging
import time
from pathlib import Path

import numpy as np
import torch
from torch.utils.data import DataLoader, TensorDataset

from src import config
from src.models.vae_anomaly import VAEAnomalyDetector, vae_loss, compute_anomaly_score
from src.training.neo4j_exporter import export_biological_training_data

logger = logging.getLogger(__name__)


class NormalizationParams:
    """Z-score normalization parameters saved alongside the model."""

    def __init__(self, mean: np.ndarray, std: np.ndarray) -> None:
        self.mean = mean
        # Prevent division by zero for constant features
        self.std = np.where(std < 1e-8, 1.0, std)

    def normalize(self, x: np.ndarray) -> np.ndarray:
        return (x - self.mean) / self.std

    def save(self, path: Path) -> None:
        np.savez(path, mean=self.mean, std=self.std)

    @classmethod
    def load(cls, path: Path) -> NormalizationParams:
        data = np.load(path)
        return cls(data["mean"], data["std"])


def train_biological_vae(
    data: np.ndarray | None = None,
    model_name: str = "biological_vae",
) -> dict[str, float]:
    """Train (or retrain) the Symbion biological anomaly VAE.

    Returns training metrics dict.
    """
    if data is None:
        data = export_biological_training_data()

    if len(data) < 20:
        raise ValueError(f"Insufficient training data: {len(data)} samples (need >= 20)")

    logger.info("Training biological VAE on %d samples", len(data))

    # Compute normalization params from training data
    norm = NormalizationParams(data.mean(axis=0), data.std(axis=0))
    normalized = norm.normalize(data)

    # Split: 90% train, 10% validation
    n_val = max(1, int(len(normalized) * 0.1))
    indices = np.random.permutation(len(normalized))
    train_data = normalized[indices[n_val:]]
    val_data = normalized[indices[:n_val]]

    train_tensor = torch.tensor(train_data, dtype=torch.float32)
    val_tensor = torch.tensor(val_data, dtype=torch.float32)

    train_loader = DataLoader(
        TensorDataset(train_tensor),
        batch_size=config.VAE_BATCH_SIZE,
        shuffle=True,
    )

    model = VAEAnomalyDetector(
        input_dim=config.VAE_INPUT_DIM,
        hidden_dim=config.VAE_HIDDEN_DIM,
        latent_dim=config.VAE_LATENT_DIM,
    )
    optimizer = torch.optim.Adam(model.parameters(), lr=config.VAE_LEARNING_RATE)

    # KL annealing: ramp kl_weight from 0 to 1 over first 30% of epochs
    warmup_epochs = max(1, int(config.VAE_EPOCHS * 0.3))

    best_val_loss = float("inf")
    train_start = time.time()

    for epoch in range(config.VAE_EPOCHS):
        model.train()
        kl_weight = min(1.0, epoch / warmup_epochs)
        epoch_loss = 0.0
        n_batches = 0

        for (batch,) in train_loader:
            recon, mu, logvar = model(batch)
            loss, _, _ = vae_loss(recon, batch, mu, logvar, kl_weight)
            optimizer.zero_grad()
            loss.backward()
            optimizer.step()
            epoch_loss += loss.item()
            n_batches += 1

        # Validation
        model.eval()
        with torch.no_grad():
            val_recon, val_mu, val_logvar = model(val_tensor)
            val_loss, val_recon_l, val_kl_l = vae_loss(
                val_recon, val_tensor, val_mu, val_logvar, kl_weight
            )

        avg_train = epoch_loss / max(n_batches, 1)
        if val_loss.item() < best_val_loss:
            best_val_loss = val_loss.item()

        if (epoch + 1) % 20 == 0 or epoch == 0:
            logger.info(
                "Epoch %d/%d — train_loss: %.6f  val_loss: %.6f  kl_weight: %.2f",
                epoch + 1, config.VAE_EPOCHS, avg_train, val_loss.item(), kl_weight,
            )

    # Compute anomaly threshold from training set reconstruction errors
    model.eval()
    train_scores = compute_anomaly_score(model, train_tensor, n_samples=10)
    threshold = float(
        np.percentile(train_scores.numpy(), config.VAE_ANOMALY_PERCENTILE)
    )

    # Save artifacts
    model_dir = config.MODEL_DIR / model_name
    model_dir.mkdir(parents=True, exist_ok=True)

    torch.save(model.state_dict(), model_dir / "model.pt")
    norm.save(model_dir / "norm_params.npz")

    metadata = {
        "model_name": model_name,
        "input_dim": config.VAE_INPUT_DIM,
        "hidden_dim": config.VAE_HIDDEN_DIM,
        "latent_dim": config.VAE_LATENT_DIM,
        "training_samples": len(data),
        "anomaly_threshold": threshold,
        "anomaly_percentile": config.VAE_ANOMALY_PERCENTILE,
        "best_val_loss": best_val_loss,
        "training_time_s": round(time.time() - train_start, 2),
        "version": int(time.time()),
    }
    (model_dir / "metadata.json").write_text(json.dumps(metadata, indent=2))

    logger.info(
        "Model saved to %s — threshold: %.6f (p%d), val_loss: %.6f",
        model_dir, threshold, config.VAE_ANOMALY_PERCENTILE, best_val_loss,
    )
    return metadata
