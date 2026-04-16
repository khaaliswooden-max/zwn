"""NanoGPT training loop with warmup + cosine LR decay.

Operates on SubstrateEventDataset but uses GPT's block-level causal LM
training (shifted targets over full sequences), not makemore's single-step.
"""
from __future__ import annotations

import logging
import math
from dataclasses import dataclass, field
from pathlib import Path

import torch
import torch.nn.functional as F

from src.karpathy.makemore.dataset import EventTokenizer, SubstrateEventDataset
from src.karpathy.nanogpt.model import GPT, GPTConfig

logger = logging.getLogger(__name__)


@dataclass
class NanoGPTTrainConfig:
    max_iters: int = 2000
    eval_interval: int = 200
    eval_iters: int = 50
    learning_rate: float = 1e-3
    min_lr: float = 1e-4
    warmup_iters: int = 100
    lr_decay_iters: int = 2000
    weight_decay: float = 0.1
    grad_clip: float = 1.0
    batch_size: int = 64
    device: str = "cpu"


class NanoGPTTrainer:
    """Full nanoGPT training loop with cosine LR schedule."""

    def __init__(
        self,
        model: GPT,
        dataset: SubstrateEventDataset,
        config: NanoGPTTrainConfig | None = None,
    ) -> None:
        self.config = config or NanoGPTTrainConfig()
        self.model = model.to(self.config.device)
        self.tokenizer = EventTokenizer()

        # Flatten all tokens for block-style sampling
        all_tokens = dataset.all_tokens_flat
        n = len(all_tokens)
        n_val = max(1, int(n * 0.1))
        self.train_data = all_tokens[: n - n_val]
        self.val_data = all_tokens[n - n_val:]

        self.block_size = model.config.block_size
        self.optimizer = model.configure_optimizers(
            weight_decay=self.config.weight_decay,
            learning_rate=self.config.learning_rate,
            device_type=self.config.device,
        )

        logger.info(
            "NanoGPTTrainer: %d train tokens, %d val tokens, block_size=%d, %d params",
            len(self.train_data), len(self.val_data), self.block_size, model.get_num_params(),
        )

    def get_lr(self, it: int) -> float:
        """Cosine decay with linear warmup."""
        cfg = self.config
        if it < cfg.warmup_iters:
            return cfg.learning_rate * it / max(cfg.warmup_iters, 1)
        if it > cfg.lr_decay_iters:
            return cfg.min_lr
        decay_ratio = (it - cfg.warmup_iters) / (cfg.lr_decay_iters - cfg.warmup_iters)
        coeff = 0.5 * (1.0 + math.cos(math.pi * decay_ratio))
        return cfg.min_lr + coeff * (cfg.learning_rate - cfg.min_lr)

    def get_batch(self, split: str) -> tuple[torch.Tensor, torch.Tensor]:
        """Random block-sized chunks from train or val."""
        data = self.train_data if split == "train" else self.val_data
        bs = self.config.batch_size
        max_start = len(data) - self.block_size - 1
        if max_start <= 0:
            # Data too small — use what we have
            x = data[: self.block_size].unsqueeze(0)
            y = data[1: self.block_size + 1].unsqueeze(0)
            return x.to(self.config.device), y.to(self.config.device)

        ix = torch.randint(0, max_start, (bs,))
        x = torch.stack([data[i: i + self.block_size] for i in ix])
        y = torch.stack([data[i + 1: i + self.block_size + 1] for i in ix])
        return x.to(self.config.device), y.to(self.config.device)

    @torch.no_grad()
    def estimate_loss(self) -> dict[str, float]:
        """Average loss over eval_iters batches for train and val."""
        self.model.eval()
        out: dict[str, float] = {}
        for split in ("train", "val"):
            total = 0.0
            for _ in range(self.config.eval_iters):
                xb, yb = self.get_batch(split)
                _, loss = self.model(xb, yb)
                total += loss.item()
            out[split] = total / self.config.eval_iters
        self.model.train()
        return out

    def train(self) -> dict[str, list[float]]:
        """Run the nanoGPT training loop. Returns loss/lr histories."""
        cfg = self.config
        train_losses: list[float] = []
        val_losses: list[float] = []
        lrs: list[float] = []
        best_val_loss = float("inf")

        self.model.train()
        for it in range(cfg.max_iters):
            # Set learning rate
            lr = self.get_lr(it)
            for param_group in self.optimizer.param_groups:
                param_group["lr"] = lr
            lrs.append(lr)

            # Forward-backward (the Karpathy Loop)
            xb, yb = self.get_batch("train")
            _, loss = self.model(xb, yb)
            self.optimizer.zero_grad(set_to_none=True)
            loss.backward()

            # Gradient clipping
            if cfg.grad_clip > 0:
                torch.nn.utils.clip_grad_norm_(self.model.parameters(), cfg.grad_clip)

            self.optimizer.step()
            train_losses.append(loss.item())

            # Periodic evaluation
            if (it + 1) % cfg.eval_interval == 0 or it == 0:
                losses = self.estimate_loss()
                val_losses.append(losses["val"])
                if losses["val"] < best_val_loss:
                    best_val_loss = losses["val"]
                logger.info(
                    "iter %4d/%d — train=%.4f  val=%.4f  lr=%.6f  best_val=%.4f",
                    it + 1, cfg.max_iters, losses["train"], losses["val"], lr, best_val_loss,
                )

        return {"train_loss": train_losses, "val_loss": val_losses, "lr": lrs}

    @torch.no_grad()
    def compute_event_loss(self, event_sequence: list[str]) -> float:
        """Mean cross-entropy loss on a new event sequence — the anomaly signal."""
        self.model.eval()
        tokens = self.tokenizer.encode_sequence(event_sequence, add_bos=True, add_eos=False)

        if len(tokens) < 2:
            return 0.0

        # Truncate to block_size if needed
        if len(tokens) > self.block_size + 1:
            tokens = tokens[-(self.block_size + 1):]

        x = torch.tensor([tokens[:-1]], dtype=torch.long, device=self.config.device)
        y = torch.tensor([tokens[1:]], dtype=torch.long, device=self.config.device)

        _, loss = self.model(x, y)
        return loss.item()

    def save(self, path: Path) -> None:
        """Save model checkpoint with config."""
        torch.save(
            {
                "model_state_dict": self.model.state_dict(),
                "config": {
                    "block_size": self.model.config.block_size,
                    "vocab_size": self.model.config.vocab_size,
                    "n_layer": self.model.config.n_layer,
                    "n_head": self.model.config.n_head,
                    "n_embd": self.model.config.n_embd,
                    "dropout": self.model.config.dropout,
                    "bias": self.model.config.bias,
                },
            },
            path,
        )

    @classmethod
    def load_model(cls, path: Path, device: str = "cpu") -> GPT:
        """Load a GPT model from checkpoint."""
        checkpoint = torch.load(path, weights_only=False, map_location=device)
        config = GPTConfig(**checkpoint["config"])
        model = GPT(config)
        model.load_state_dict(checkpoint["model_state_dict"])
        model.eval()
        return model
