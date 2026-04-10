import { Driver } from 'neo4j-driver';
import { v4 as uuidv4 } from 'uuid';
import { VeyraStatePayload } from '../parsers/veyra-parser';

export async function writeReasoningState(
  driver: Driver,
  payload: VeyraStatePayload,
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
         CREATE (s:ReasoningState {
           id: $stateId,
           request_id: $requestId,
           context: $context,
           v_score: $vScore,
           latency_ms: $latencyMs,
           output_hash: $outputHash,
           timestamp: $timestamp,
           solana_slot: $solanaSlot,
           tx_signature: $txSignature,
           is_current: true
         })
         WITH a, s
         OPTIONAL MATCH (a)-[:HAS_STATE]->(prev:ReasoningState {is_current: true})
           WHERE prev.id <> s.id
         SET prev.is_current = false
         WITH a, s, prev
         FOREACH (_ IN CASE WHEN prev IS NOT NULL THEN [1] ELSE [] END |
           CREATE (s)-[:SUPERSEDES {at: $now}]->(prev)
         )
         WITH a, s
         CREATE (a)-[:HAS_STATE {since: $timestamp, source: 'veyra'}]->(s)
         WITH s
         CREATE (e:SubstrateEvent {
           id: $eventId,
           type: 'REASONING_COMPLETE',
           source: 'veyra',
           entity_id: $entityId,
           payload_hash: $payloadHash,
           solana_slot: $solanaSlot,
           timestamp: $timestamp
         })
         CREATE (s)-[:EMITTED]->(e)`,
        {
          stateId, entityId: payload.requestId,
          requestId: payload.requestId, context: payload.context,
          vScore: payload.vScore, latencyMs: payload.latencyMs,
          outputHash: Buffer.from(payload.outputHash).toString('hex'),
          timestamp: payload.timestamp, solanaSlot, txSignature,
          payloadHash: `reasoning:vscore=${payload.vScore}:lat=${payload.latencyMs}ms`,
          eventId, now,
        }
      );
    });

    console.log(`[reasoning-writer] Wrote ReasoningState ${stateId} + SubstrateEvent ${eventId} for request ${payload.requestId}`);
    return eventId;
  } finally {
    await session.close();
  }
}
