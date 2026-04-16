"""Makemore model progression: Bigram -> MLP -> WaveNet.

Three models of increasing expressiveness for next-event prediction over
ZWM SubstrateEvent sequences. All trained with F.cross_entropy(logits, targets).

Port of Karpathy's makemore model hierarchy, adapted for the 15-token
ZWM event vocabulary (12 event types + 3 special tokens).
"""
from __future__ import annotations

import torch
import torch.nn as nn
import torch.nn.functional as F


class BigramModel(nn.Module):
    """P(next_token | prev_token) — pure bigram lookup.

    Single embedding layer: each token has a row of logits over the
    full vocabulary. No context beyond the immediately preceding token.
    """

    def __init__(self, vocab_size: int) -> None:
        super().__init__()
        self.logits_table = nn.Embedding(vocab_size, vocab_size)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        # x: (B, context_len) — we only use the last token
        last = x[:, -1]  # (B,)
        return self.logits_table(last)  # (B, vocab_size)


class MLPModel(nn.Module):
    """Context window → embedding concat → tanh MLP → logits.

    Mirrors Karpathy's makemore MLP: embed each context token,
    concatenate, and project through a hidden layer.
    """

    def __init__(
        self,
        vocab_size: int,
        context_len: int,
        emb_dim: int = 16,
        hidden_dim: int = 128,
    ) -> None:
        super().__init__()
        self.emb = nn.Embedding(vocab_size, emb_dim)
        self.fc1 = nn.Linear(context_len * emb_dim, hidden_dim)
        self.fc2 = nn.Linear(hidden_dim, vocab_size)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        # x: (B, context_len)
        e = self.emb(x)              # (B, context_len, emb_dim)
        e = e.view(e.size(0), -1)    # (B, context_len * emb_dim)
        h = torch.tanh(self.fc1(e))  # (B, hidden_dim)
        return self.fc2(h)           # (B, vocab_size)


class WaveNetModel(nn.Module):
    """Hierarchical dilated convolutions over the embedding sequence.

    Follows Karpathy's makemore WaveNet-inspired architecture:
    embed → stack of dilated 1D conv layers → flatten → linear → logits.

    Each conv layer processes pairs of adjacent elements at increasing
    dilation, creating a tree-like receptive field. This captures
    multi-scale temporal patterns in event sequences.
    """

    def __init__(
        self,
        vocab_size: int,
        context_len: int,
        emb_dim: int = 16,
        n_filters: int = 64,
    ) -> None:
        super().__init__()
        self.context_len = context_len
        self.emb = nn.Embedding(vocab_size, emb_dim)

        # Dilated conv layers: kernel_size=2, dilation doubles each layer
        # For context_len=8: dilations [1, 2, 4] → 3 layers
        self.layers = nn.ModuleList()
        self.batchnorms = nn.ModuleList()
        in_channels = emb_dim
        n_layers = 0
        d = 1
        while d < context_len:
            self.layers.append(
                nn.Conv1d(in_channels, n_filters, kernel_size=2, dilation=d, padding=d)
            )
            self.batchnorms.append(nn.BatchNorm1d(n_filters))
            in_channels = n_filters
            d *= 2
            n_layers += 1

        # Final projection
        self.fc = nn.Linear(n_filters * context_len, vocab_size)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        # x: (B, context_len)
        e = self.emb(x)                        # (B, context_len, emb_dim)
        h = e.permute(0, 2, 1)                 # (B, emb_dim, context_len) for Conv1d

        for conv, bn in zip(self.layers, self.batchnorms):
            h = conv(h)                         # (B, n_filters, T')
            h = h[:, :, :self.context_len]      # trim to context_len
            h = bn(h)
            h = torch.tanh(h)

        h = h.view(h.size(0), -1)              # (B, n_filters * context_len)
        return self.fc(h)                       # (B, vocab_size)
