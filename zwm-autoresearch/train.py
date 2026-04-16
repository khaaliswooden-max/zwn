"""
train.py — ZWM Causal Rule Engine
===================================
THIS FILE IS MODIFIED BY THE AUTORESEARCH AGENT.

The agent may change CAUSAL_THRESHOLDS, SEVERITY_WEIGHTS, and/or the
compute_risk_score / predict_violation logic to improve val_metric.

Constraints (enforced by program.md, not code):
  - No neural networks or learned models
  - All thresholds must remain physically interpretable
  - compliance_violation_score must be in [20, 70]
  - fitiq_risk_threshold must be in [20, 80]
  - All weight/multiplier values must be in [0.0, 1.0]

Initial values encode the hand-tuned thresholds from CLAUDE.md and
config/causal-rules.ts (the human-designed ZWM causal rules).
"""

import sys
import os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from prepare import load_data, evaluate_model

# ── causal thresholds (agent modifies this dict) ──────────────────────────────

CAUSAL_THRESHOLDS = {
    # Compliance substrate (from CLAUDE.md: score < 40 = VIOLATION)
    'compliance_violation_score': 35.0,
    'compliance_warning_score': 55.0,

    # Procurement substrate (from causal-rules.ts: fitiq < 50 → FLAG_SETTLEMENT)
    'fitiq_risk_threshold': 42.0,
    'fitiq_compliance_penalty': 0.40,    # 40% penalty applied when both low

    # Biological substrate
    'biological_anomaly_weight': 0.15,

    # Compute substrate (from causal-rules.ts: availability < 0.90 → TRIGGER_REASONING)
    'compute_availability_floor': 0.90,
    'compute_degradation_weight': 0.10,

    # Settlement substrate
    'settlement_risk_threshold': 1_000_000.0,  # USDC (1 dollar = 1_000_000 lamports)
    'settlement_risk_weight': 0.05,

    # Prediction threshold (risk score above this → predict VIOLATION)
    'violation_prediction_threshold': 0.45,

    # Temporal (lookback_steps > 1 requires history; currently single-step)
    'lookback_steps': 1,
    'temporal_decay': 1.0,
}

# Severity weight map (separate so agent can tune individual levels)
SEVERITY_WEIGHTS = {
    'NONE':   0.00,
    'LOW':    0.05,
    'MEDIUM': 0.10,
    'HIGH':   0.25,
}


# ── risk computation ──────────────────────────────────────────────────────────

def compute_risk_score(state: dict) -> float:
    """
    Compute a composite risk score in [0, 1] from multi-substrate state.
    Higher score = higher probability of VIOLATION.
    """
    t = CAUSAL_THRESHOLDS
    risk = 0.0

    # 1. Compliance contribution (primary signal)
    c = state['compliance_score']
    if c < t['compliance_violation_score']:
        risk += 0.70  # definite violation zone — strong signal
    elif c < t['compliance_warning_score']:
        risk += 0.25  # warning zone — moderate signal

    # 2. Procurement contribution
    f = state['fitiq']
    if f < t['fitiq_risk_threshold']:
        # Extra penalty when both compliance AND fitiq are degraded
        compliance_also_low = c < t['compliance_warning_score']
        penalty = t['fitiq_compliance_penalty'] if compliance_also_low else 0.20
        risk += penalty

    # 3. Biological contribution
    if state['biological_anomaly']:
        sev = state.get('anomaly_severity', 'NONE')
        risk += SEVERITY_WEIGHTS.get(sev, 0.0) * t['biological_anomaly_weight'] / 0.15

    # 4. Compute contribution
    avail = state.get('compute_availability', 1.0)
    if avail < t['compute_availability_floor']:
        risk += t['compute_degradation_weight']

    # 5. Settlement contribution
    amount = state.get('settlement_amount', 0.0)
    if amount > t['settlement_risk_threshold']:
        risk += t['settlement_risk_weight']

    return min(risk, 1.0)


def predict_violation(state: dict) -> int:
    """Predict whether a VIOLATION will occur in the next 2 time steps."""
    risk = compute_risk_score(state)
    return int(risk >= CAUSAL_THRESHOLDS['violation_prediction_threshold'])


# ── entry point ───────────────────────────────────────────────────────────────

def main():
    _train, val = load_data()
    evaluate_model(val, predict_violation)


if __name__ == '__main__':
    main()
