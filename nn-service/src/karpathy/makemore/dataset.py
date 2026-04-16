"""ZWM SubstrateEvent tokenizer and dataset for the Karpathy Loop suite.

Provides:
  - EventTokenizer: maps 12 ZWM event type strings <-> integer token IDs
  - SubstrateEventDataset: sliding-window PyTorch Dataset over event sequences
  - generate_synthetic_sequences(): Markov-based synthetic data for dev/testing
  - load_event_sequences_from_neo4j(): production data loader
"""
from __future__ import annotations

import logging
import random
from collections import defaultdict

import numpy as np
import torch
from torch.utils.data import Dataset

from src import config

logger = logging.getLogger(__name__)

# -------------------------------------------------------------------------
# Vocabulary: 12 ZWM event types (tiny, perfect for makemore/nanoGPT)
# -------------------------------------------------------------------------

EVENT_VOCAB = [
    "COMPLIANCE_STATE_CHANGE",
    "PROCUREMENT_STATE_CHANGE",
    "RECONSTRUCTION_COMPLETE",
    "BIOLOGICAL_ANOMALY",
    "MIGRATION_COMPLETE",
    "COMPUTE_STATE_UPDATE",
    "SETTLEMENT_EVENT",
    "FITIQ_THRESHOLD",
    "TREATY_ATTESTATION_NEW",
    "SCALE_METRIC_UPDATE",
    "OBJECTIVE_STATE_CHANGE",
    "REASONING_COMPLETE",
]

SPECIAL_TOKENS = {"<PAD>": 0, "<BOS>": 1, "<EOS>": 2}

# Markov transition matrix for synthetic data generation.
# Row = source event index (0-11), Col = target event index (0-11).
# Encodes biologically plausible ZWM causal priors:
#   - COMPLIANCE → PROCUREMENT is very likely
#   - BIOLOGICAL_ANOMALY is rare as a follow-on
#   - SETTLEMENT_EVENT follows PROCUREMENT/FITIQ
# fmt: off
_TRANSITION_MATRIX = np.array([
    # CSC   PSC   RC    BA    MC    CSU   SE    FT    TAN   SMU   OSC   ReC
    [0.05, 0.30, 0.05, 0.02, 0.03, 0.05, 0.20, 0.15, 0.05, 0.03, 0.04, 0.03],  # COMPLIANCE_STATE_CHANGE
    [0.10, 0.05, 0.05, 0.02, 0.03, 0.05, 0.30, 0.20, 0.03, 0.05, 0.05, 0.07],  # PROCUREMENT_STATE_CHANGE
    [0.10, 0.15, 0.05, 0.03, 0.05, 0.05, 0.10, 0.10, 0.10, 0.10, 0.07, 0.10],  # RECONSTRUCTION_COMPLETE
    [0.05, 0.05, 0.03, 0.02, 0.02, 0.20, 0.03, 0.03, 0.02, 0.05, 0.05, 0.45],  # BIOLOGICAL_ANOMALY → REASONING
    [0.10, 0.10, 0.05, 0.02, 0.03, 0.05, 0.10, 0.05, 0.05, 0.05, 0.05, 0.35],  # MIGRATION_COMPLETE → attest
    [0.05, 0.05, 0.05, 0.05, 0.05, 0.10, 0.10, 0.05, 0.05, 0.10, 0.05, 0.30],  # COMPUTE_STATE_UPDATE
    [0.15, 0.15, 0.05, 0.02, 0.03, 0.05, 0.10, 0.15, 0.10, 0.05, 0.08, 0.07],  # SETTLEMENT_EVENT
    [0.10, 0.15, 0.05, 0.02, 0.03, 0.05, 0.30, 0.05, 0.05, 0.05, 0.05, 0.10],  # FITIQ_THRESHOLD → settlement
    [0.20, 0.10, 0.05, 0.02, 0.03, 0.05, 0.10, 0.05, 0.10, 0.10, 0.10, 0.10],  # TREATY_ATTESTATION_NEW
    [0.10, 0.10, 0.05, 0.03, 0.03, 0.10, 0.10, 0.05, 0.05, 0.10, 0.10, 0.19],  # SCALE_METRIC_UPDATE
    [0.10, 0.10, 0.05, 0.02, 0.05, 0.05, 0.10, 0.05, 0.10, 0.10, 0.08, 0.20],  # OBJECTIVE_STATE_CHANGE
    [0.15, 0.15, 0.10, 0.02, 0.05, 0.10, 0.10, 0.08, 0.05, 0.05, 0.08, 0.07],  # REASONING_COMPLETE
], dtype=np.float64)
# fmt: on

