import { Driver } from 'neo4j-driver';
import { v4 as uuidv4 } from 'uuid';
import { CiviumStatePayload } from '../parsers/civium-parser';

export async function writeComplianceState(
  driver: Driver,
  payload: CiviumStatePayload,
  solanaSlot: number,
  txSignature: string
): Promise<string> {
  const session = driver.session();
  const stateId = uuidv4();
  const eventId = uuidv4();
  const now = Date.now();

  try {
    await session.executeWrite(async (tx) => {
      // 1. Merge WorldActor
      await tx.run(
        `MERGE (a:WorldActor {id: $entityId})
         ON CREATE SET a.created_at = $now
         SET a.last_seen = $now`,
        { entityId: payload.entityId, now }
      );

      // 2. Create ComplianceState
      await tx.run(
        `CREATE (s:ComplianceState {
           id: $stateId,
           entity_id: $entityId,
           status: $status,
           score: $score,
           domain: $domain,
           evidence_hash: $evidenceHash,
           timestamp: $timestamp,
           solana_slot: $solanaSlot,
           tx_signature: $txSignature
         })`,
        {
          stateId,
          entityId: payload.entityId,
          status: payload.status,
          score: payload.score,
          domain: payload.domain,
          evidenceHash: payload.evidenceHash,
          timestamp: payload.timestamp,
          solanaSlot,
          txSignature,
        }
      );

      // 3. Wire SUPERSEDES to previous current state (if any)
      await tx.run(
        `MATCH (a:WorldActor {id: $entityId})-[:HAS_STATE]->(prev:ComplianceState)
         WHERE NOT (prev)-[:SUPERSEDES]->()
         WITH prev
         MATCH (s:ComplianceState {id: $stateId})
         CREATE (s)-[:SUPERSEDES {at: $now}]->(prev)`,
        { entityId: payload.entityId, stateId, now }
      );

      // 4. Attach HAS_STATE
      await tx.run(
        `MATCH (a:WorldActor {id: $entityId}), (s:ComplianceState {id: $stateId})
         CREATE (a)-[:HAS_STATE {since: $timestamp, source: 'civium'}]->(s)`,
        { entityId: payload.entityId, stateId, timestamp: payload.timestamp }
      );

      // 5. Create SubstrateEvent
      await tx.run(
        `CREATE (e:SubstrateEvent {
           id: $eventId,
           type: 'COMPLIANCE_STATE_CHANGE',
           source: 'civium',
           entity_id: $entityId,
           payload_hash: $payloadHash,
           solana_slot: $solanaSlot,
           timestamp: $timestamp
         })`,
        {
          eventId,
          entityId: payload.entityId,
          payloadHash: Buffer.from(payload.evidenceHash).toString('hex'),
          solanaSlot,
          timestamp: payload.timestamp,
        }
      );

      // 6. Wire EMITTED edge
      await tx.run(
        `MATCH (s:ComplianceState {id: $stateId}), (e:SubstrateEvent {id: $eventId})
         CREATE (s)-[:EMITTED]->(e)`,
        { stateId, eventId }
      );
    });

    console.log(`[compliance-writer] Wrote ComplianceState ${stateId} + SubstrateEvent ${eventId} for entity ${payload.entityId}`);
    return eventId;
  } finally {
    await session.close();
  }
}
