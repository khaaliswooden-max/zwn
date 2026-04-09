// ─── ZWM Graph Schema Types ───────────────────────────────────────────────────
// Mirrors the Neo4j node properties defined in CLAUDE.md and graphql-server.ts.
// All state fields are optional because Neo4j returns what was written at event time.

export interface WorldActor {
  id: string;
  created_at?: number;
  last_seen?: number;
}

export interface ComplianceState {
  id: string;
  entity_id: string;
  /** "COMPLIANT" | "VIOLATION" | "FLAGGED" */
  status: string;
  score?: number;
  /** "halal" | "esg" | "itar" */
  domain?: string;
  timestamp?: number;
  solana_slot?: number;
  tx_signature?: string;
}

export interface ProcurementState {
  id: string;
  entity_id: string;
  fitiq?: number;
  upd?: number;
  timestamp?: number;
  solana_slot?: number;
  tx_signature?: string;
}

export interface BiologicalState {
  id: string;
  entity_id: string;
  serotonin?: number;
  dopamine?: number;
  cortisol?: number;
  gaba?: number;
  anomaly_flag?: boolean;
  sensitivity?: number;
  timestamp?: number;
}

export interface HistoricalRecon {
  id: string;
  entity_id: string;
  domain?: string;
  confidence?: number;
  temporal_depth_years?: number;
  risk_metrics?: string;
  timestamp?: number;
}

export interface MigrationState {
  id: string;
  project_id: string;
  semantic_preservation?: number;
  test_coverage?: number;
  velocity_loc_day?: number;
  artifact_hash?: string;
  timestamp?: number;
}

export interface ComputeState {
  id: string;
  entity_id: string;
  xdop_score?: number;
  wcbi?: number;
  ddil_hours?: number;
  tops?: number;
  availability?: number;
  timestamp?: number;
}

export interface SubstrateEvent {
  id: string;
  type: string;
  source: string;
  entity_id?: string;
  payload_hash?: string;
  solana_slot?: number;
  timestamp?: number;
}

export interface CausalLink {
  event: SubstrateEvent;
  effect: Record<string, unknown>;
}

export interface CompositeRisk {
  entityId: string;
  complianceStatus?: string;
  complianceScore?: number;
  fitiq?: number;
  availability?: number;
  anomalyFlag?: boolean;
  /** "LOW" | "MEDIUM" | "HIGH" | "CRITICAL" */
  riskLevel: string;
}

export interface FullWorldState {
  actor: WorldActor;
  compliance?: ComplianceState;
  procurement?: ProcurementState;
  biological?: BiologicalState;
  historical?: HistoricalRecon;
  migration?: MigrationState;
  compute?: ComputeState;
}
