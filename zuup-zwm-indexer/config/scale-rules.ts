import { ScaleCoherenceParams } from '../src/economics/types';

/**
 * D7 Scale Coherence parameters.
 *
 * These define the omega_max envelope — the maximum viable RSF coefficient
 * at which a platform can operate while remaining thermodynamically and
 * institutionally stable.
 *
 * omega_max = (market_footprint / market_size) * (jurisdictions / required) * (1 - entropy / budget)
 *
 * Calibration notes:
 *   - maxEntropyBudget: derived from Boltzmann entropy for a 9-substrate system
 *     with ~10^6 active entities. Initial value is empirical; recalibrate after
 *     6 months of production data.
 *   - marketSizeEstimate: global addressable market for cross-platform settlement
 *     (initial: procurement + compliance + compute leasing TAM).
 *   - requiredJurisdictions: minimum bilateral treaties needed for omega_max = 1.0.
 *     195 = UN member states. In practice, 40-50 cover 90%+ of global GDP.
 *   - basisPointsCeiling/Floor: hard guardrails on fee extraction to prevent
 *     the system from optimizing toward rent-seeking behavior.
 */
export const SCALE_PARAMS: ScaleCoherenceParams = {
  maxEntropyBudget: 1000,
  marketSizeEstimate: 2_000_000_000_000_000, // $2 quadrillion global transaction volume
  requiredJurisdictions: 50,                  // 50 jurisdictions ≈ 90% global GDP coverage
  basisPointsCeiling: 10,                     // max 10 bps (0.10%) — hard cap
  basisPointsFloor: 1,                        // min 1 bp (0.01%) — below this, no fee
};
