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
      await tx.run(
        `// 1. Merge WorldActor
         MERGE (a:WorldActor {id: $entityId})
           ON CREATE SET a.created_at = $now
           SET a.last_seen = $now
         WITH a
         // 2. Create new ComplianceState (is_current = true)
         CREATE (s:ComplianceState {
           id: $stateId,
           entity_id: $entityId,
           status: $status,
           score: $score,
           domain: $domain,
           evidence_hash: $evidenceHash,
           timestamp: $timestamp,
           solana_slot: $solanaSlot,
           tx_signature: $txSignature,
           is_current: true
         })
         WITH a, s
         // 3. Find previous current state and mark it superseded
         OPTIONAL MATCH (a)-[:HAS_STATE]->(prev:ComplianceState {is_current: true})
           WHERE prev.id <> s.id
         SET prev.is_current = false
         WITH a, s, prev
         // 4. Wire SUPERSEDES edge to previous state (if any)
         FOREACH (_ IN CASE WHEN prev IS NOT NULL THEN [1] ELSE [] END |
           CREATE (s)-[:SUPERSEDES {at: $now}]->(prev)
         )
         WITH a, s
         // 5. Attach HAS_STATE
         CREATE (a)-[:HAS_STATE {since: $timestamp, source: 'civium'}]->(s)
         WITH s
         // 6. Create SubstrateEvent + EMITTED edge
         CREATE (e:SubstrateEvent {
           id: $eventId,
           type: 'COMPLIANCE_STATE_CHANGE',
           source: 'civium',
           entity_id: $entityId,
           payload_hash: $payloadHash,
           solana_slot: $solanaSlot,
           timestamp: $timestamp
         })
         CREATE (s)-[:EMITTED]->(e)`,
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
          payloadHash: Buffer.from(payload.evidenceHash).toString('hex'),
          eventId,
          now,
        }
      );
    });

    console.log(`[compliance-writer] Wrote ComplianceState ${stateId} + SubstrateEvent ${eventId} for entity ${payload.entityId}`);
    return eventId;
  } finally {
    await session.close();
  }
}