# Normalize rows to sum to 1.0
_TRANSITION_MATRIX = _TRANSITION_MATRIX / _TRANSITION_MATRIX.sum(axis=1, keepdims=True)

# Starting event distribution (weighted toward common initiators)
_START_PROBS = np.array([
    0.20, 0.15, 0.08, 0.02, 0.05, 0.10, 0.15, 0.05, 0.05, 0.05, 0.05, 0.05
], dtype=np.float64)
_START_PROBS = _START_PROBS / _START_PROBS.sum()


class EventTokenizer:
    """Maps ZWM event type strings <-> integer token IDs."""

    def __init__(self) -> None:
        self._stoi: dict[str, int] = dict(SPECIAL_TOKENS)
        offset = len(SPECIAL_TOKENS)
        for i, event in enumerate(EVENT_VOCAB):
            self._stoi[event] = offset + i
        self._itos: dict[int, str] = {v: k for k, v in self._stoi.items()}

    def encode(self, event_type: str) -> int:
        if event_type not in self._stoi:
            raise ValueError(f"Unknown event type: {event_type!r}")
        return self._stoi[event_type]

    def decode(self, token_id: int) -> str:
        if token_id not in self._itos:
            raise ValueError(f"Unknown token ID: {token_id}")
        return self._itos[token_id]

    def encode_sequence(self, events: list[str], add_bos: bool = True, add_eos: bool = True) -> list[int]:
        tokens = []
        if add_bos:
            tokens.append(SPECIAL_TOKENS["<BOS>"])
        tokens.extend(self.encode(e) for e in events)
        if add_eos:
            tokens.append(SPECIAL_TOKENS["<EOS>"])
        return tokens

    @property
    def vocab_size(self) -> int:
        return len(self._stoi)

    @property
    def event_vocab_size(self) -> int:
        return len(EVENT_VOCAB)

    @property
    def pad_id(self) -> int:
        return SPECIAL_TOKENS["<PAD>"]

    @property
    def bos_id(self) -> int:
        return SPECIAL_TOKENS["<BOS>"]

    @property
    def eos_id(self) -> int:
        return SPECIAL_TOKENS["<EOS>"]

    def to_dict(self) -> dict:
        return {"stoi": self._stoi, "itos": {str(k): v for k, v in self._itos.items()}}

    @classmethod
    def from_dict(cls, d: dict) -> EventTokenizer:
        tok = cls.__new__(cls)
        tok._stoi = d["stoi"]
        tok._itos = {int(k): v for k, v in d["itos"].items()}
        return tok


