"""Makemore training loop — the Karpathy Loop for sequence models.

The core loop: forward → cross_entropy → backward → step.
Operates on SubstrateEventDataset with any of the three makemore models.
"""
from __future__ import annotations

import logging
from pathlib import Path

import torch
import torch.nn as nn
import torch.nn.functional as F
from torch.utils.data import DataLoader, random_split

from src.karpathy.makemore.dataset import EventTokenizer, SubstrateEventDataset

logger = logging.getLogger(__name__)


class MakemoreTrainer:
    """Training loop for makemore-style next-token prediction models."""

    def __init__(
        self,
        model: nn.Module,
        dataset: SubstrateEventDataset,
        lr: float = 0.01,
        batch_size: int = 32,
        val_split: float = 0.1,
        device: str = "cpu",
    ) -> None:
        self.model = model.to(device)
        self.device = device
        self.lr = lr
        self.batch_size = batch_size
        self.tokenizer = EventTokenizer()

        # Train/val split
        n_val = max(1, int(len(dataset) * val_split))
        n_train = len(dataset) - n_val
        self.train_set, self.val_set = random_split(dataset, [n_train, n_val])
        self.train_loader = DataLoader(self.train_set, batch_size=batch_size, shuffle=True)
        self.val_loader = DataLoader(self.val_set, batch_size=batch_size)

        self.optimizer = torch.optim.Adam(model.parameters(), lr=lr)

    def train(self, epochs: int = 50) -> dict[str, list[float]]:
        """Run the full training loop. Returns loss histories."""
        train_losses: list[float] = []
        val_losses: list[float] = []

        for epoch in range(epochs):
            # --- Training ---
            self.model.train()
            epoch_loss = 0.0
            n_batches = 0
            for xb, yb in self.train_loader:
                loss = self._one_step(xb.to(self.device), yb.to(self.device))
                epoch_loss += loss
                n_batches += 1

            avg_train = epoch_loss / max(n_batches, 1)
            train_losses.append(avg_train)

            # --- Validation ---
            avg_val = self.evaluate()
            val_losses.append(avg_val)

            if (epoch + 1) % 10 == 0 or epoch == 0:
                logger.info(
                    "Epoch %3d/%d — train_loss=%.4f  val_loss=%.4f",
                    epoch + 1, epochs, avg_train, avg_val,
                )

        return {"train_loss": train_losses, "val_loss": val_losses}

    def _one_step(self, xb: torch.Tensor, yb: torch.Tensor) -> float:
        """Single Karpathy Loop iteration: forward → loss → backward → step."""
        logits = self.model(xb)                 # (B, vocab_size)
        loss = F.cross_entropy(logits, yb)      # scalar
        self.optimizer.zero_grad(set_to_none=True)
        loss.backward()
        self.optimizer.step()
        return loss.item()

    @torch.no_grad()
    def evaluate(self) -> float:
        """Compute average cross-entropy on the validation set."""
        self.model.eval()
        total_loss = 0.0
        n_batches = 0
        for xb, yb in self.val_loader:
            logits = self.model(xb.to(self.device))
            loss = F.cross_entropy(logits, yb.to(self.device))
            total_loss += loss.item()
            n_batches += 1
        return total_loss / max(n_batches, 1)

    @torch.no_grad()
    def compute_sequence_loss(self, event_sequence: list[str]) -> list[float]:
        """Per-position cross-entropy loss for a new event sequence.

        This is the anomaly signal: high loss at a position means the
        event there was unexpected given preceding context.

        Args:
            event_sequence: list of event type strings (minimum 2 elements)

        Returns:
            List of CE loss values, one per position (starting at index 1).
        """
        self.model.eval()
        tokens = self.tokenizer.encode_sequence(event_sequence, add_bos=True, add_eos=False)
        context_len = self.train_loader.dataset.dataset.context_len
        pad = self.tokenizer.pad_id

        losses: list[float] = []
        for i in range(1, len(tokens)):
            ctx_start = max(0, i - context_len)
            ctx = tokens[ctx_start:i]
            if len(ctx) < context_len:
                ctx = [pad] * (context_len - len(ctx)) + ctx

            x = torch.tensor([ctx], dtype=torch.long, device=self.device)
            target = torch.tensor([tokens[i]], dtype=torch.long, device=self.device)
            logits = self.model(x)
            loss = F.cross_entropy(logits, target)
            losses.append(loss.item())

        return losses

    def save(self, path: Path) -> None:
        """Save model state dict."""
        torch.save(self.model.state_dict(), path)

    @classmethod
    def load_model(cls, path: Path, model: nn.Module, device: str = "cpu") -> nn.Module:
        """Load model weights from disk."""
        model.load_state_dict(torch.load(path, weights_only=True, map_location=device))
        model.eval()
        return model
