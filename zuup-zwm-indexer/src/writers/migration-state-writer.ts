import { Driver } from 'neo4j-driver';
import { v4 as uuidv4 } from 'uuid';
import { RelianStatePayload } from '../parsers/relian-parser';

export async function writeMigrationState(
  driver: Driver,
  payload: RelianStatePayload,
  solanaSlot: number,
  txSignature: string
): Promise<string> {
  const session = driver.session();
  const stateId = uuidv4();
  const eventId = uuidv4();
  const now = Date.now();

  try {
    await session.executeWrite(async (tx) => {
      // MigrationState is keyed on project_id (not a WorldActor entity)
      await tx.run(
        `MERGE (a:WorldActor {id: $projectId})
         ON CREATE SET a.created_at = $now
         SET a.last_seen = $now`,
        { projectId: payload.projectId, now }
      );

      await tx.run(
        `CREATE (s:MigrationState {
           id: $stateId,
           project_id: $projectId,
           semantic_preservation: $semanticPreservation,
           test_coverage: $testCoverage,
           velocity_loc_day: $locMigrated,
           artifact_hash: $artifactHash,
           timestamp: $timestamp,
           solana_slot: $solanaSlot,
           tx_signature: $txSignature
         })`,
        {
          stateId,
          projectId: payload.projectId,
          semanticPreservation: payload.semanticPreservation,
          testCoverage: payload.testCoverage,
          locMigrated: payload.locMigrated,
          artifactHash: Buffer.from(payload.artifactHash).toString('hex'),
          timestamp: payload.timestamp,
          solanaSlot,
          txSignature,
        }
      );

      await tx.run(
        `MATCH (a:WorldActor {id: $projectId})-[:HAS_STATE]->(prev:MigrationState)
         WHERE NOT (prev)-[:SUPERSEDES]->()
         WITH prev MATCH (s:MigrationState {id: $stateId})
         CREATE (s)-[:SUPERSEDES {at: $now}]->(prev)`,
        { projectId: payload.projectId, stateId, now }
      );

      await tx.run(
        `MATCH (a:WorldActor {id: $projectId}), (s:MigrationState {id: $stateId})
         CREATE (a)-[:HAS_STATE {since: $timestamp, source: 'relian'}]->(s)`,
        { projectId: payload.projectId, stateId, timestamp: payload.timestamp }
      );

      await tx.run(
        `CREATE (e:SubstrateEvent {
           id: $eventId,
           type: 'MIGRATION_COMPLETE',
           source: 'relian',
           entity_id: $projectId,
           payload_hash: $artifactHash,
           solana_slot: $solanaSlot,
           timestamp: $timestamp
         })`,
        {
          eventId,
          projectId: payload.projectId,
          artifactHash: Buffer.from(payload.artifactHash).toString('hex'),
          solanaSlot,
          timestamp: payload.timestamp,
        }
      );

      await tx.run(
        `MATCH (s:MigrationState {id: $stateId}), (e:SubstrateEvent {id: $eventId})
         CREATE (s)-[:EMITTED]->(e)`,
        { stateId, eventId }
      );
    });

    console.log(`[migration-state-writer] Wrote MigrationState ${stateId} for project ${payload.projectId}`);
    return eventId;
  } finally {
    await session.close();
  }
}
