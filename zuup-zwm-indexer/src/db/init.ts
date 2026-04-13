import { Driver } from 'neo4j-driver';

const CONSTRAINTS: string[] = [
  // --- Core substrate state constraints ---
  'CREATE CONSTRAINT worldactor_id IF NOT EXISTS FOR (n:WorldActor) REQUIRE n.id IS UNIQUE',
  'CREATE CONSTRAINT compliancestate_id IF NOT EXISTS FOR (n:ComplianceState) REQUIRE n.id IS UNIQUE',
  'CREATE CONSTRAINT procurementstate_id IF NOT EXISTS FOR (n:ProcurementState) REQUIRE n.id IS UNIQUE',
  'CREATE CONSTRAINT biologicalstate_id IF NOT EXISTS FOR (n:BiologicalState) REQUIRE n.id IS UNIQUE',
  'CREATE CONSTRAINT historicalrecon_id IF NOT EXISTS FOR (n:HistoricalRecon) REQUIRE n.id IS UNIQUE',
  'CREATE CONSTRAINT migrationstate_id IF NOT EXISTS FOR (n:MigrationState) REQUIRE n.id IS UNIQUE',
  'CREATE CONSTRAINT computestate_id IF NOT EXISTS FOR (n:ComputeState) REQUIRE n.id IS UNIQUE',
  'CREATE CONSTRAINT substratevent_id IF NOT EXISTS FOR (n:SubstrateEvent) REQUIRE n.id IS UNIQUE',
  'CREATE CONSTRAINT attestation_id IF NOT EXISTS FOR (n:Attestation) REQUIRE n.id IS UNIQUE',
  'CREATE CONSTRAINT reasoningstate_id IF NOT EXISTS FOR (n:ReasoningState) REQUIRE n.id IS UNIQUE',
  'CREATE CONSTRAINT settlementrecord_id IF NOT EXISTS FOR (n:SettlementRecord) REQUIRE n.id IS UNIQUE',
  // --- Governance + Economics constraints ---
  'CREATE CONSTRAINT objectivestate_id IF NOT EXISTS FOR (n:ObjectiveState) REQUIRE n.id IS UNIQUE',
  'CREATE CONSTRAINT treatyattestation_id IF NOT EXISTS FOR (n:TreatyAttestation) REQUIRE n.id IS UNIQUE',
  'CREATE CONSTRAINT feerecord_id IF NOT EXISTS FOR (n:FeeRecord) REQUIRE n.id IS UNIQUE',
  'CREATE CONSTRAINT scalemetric_id IF NOT EXISTS FOR (n:ScaleMetric) REQUIRE n.id IS UNIQUE',
  // --- Neural Network layer constraints ---
  'CREATE CONSTRAINT anomalyscore_id IF NOT EXISTS FOR (n:AnomalyScore) REQUIRE n.id IS UNIQUE',
];

const INDEXES: string[] = [
  // --- Core substrate state indexes ---
  'CREATE INDEX compliancestate_entity_ts IF NOT EXISTS FOR (n:ComplianceState) ON (n.entity_id, n.timestamp)',
  'CREATE INDEX procurementstate_entity_ts IF NOT EXISTS FOR (n:ProcurementState) ON (n.entity_id, n.timestamp)',
  'CREATE INDEX biologicalstate_entity_ts IF NOT EXISTS FOR (n:BiologicalState) ON (n.entity_id, n.timestamp)',
  'CREATE INDEX substratevent_source_type_ts IF NOT EXISTS FOR (n:SubstrateEvent) ON (n.source, n.type, n.timestamp)',
  // --- Governance + Economics indexes ---
  'CREATE INDEX objectivestate_status_ts IF NOT EXISTS FOR (n:ObjectiveState) ON (n.status, n.timestamp)',
  'CREATE INDEX treatyattestation_jurisdiction IF NOT EXISTS FOR (n:TreatyAttestation) ON (n.jurisdiction_code, n.effective_date)',
  'CREATE INDEX feerecord_entity_ts IF NOT EXISTS FOR (n:FeeRecord) ON (n.entity_id, n.timestamp)',
  'CREATE INDEX scalemetric_platform_ts IF NOT EXISTS FOR (n:ScaleMetric) ON (n.platform, n.timestamp)',
  // --- is_current fast-path indexes (O(1) current-state lookup, replaces SUPERSEDES scan) ---
  'CREATE INDEX compliancestate_current IF NOT EXISTS FOR (n:ComplianceState) ON (n.entity_id, n.is_current)',
  'CREATE INDEX procurementstate_current IF NOT EXISTS FOR (n:ProcurementState) ON (n.entity_id, n.is_current)',
  'CREATE INDEX biologicalstate_current IF NOT EXISTS FOR (n:BiologicalState) ON (n.entity_id, n.is_current)',
  'CREATE INDEX historicalrecon_current IF NOT EXISTS FOR (n:HistoricalRecon) ON (n.entity_id, n.is_current)',
  'CREATE INDEX migrationstate_current IF NOT EXISTS FOR (n:MigrationState) ON (n.project_id, n.is_current)',
  'CREATE INDEX computestate_current IF NOT EXISTS FOR (n:ComputeState) ON (n.entity_id, n.is_current)',
  'CREATE INDEX objectivestate_current IF NOT EXISTS FOR (n:ObjectiveState) ON (n.objective_type, n.is_current)',
  'CREATE INDEX scalemetric_current IF NOT EXISTS FOR (n:ScaleMetric) ON (n.platform, n.is_current)',
  'CREATE INDEX reasoningstate_current IF NOT EXISTS FOR (n:ReasoningState) ON (n.request_id, n.is_current)',
  'CREATE INDEX settlementrecord_entity_ts IF NOT EXISTS FOR (n:SettlementRecord) ON (n.counterparty_id, n.timestamp)',
  // --- Neural Network layer indexes ---
  'CREATE INDEX anomalyscore_entity_ts IF NOT EXISTS FOR (n:AnomalyScore) ON (n.entity_id, n.timestamp)',
  'CREATE INDEX anomalyscore_substrate IF NOT EXISTS FOR (n:AnomalyScore) ON (n.substrate, n.is_anomaly)',
];

export async function initDb(driver: Driver): Promise<void> {
  const session = driver.session();
  try {
    for (const cypher of [...CONSTRAINTS, ...INDEXES]) {
      await session.run(cypher);
    }
    console.log('[db/init] Constraints and indexes applied.');
  } finally {
    await session.close();
  }
}
