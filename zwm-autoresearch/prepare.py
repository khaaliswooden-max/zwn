"""
prepare.py — ZWM Autoresearch (IMMUTABLE)
=========================================
Generates synthetic WorldActor state sequences matching the ZWM Neo4j schema
and defines the evaluation metric used by the autoresearch loop.

DO NOT MODIFY this file. The agent only modifies train.py.

Ground truth violation rule (known only here):
  compliance_score < 35
  OR (compliance_score < 55 AND fitiq < 42)
  OR (biological_anomaly AND anomaly_severity == 'HIGH' AND compute_availability < 0.92)

Prediction target: will this actor have a VIOLATION in the next 2 time steps?
Metric: negative F1 score (lower = better, matching autoresearch convention).
"""

import numpy as np
from sklearn.metrics import f1_score, precision_score, recall_score
from typing import List, Dict, Tuple

# ── constants ─────────────────────────────────────────────────────────────────

SEVERITIES = ['NONE', 'LOW', 'MEDIUM', 'HIGH']
SEVERITY_PROBS = [0.70, 0.15, 0.10, 0.05]

N_ACTORS = 500
N_STEPS = 20
PREDICT_HORIZON = 2   # steps ahead to predict
SEED = 42


# ── data generation ───────────────────────────────────────────────────────────

def _ground_truth_violation(state: Dict) -> bool:
    """True causal rule — not exposed to train.py."""
    c = state['compliance_score']
    f = state['fitiq']
    bio = state['biological_anomaly']
    sev = state['anomaly_severity']
    avail = state['compute_availability']

    if c < 35:
        return True
    if c < 55 and f < 42:
        return True
    if bio and sev == 'HIGH' and avail < 0.92:
        return True
    return False


def generate_actor(actor_id: str, rng: np.random.Generator) -> List[Dict]:
    """Generate a synthetic time series for one WorldActor."""
    compliance = rng.uniform(50, 100)
    fitiq = rng.uniform(45, 100)
    states = []

    for t in range(N_STEPS):
        # Drift compliance with mean-reversion + occasional shock
        compliance += rng.normal(0, 3)
        if rng.random() < 0.05:           # 5% chance of a shock event
            compliance -= rng.uniform(10, 30)
        compliance = float(np.clip(compliance, 0, 100))

        # FitIQ correlated with compliance (procurement follows compliance health)
        fitiq += rng.normal(0, 2) + 0.05 * (compliance - fitiq)
        fitiq = float(np.clip(fitiq, 0, 100))

        # Biological anomaly
        bio_anomaly = bool(rng.random() < 0.05)
        severity = str(rng.choice(SEVERITIES, p=SEVERITY_PROBS)) if bio_anomaly else 'NONE'

        # Compute availability (mostly high, degrades occasionally)
        compute_avail = float(np.clip(rng.uniform(0.85, 1.0) - (0.05 if rng.random() < 0.08 else 0), 0, 1))

        # Settlement amount (USDC, 6 decimals)
        settlement = float(rng.uniform(0, 2_000_000))

        state = {
            'actor_id': actor_id,
            'timestamp': t,
            'compliance_score': compliance,
            'fitiq': fitiq,
            'biological_anomaly': bio_anomaly,
            'anomaly_severity': severity,
            'compute_availability': compute_avail,
            'settlement_amount': settlement,
            'is_violation': _ground_truth_violation({
                'compliance_score': compliance,
                'fitiq': fitiq,
                'biological_anomaly': bio_anomaly,
                'anomaly_severity': severity,
                'compute_availability': compute_avail,
            }),
        }
        states.append(state)

    return states


def load_data() -> Tuple[List[Dict], List[Dict]]:
    """
    Generate the full synthetic dataset. Fixed seed for reproducibility.
    Returns (train_states, val_states) — each is a flat list of state dicts.
    The PREDICT_HORIZON-step-ahead label is embedded as 'future_violation'.
    """
    rng = np.random.default_rng(SEED)
    all_sequences: List[List[Dict]] = []

    for i in range(N_ACTORS):
        seq = generate_actor(f'actor_{i:04d}', rng)
        all_sequences.append(seq)

    # Flatten + attach future label
    labeled: List[Dict] = []
    for seq in all_sequences:
        for t, state in enumerate(seq):
            future_t = t + PREDICT_HORIZON
            if future_t >= len(seq):
                continue
            record = dict(state)
            record['future_violation'] = seq[future_t]['is_violation']
            labeled.append(record)

    # 80/20 split (actor-aligned: first 400 actors train, last 100 val)
    cutoff_actor = int(N_ACTORS * 0.8)
    cutoff_idx = cutoff_actor * (N_STEPS - PREDICT_HORIZON)
    train = labeled[:cutoff_idx]
    val = labeled[cutoff_idx:]
    return train, val


# ── metric ────────────────────────────────────────────────────────────────────

def evaluate_model(val_states: List[Dict], predict_fn) -> float:
    """
    Evaluate predict_fn against val_states.

    predict_fn(state: dict) -> int  (1 = violation predicted, 0 = not)

    Returns negative F1 score (lower = better).
    Prints val_metric and val_f1 for the autoresearch loop to parse.
    """
    predictions = [predict_fn(s) for s in val_states]
    actuals = [int(s['future_violation']) for s in val_states]

    f1 = f1_score(actuals, predictions, zero_division=0)
    precision = precision_score(actuals, predictions, zero_division=0)
    recall = recall_score(actuals, predictions, zero_division=0)
    violation_rate = sum(actuals) / len(actuals)

    metric = -f1  # minimise (autoresearch convention)

    print(f"val_metric: {metric:.4f}")
    print(f"val_f1: {f1:.4f}")
    print(f"val_precision: {precision:.4f}")
    print(f"val_recall: {recall:.4f}")
    print(f"val_violation_rate: {violation_rate:.4f}")
    print(f"val_n: {len(val_states)}")

    return metric


if __name__ == '__main__':
    # Smoke test: verify data generation
    train, val = load_data()
    violation_rate = sum(s['future_violation'] for s in val) / len(val)
    print(f"Train size: {len(train)}")
    print(f"Val size:   {len(val)}")
    print(f"Val violation rate: {violation_rate:.3f}")
    print("prepare.py OK")
