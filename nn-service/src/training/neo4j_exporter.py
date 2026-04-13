"""Export training data from Neo4j for VAE anomaly detection.

Queries BiologicalState nodes (or any substrate) and returns numpy arrays
suitable for PyTorch training. Only exports normal data (anomaly_flag=false)
for the autoencoder to learn the "normal" distribution.
"""
from __future__ import annotations

import logging
from typing import Any

import numpy as np
from neo4j import GraphDatabase

from src import config

logger = logging.getLogger(__name__)

# Feature columns per substrate type
SUBSTRATE_FEATURES: dict[str, list[str]] = {
    "biological": ["serotonin", "dopamine", "cortisol", "gaba"],
    "compliance": ["score"],
    "procurement": ["fitiq", "upd"],
    "compute": ["xdop_score", "wcbi", "ddil_hours", "tops", "availability"],
    "cross_platform": [
        # Concatenation of all substrate features for cross-platform VAE
        "compliance_score",
        "fitiq", "upd",
        "serotonin", "dopamine", "cortisol", "gaba",
        "confidence", "temporal_depth_years",
        "semantic_preservation", "test_coverage",
        "xdop_score", "wcbi", "ddil_hours", "tops", "availability",
        "settlement_volume",
        "attestation_count",
        "reasoning_v_score",
    ],
}


def export_biological_training_data(
    limit: int = 50_000,
) -> np.ndarray:
    """Export normal BiologicalState vectors from Neo4j.

    Returns ndarray of shape (N, 4) where columns are
    [serotonin, dopamine, cortisol, gaba].
    Only includes records where anomaly_flag = false.
    """
    driver = GraphDatabase.driver(config.NEO4J_URI, auth=(config.NEO4J_USER, config.NEO4J_PASSWORD))
    try:
        with driver.session() as session:
            result = session.run(
                """
                MATCH (s:BiologicalState)
                WHERE s.anomaly_flag = false
                RETURN s.serotonin AS serotonin,
                       s.dopamine AS dopamine,
                       s.cortisol AS cortisol,
                       s.gaba AS gaba
                ORDER BY s.timestamp DESC
                LIMIT $limit
                """,
                limit=limit,
            )
            rows = [
                [
                    record["serotonin"],
                    record["dopamine"],
                    record["cortisol"],
                    record["gaba"],
                ]
                for record in result
                if all(
                    record[k] is not None
                    for k in ("serotonin", "dopamine", "cortisol", "gaba")
                )
            ]
    finally:
        driver.close()

    if not rows:
        logger.warning("No biological training data found in Neo4j")
        return np.empty((0, 4), dtype=np.float32)

    data = np.array(rows, dtype=np.float32)
    logger.info("Exported %d biological state vectors for training", len(data))
    return data


def export_cross_platform_training_data(
    limit: int = 50_000,
) -> np.ndarray:
    """Export concatenated cross-platform state vectors for cross-platform VAE.

    For each WorldActor, gathers current state from all substrates and
    concatenates into a single vector. Only includes actors with at least
    3 substrate states (to avoid sparse vectors dominating training).
    """
    driver = GraphDatabase.driver(config.NEO4J_URI, auth=(config.NEO4J_USER, config.NEO4J_PASSWORD))
    try:
        with driver.session() as session:
            result = session.run(
                """
                MATCH (a:WorldActor)-[:HAS_STATE]->(state)
                WHERE state.is_current = true
                WITH a, collect({label: labels(state)[0], props: properties(state)}) AS states
                WHERE size(states) >= 3
                RETURN a.id AS entity_id, states
                LIMIT $limit
                """,
                limit=limit,
            )
            rows = []
            for record in result:
                vec = _build_cross_platform_vector(record["states"])
                if vec is not None:
                    rows.append(vec)
    finally:
        driver.close()

    if not rows:
        logger.warning("No cross-platform training data found")
        return np.empty((0, config.CROSS_PLATFORM_INPUT_DIM), dtype=np.float32)

    data = np.array(rows, dtype=np.float32)
    logger.info("Exported %d cross-platform state vectors for training", len(data))
    return data


def _build_cross_platform_vector(states: list[dict[str, Any]]) -> list[float] | None:
    """Build a fixed-length feature vector from a list of substrate state dicts."""
    lookup: dict[str, dict[str, Any]] = {}
    for s in states:
        label = s["label"]
        lookup[label] = s["props"]

    def _get(label: str, prop: str, default: float = 0.0) -> float:
        node = lookup.get(label, {})
        val = node.get(prop, default)
        try:
            return float(val)
        except (TypeError, ValueError):
            return default

    return [
        _get("ComplianceState", "score"),
        _get("ProcurementState", "fitiq"),
        _get("ProcurementState", "upd"),
        _get("BiologicalState", "serotonin"),
        _get("BiologicalState", "dopamine"),
        _get("BiologicalState", "cortisol"),
        _get("BiologicalState", "gaba"),
        _get("HistoricalRecon", "confidence"),
        _get("HistoricalRecon", "temporal_depth_years"),
        _get("MigrationState", "semantic_preservation"),
        _get("MigrationState", "test_coverage"),
        _get("ComputeState", "xdop_score"),
        _get("ComputeState", "wcbi"),
        _get("ComputeState", "ddil_hours"),
        _get("ComputeState", "tops"),
        _get("ComputeState", "availability"),
        _get("SettlementRecord", "amount", 0.0),
        _get("Attestation", "score", 0.0),
        _get("ReasoningState", "v_score", 0.0),
        0.0,  # reserved slot for future substrate
    ]
