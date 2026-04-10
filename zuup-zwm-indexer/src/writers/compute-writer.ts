import { Driver } from 'neo4j-driver';
import { v4 as uuidv4 } from 'uuid';
import { PodxStatePayload } from '../parsers/podx-parser';

export async function writeComputeState(
  driver: Driver,
  payload: PodxStatePayload,
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
        `MERGE (a:WorldActor {id: $entityId})
           ON CREATE SET a.created_at = $now
           SET a.last_seen = $now
         WITH a
         CREATE (s:ComputeState {
           id: $stateId,
           entity_id: $entityId,
           xdop_score: $xdopScore,
           wcbi: $wcbiScore,
           ddil_hours: $ddilHours,
           tops: $tops,
           availability: $availability,
           timestamp: $timestamp,
           solana_slot: $solanaSlot,
           tx_signature: $txSignature,
           is_current: true
         })
         WITH a, s
         OPTIONAL MATCH (a)-[:HAS_STATE]->(prev:ComputeState {is_current: true})
           WHERE prev.id <> s.id
         SET prev.is_current = false
         WITH a, s, prev
         FOREACH (_ IN CASE WHEN prev IS NOT NULL THEN [1] ELSE [] END |
           CREATE (s)-[:SUPERSEDES {at: $now}]->(prev)
         )
         WITH a, s
         CREATE (a)-[:HAS_STATE {since: $timestamp, source: 'podx'}]->(s)
         WITH s
         CREATE (e:SubstrateEvent {
           id: $eventId,
           type: 'COMPUTE_DEGRADATION',
           source: 'podx',
           entity_id: $entityId,
           payload_hash: $payloadHash,
           solana_slot: $solanaSlot,
           timestamp: $timestamp
         })
         CREATE (s)-[:EMITTED]->(e)`,
        {
          stateId, entityId: payload.nodeId,
          xdopScore: payload.xdopScore, wcbiScore: payload.wcbiScore,
          ddilHours: payload.ddilHours, tops: payload.tops,
          availability: payload.availability,
          timestamp: payload.timestamp, solanaSlot, txSignature,
          payloadHash: `compute:xdop=${payload.xdopScore}:avail=${payload.availability}`,
          eventId, now,
        }
      );
    });

    console.log(`[compute-writer] Wrote ComputeState ${stateId} + SubstrateEvent ${eventId} for node ${payload.nodeId}`);
    return eventId;
  } finally {
    await session.close();
  }
}
