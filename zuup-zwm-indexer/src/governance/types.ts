/** Governance layer types — Objective Register + Treaty Layer */

export type ObjectiveStatus =
  | 'PROPOSED'
  | 'VOTING'
  | 'APPROVED'
  | 'ACTIVE'
  | 'COMPLETED'
  | 'REJECTED'
  | 'TERMINATED';

export type ObjectiveType =
  | 'FINANCIAL_TARGET'
  | 'ADOPTION_MILESTONE'
  | 'JURISDICTIONAL_EXPANSION'
  | 'CAPABILITY_UPGRADE'
  | 'INFRASTRUCTURE_DEPLOYMENT';

export interface ObjectivePayload {
  objectiveType: ObjectiveType;
  targetMetric: string;
  targetValue: number;
  timeHorizonYears: number;
  omegaFloor: number;
  lyapunovEnvelope: number;
  status: ObjectiveStatus;
  proposerId: string;
  daoVoteId: string;
}

export type TreatyType =
  | 'BILATERAL_COMPLIANCE'
  | 'REGULATORY_RECOGNITION'
  | 'SETTLEMENT_AGREEMENT'
  | 'DATA_SHARING'
  | 'MUTUAL_ATTESTATION';

export interface TreatyAttestationPayload {
  jurisdictionCode: string;
  jurisdictionName: string;
  treatyType: TreatyType;
  complianceDomain: string;
  attestationHash: string;
  bilateralPartner: string;
  effectiveDate: number;
  expiryDate: number;
  civiumVerificationId: string;
}
