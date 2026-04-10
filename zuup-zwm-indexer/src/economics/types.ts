/** Economics layer types — Fee Engine + Scale Coherence (D7) */

export type FeeType =
  | 'CROSS_PLATFORM_SETTLEMENT'
  | 'COMPLIANCE_ATTESTATION'
  | 'PROCUREMENT_MATCH'
  | 'COMPUTE_LEASE'
  | 'MIGRATION_CONTRACT';

export interface FeeRecordPayload {
  settlementId: string;
  feeAmountUsdc: number;
  feeBasisPoints: number;
  feeType: FeeType;
  sourcePlatform: string;
  targetPlatform: string;
  entityId: string;
}

export type AssessmentStatus =
  | 'STABLE'
  | 'APPROACHING_CEILING'
  | 'SCALE_BREACH'
  | 'CONTRACTING';

export interface ScaleMetricPayload {
  platform: string;
  omegaRsf: number;
  omegaMax: number;
  entropyProduction: number;
  lyapunovExponent: number;
  marketFootprint: number;
  jurisdictionalCoverage: number;
  assessmentStatus: AssessmentStatus;
}

/** Parameters for the omega_max envelope calculation. */
export interface ScaleCoherenceParams {
  maxEntropyBudget: number;
  marketSizeEstimate: number;
  requiredJurisdictions: number;
  basisPointsCeiling: number;
  basisPointsFloor: number;
}
