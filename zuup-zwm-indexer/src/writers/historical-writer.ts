import { Driver } from 'neo4j-driver';
import { v4 as uuidv4 } from 'uuid';
import { QalStatePayload } from '../parsers/qal-parser';

export async function writeHistoricalRecon(
  driver: Driver,
  payload: QalStatePayload,
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
         CREATE (s:HistoricalRecon {
           id: $stateId,
           entity_id: $entityId,
           domain: $domain,
           confidence: $confidence,
           temporal_depth_years: $temporalDepthYears,
           risk_level: $riskLevel,
           result_hash: $resultHash,
           timestamp: $timestamp,
           solana_slot: $solanaSlot,
           tx_signature: $txSignature,
           is_current: true
         })
         WITH a, s
         OPTIONAL MATCH (a)-[:HAS_STATE]->(prev:HistoricalRecon {is_current: true})
           WHERE prev.id <> s.id
         SET prev.is_current = false
         WITH a, s, prev
         FOREACH (_ IN CASE WHEN prev IS NOT NULL THEN [1] ELSE [] END |
           CREATE (s)-[:SUPERSEDES {at: $now}]->(prev)
         )
         WITH a, s
         CREATE (a)-[:HAS_STATE {since: $timestamp, source: 'qal'}]->(s)
         WITH s
         CREATE (e:SubstrateEvent {
           id: $eventId,
           type: 'RECONSTRUCTION_COMPLETE',
           source: 'qal',
           entity_id: $entityId,
           payload_hash: $payloadHash,
           solana_slot: $solanaSlot,
           timestamp: $timestamp
         })
         CREATE (s)-[:EMITTED]->(e)`,
        {
          stateId, entityId: payload.entityId, domain: payload.domain,
          confidence: payload.confidence, temporalDepthYears: payload.temporalDepthYears,
          riskLevel: payload.riskLevel, resultHash: payload.resultHash,
          timestamp: payload.timestamp, solanaSlot, txSignature,
          payloadHash: Buffer.from(payload.resultHash).toString('hex'),
          eventId, now,
        }
      );
    });

    console.log(`[historical-writer] Wrote HistoricalRecon ${stateId} + SubstrateEvent ${eventId} for entity ${payload.entityId}`);
    return eventId;
  } finally {
    await session.close();
  }
}
