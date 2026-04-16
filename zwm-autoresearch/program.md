# ZWM Causal Rule Optimizer — Research Program

## Background

The Zuup World Model (ZWM) is a causal graph representing institutional state across
nine Solana-deployed platforms (Civium, Aureon, QAL, Symbion, Relian, PodX, Veyra,
ZUSDC, ZuupHQ). The causal rules in `config/causal-rules.ts` use hand-tuned threshold
values designed by a human architect.

This autoresearch session asks: **are those hand-tuned thresholds optimal?**

## Goal

Optimize `CAUSAL_THRESHOLDS` and `SEVERITY_WEIGHTS` in `train.py` to **minimize
`val_metric`** (= negative F1 score for predicting compliance VIOLATION states
2 time steps ahead). Lower val_metric = higher F1 = better violation prediction.

**Current hand-tuned baseline thresholds (from CLAUDE.md and causal-rules.ts):**
- `compliance_violation_score`: 40 (score below this = VIOLATION)
- `compliance_warning_score`: 60
- `fitiq_risk_threshold`: 50 (FitIQ below this → FLAG_SETTLEMENT)
- `fitiq_compliance_penalty`: 0.40 (40% from causal-rules.ts)
- `biological_anomaly_weight`: 0.15
- `compute_availability_floor`: 0.90 (from causal-rules.ts)
- `violation_prediction_threshold`: 0.45

## Hard Constraints

- **Do not modify `prepare.py`** — it is immutable
- All threshold values must remain **physically interpretable** (no neural nets, no learned embeddings)
- `compliance_violation_score` must remain in **[20, 70]**
- `fitiq_risk_threshold` must remain in **[20, 80]**
- All weight/multiplier values must be in **[0.0, 1.0]**
- The output format must remain: `val_metric: -X.XXXX` on a line by itself

## Suggested Experiments (try one per iteration)

1. **Lower compliance_violation_score** (try 30–38) — the ground truth may be stricter
2. **Lower compliance_warning_score** (try 50–58)
3. **Lower fitiq_risk_threshold** (try 38–48)
4. **Increase fitiq_compliance_penalty** (try 0.45–0.60)
5. **Tune biological_anomaly_weight** (try 0.05–0.30)
6. **Increase HIGH severity weight** in SEVERITY_WEIGHTS (try 0.30–0.45)
7. **Lower violation_prediction_threshold** (try 0.30–0.45)
8. **Add interaction term**: if both compliance_score < X AND fitiq < Y, add extra risk
9. **Add compute × biological joint signal**: degraded compute amplifies bio anomaly risk
10. **Add settlement_amount as a risk factor** (large settlements = higher exposure)
11. **Stack best changes** from earlier kept experiments

## Reading the Output

```
val_metric: -0.7142      ← primary metric (lower = better)
val_f1: 0.7142           ← human-readable F1
val_precision: 0.6800    ← precision on VIOLATION class
val_recall: 0.7520       ← recall on VIOLATION class
val_violation_rate: 0.12 ← fraction of val set that is VIOLATION
val_n: 1800              ← validation set size
```

## Success Criteria

- Baseline target: F1 ≥ 0.72 (val_metric ≤ -0.72)
- Stretch target: F1 ≥ 0.80 (val_metric ≤ -0.80)
- If F1 exceeds 0.85, note which thresholds differ most from hand-tuned values

## Important Notes

- Each iteration proposes **exactly one change**
- If a change hurts the metric, it is reverted automatically — don't be afraid to try
- Bold changes (multiple thresholds at once) are fine for a single experiment
- You may add new risk signals to `compute_risk_score` if they are interpretable
- You may restructure the risk formula (e.g., multiplicative instead of additive)
  as long as the output is still a scalar in [0, 1]