class SubstrateEventDataset(Dataset):
    """Sliding-window dataset over tokenized event sequences.

    Each sample: (context_tokens[context_len], target_token)
    Used by makemore models for single next-token prediction.
    """

    def __init__(
        self,
        sequences: list[list[int]],
        context_len: int = 8,
    ) -> None:
        self.context_len = context_len
        self.tokenizer = EventTokenizer()

        # Build (context, target) pairs from all sequences
        self.X: list[list[int]] = []
        self.Y: list[int] = []

        pad = self.tokenizer.pad_id
        for seq in sequences:
            if len(seq) < 2:
                continue
            for i in range(1, len(seq)):
                # Context: up to context_len tokens ending at position i-1
                ctx_start = max(0, i - context_len)
                ctx = seq[ctx_start:i]
                # Left-pad if context is shorter than context_len
                if len(ctx) < context_len:
                    ctx = [pad] * (context_len - len(ctx)) + ctx
                self.X.append(ctx)
                self.Y.append(seq[i])

        self._X_tensor = torch.tensor(self.X, dtype=torch.long)
        self._Y_tensor = torch.tensor(self.Y, dtype=torch.long)

        logger.info(
            "SubstrateEventDataset: %d samples from %d sequences (context_len=%d)",
            len(self.X), len(sequences), context_len,
        )

    def __len__(self) -> int:
        return len(self.X)

    def __getitem__(self, idx: int) -> tuple[torch.Tensor, torch.Tensor]:
        return self._X_tensor[idx], self._Y_tensor[idx]

    @classmethod
    def from_neo4j(
        cls,
        context_len: int = 8,
        limit: int = 100_000,
    ) -> SubstrateEventDataset:
        raw_seqs = load_event_sequences_from_neo4j(limit=limit)
        tokenizer = EventTokenizer()
        tokenized = [tokenizer.encode_sequence(seq) for seq in raw_seqs]
        return cls(tokenized, context_len=context_len)

    @classmethod
    def synthetic(
        cls,
        n_actors: int = 100,
        seq_len_range: tuple[int, int] = (20, 100),
        context_len: int = 8,
        seed: int = 42,
    ) -> SubstrateEventDataset:
        raw_seqs = generate_synthetic_sequences(
            n_actors=n_actors,
            seq_len_range=seq_len_range,
            seed=seed,
        )
        tokenizer = EventTokenizer()
        tokenized = [tokenizer.encode_sequence(seq) for seq in raw_seqs]
        return cls(tokenized, context_len=context_len)

    @property
    def all_tokens_flat(self) -> torch.Tensor:
        """All token sequences concatenated — for nanoGPT block-style training."""
        tokenizer = EventTokenizer()
        pad = tokenizer.pad_id
        flat: list[int] = []
        for row in self.X:
            flat.extend(t for t in row if t != pad)
        flat.extend(self.Y)
        return torch.tensor(flat, dtype=torch.long)


# -------------------------------------------------------------------------
# Data loaders
# -------------------------------------------------------------------------

def load_event_sequences_from_neo4j(limit: int = 100_000) -> list[list[str]]:
    """Query Neo4j for per-actor SubstrateEvent sequences (strings)."""
    from neo4j import GraphDatabase

    driver = GraphDatabase.driver(
        config.NEO4J_URI,
        auth=(config.NEO4J_USER, config.NEO4J_PASSWORD),
    )
    try:
        with driver.session() as session:
            result = session.run(
                """
                MATCH (actor:WorldActor)-[:HAS_STATE]->(state)-[:EMITTED]->(event:SubstrateEvent)
                RETURN actor.id AS actor_id, event.type AS event_type, event.timestamp AS ts
                ORDER BY actor.id, event.timestamp
                LIMIT $limit
                """,
                limit=limit,
            )
            by_actor: dict[str, list[str]] = defaultdict(list)
            valid_events = set(EVENT_VOCAB)
            for record in result:
                etype = record["event_type"]
                if etype in valid_events:
                    by_actor[record["actor_id"]].append(etype)
    finally:
        driver.close()

    sequences = [seq for seq in by_actor.values() if len(seq) >= 2]
    logger.info("Loaded %d event sequences from Neo4j (%d actors)", len(sequences), len(by_actor))
    return sequences


def generate_synthetic_sequences(
    n_actors: int = 100,
    seq_len_range: tuple[int, int] = (20, 100),
    seed: int = 42,
) -> list[list[str]]:
    """Generate synthetic ZWM event sequences using a Markov transition model.

    Uses biologically-plausible priors: COMPLIANCE→PROCUREMENT is common,
    BIOLOGICAL_ANOMALY is rare, REASONING_COMPLETE follows anomalies.
    """
    rng = random.Random(seed)
    np_rng = np.random.RandomState(seed)
    sequences: list[list[str]] = []

    for _ in range(n_actors):
        seq_len = rng.randint(*seq_len_range)
        # Sample starting event
        first_idx = int(np_rng.choice(len(EVENT_VOCAB), p=_START_PROBS))
        seq = [EVENT_VOCAB[first_idx]]

        for _ in range(seq_len - 1):
            prev_idx = EVENT_VOCAB.index(seq[-1])
            next_idx = int(np_rng.choice(len(EVENT_VOCAB), p=_TRANSITION_MATRIX[prev_idx]))
            seq.append(EVENT_VOCAB[next_idx])

        sequences.append(seq)

    total_events = sum(len(s) for s in sequences)
    logger.info(
        "Generated %d synthetic sequences (%d total events, avg %.1f per actor)",
        len(sequences), total_events, total_events / n_actors,
    )
    return sequences
