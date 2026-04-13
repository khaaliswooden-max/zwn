"""
Variational Autoencoder for anomaly detection on ZWM substrate state vectors.

Architecture: Encoder → (mu, logvar) → reparameterize → Decoder → reconstruction
Anomaly score: reconstruction probability (lower = more anomalous)

Designed for:
  - Per-substrate detection (e.g., Symbion biomarkers: serotonin, dopamine, cortisol, GABA)
  - Cross-platform detection (concatenated state vectors from all 9 substrates)
"""
from __future__ import annotations

import torch
import torch.nn as nn
import torch.nn.functional as F


class VAEAnomalyDetector(nn.Module):
    """Variational Autoencoder for multivariate anomaly detection.

    The model learns the distribution of "normal" state vectors. At inference,
    high reconstruction error indicates anomalous inputs.
    """

    def __init__(self, input_dim: int, hidden_dim: int, latent_dim: int) -> None:
        super().__init__()
        self.input_dim = input_dim
        self.latent_dim = latent_dim

        # Encoder: input → hidden → (mu, logvar)
        self.encoder = nn.Sequential(
            nn.Linear(input_dim, hidden_dim),
            nn.ReLU(),
            nn.Linear(hidden_dim, hidden_dim),
            nn.ReLU(),
        )
        self.fc_mu = nn.Linear(hidden_dim, latent_dim)
        self.fc_logvar = nn.Linear(hidden_dim, latent_dim)

        # Decoder: latent → hidden → reconstruction
        self.decoder = nn.Sequential(
            nn.Linear(latent_dim, hidden_dim),
            nn.ReLU(),
            nn.Linear(hidden_dim, hidden_dim),
            nn.ReLU(),
            nn.Linear(hidden_dim, input_dim),
        )

    def encode(self, x: torch.Tensor) -> tuple[torch.Tensor, torch.Tensor]:
        h = self.encoder(x)
        return self.fc_mu(h), self.fc_logvar(h)

    def reparameterize(self, mu: torch.Tensor, logvar: torch.Tensor) -> torch.Tensor:
        if self.training:
            std = torch.exp(0.5 * logvar)
            eps = torch.randn_like(std)
            return mu + eps * std
        return mu

    def decode(self, z: torch.Tensor) -> torch.Tensor:
        return self.decoder(z)

    def forward(self, x: torch.Tensor) -> tuple[torch.Tensor, torch.Tensor, torch.Tensor]:
        mu, logvar = self.encode(x)
        z = self.reparameterize(mu, logvar)
        recon = self.decode(z)
        return recon, mu, logvar


def vae_loss(
    recon: torch.Tensor,
    x: torch.Tensor,
    mu: torch.Tensor,
    logvar: torch.Tensor,
    kl_weight: float = 1.0,
) -> tuple[torch.Tensor, torch.Tensor, torch.Tensor]:
    """ELBO loss = reconstruction loss + KL divergence.

    Returns (total_loss, recon_loss, kl_loss) for logging.
    """
    recon_loss = F.mse_loss(recon, x, reduction="mean")
    # KL(q(z|x) || p(z)) where p(z) = N(0,1)
    kl_loss = -0.5 * torch.mean(1 + logvar - mu.pow(2) - logvar.exp())
    total = recon_loss + kl_weight * kl_loss
    return total, recon_loss, kl_loss


def compute_anomaly_score(
    model: VAEAnomalyDetector,
    x: torch.Tensor,
    n_samples: int = 10,
) -> torch.Tensor:
    """Monte Carlo reconstruction probability as anomaly score.

    Runs n_samples forward passes with stochastic reparameterization,
    averages reconstruction error. Higher score = more anomalous.

    Returns a score per sample in [0, inf). Normalized to [0, 1] by the
    caller using the training set's percentile threshold.
    """
    model.eval()
    errors = []
    with torch.no_grad():
        for _ in range(n_samples):
            model.train()  # enable stochastic sampling
            recon, _, _ = model(x)
            model.eval()
            # Per-sample MSE
            err = (recon - x).pow(2).mean(dim=-1)
            errors.append(err)

    # Average across Monte Carlo samples
    return torch.stack(errors).mean(dim=0)
