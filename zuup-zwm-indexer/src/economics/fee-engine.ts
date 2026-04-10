import { FeeRecordPayload, FeeType, ScaleCoherenceParams } from './types';
import { SCALE_PARAMS } from '../../config/scale-rules';

/**
 * Fee Engine — calculates basis-point fees on cross-platform ZUSDC settlements.
 *
 * The SWIFT model: ZWM doesn't extract wealth, it retains a micro-fee on
 * transactions that flow through its settlement rail as a natural consequence
 * of being embedded infrastructure.
 *
 * Fee schedule:
 *   - Cross-platform settlements: configurable basis points (default 5 bps = 0.05%)
 *   - Single-platform transactions: no fee (platforms handle their own pricing)
 *   - Fee is capped by scale coherence parameters to prevent extraction behavior
 */

const FEE_SCHEDULES: Record<FeeType, number> = {
  CROSS_PLATFORM_SETTLEMENT: 5,   // 5 basis points (0.05%)
  COMPLIANCE_ATTESTATION: 2,       // 2 basis points
  PROCUREMENT_MATCH: 3,            // 3 basis points
  COMPUTE_LEASE: 4,                // 4 basis points
  MIGRATION_CONTRACT: 3,           // 3 basis points
};

/**
 * Calculates the fee for a given settlement amount and type.
 * Returns null if the amount is below the fee threshold (no fee on micro-transactions).
 */
export function calculateFee(
  amountUsdc: number,
  feeType: FeeType,
  sourcePlatform: string,
  targetPlatform: string,
  params: ScaleCoherenceParams = SCALE_PARAMS,
): FeeRecordPayload | null {
  // No fee on single-platform transactions
  if (sourcePlatform === targetPlatform) return null;

  // No fee on amounts below $1 (micro-transaction threshold)
  if (amountUsdc < 1_000_000) return null; // USDC has 6 decimals

  const basisPoints = Math.min(
    FEE_SCHEDULES[feeType] ?? FEE_SCHEDULES.CROSS_PLATFORM_SETTLEMENT,
    params.basisPointsCeiling,
  );

  const effectiveBps = Math.max(basisPoints, params.basisPointsFloor);
  const feeAmount = Math.floor((amountUsdc * effectiveBps) / 10_000);

  if (feeAmount === 0) return null;

  return {
    settlementId: '', // Caller sets this to the actual settlement ID
    feeAmountUsdc: feeAmount,
    feeBasisPoints: effectiveBps,
    feeType,
    sourcePlatform,
    targetPlatform,
    entityId: '', // Caller sets this
  };
}

/**
 * Estimates annual revenue at a given transaction volume.
 * Used by the Scale Coherence evaluator for omega_rsf projections.
 */
export function estimateAnnualRevenue(
  dailyTransactionVolumeUsdc: number,
  averageBasisPoints: number = 4,
): number {
  return Math.floor((dailyTransactionVolumeUsdc * averageBasisPoints * 365) / 10_000);
}
