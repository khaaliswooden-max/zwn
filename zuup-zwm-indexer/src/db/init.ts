import { Driver } from 'neo4j-driver';

const CONSTRAINTS: string[] = [
  'CREATE CONSTRAINT worldactor_id IF NOT EXISTS FOR (n:WorldActor) REQUIRE n.id IS UNIQUE',
  'CREATE CONSTRAINT compliancestate_id IF NOT EXISTS FOR (n:ComplianceState) REQUIRE n.id IS UNIQUE',
  'CREATE CONSTRAINT procurementstate_id IF NOT EXISTS FOR (n:ProcurementState) REQUIRE n.id IS UNIQUE',
  'CREATE CONSTRAINT biologicalstate_id IF NOT EXISTS FOR (n:BiologicalState) REQUIRE n.id IS UNIQUE',
  'CREATE CONSTRAINT historicalrecon_id IF NOT EXISTS FOR (n:HistoricalRecon) REQUIRE n.id IS UNIQUE',
  'CREATE CONSTRAINT migrationstate_id IF NOT EXISTS FOR (n:MigrationState) REQUIRE n.id IS UNIQUE',
  'CREATE CONSTRAINT computestate_id IF NOT EXISTS FOR (n:ComputeState) REQUIRE n.id IS UNIQUE',
  'CREATE CONSTRAINT substratevent_id IF NOT EXISTS FOR (n:SubstrateEvent) REQUIRE n.id IS UNIQUE',
  'CREATE CONSTRAINT attestation_id IF NOT EXISTS FOR (n:Attestation) REQUIRE n.id IS UNIQUE',
];

const INDEXES: string[] = [
  'CREATE INDEX compliancestate_entity_ts IF NOT EXISTS FOR (n:ComplianceState) ON (n.entity_id, n.timestamp)',
  'CREATE INDEX procurementstate_entity_ts IF NOT EXISTS FOR (n:ProcurementState) ON (n.entity_id, n.timestamp)',
  'CREATE INDEX biologicalstate_entity_ts IF NOT EXISTS FOR (n:BiologicalState) ON (n.entity_id, n.timestamp)',
  'CREATE INDEX substratevent_source_type_ts IF NOT EXISTS FOR (n:SubstrateEvent) ON (n.source, n.type, n.timestamp)',
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
