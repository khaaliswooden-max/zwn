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
         SET a.last_seen = $now`,
        { entityId: payload.entityId, now }
      );

      await tx.run(
        `CREATE (s:HistoricalRecon {
           id: $stateId,
           entity_id: $entityId,
           domain: $domain,
           confidence: $confidence,
           temporal_depth_years: $temporalDepthYears,
           risk_metrics: $riskLevel,
           timestamp: $timestamp,
           solana_slot: $solanaSlot,
           tx_signature: $txSignature
         })`,
        {
          stateId,
          entityId: payload.entityId,
          domain: payload.domain,
          confidence: payload.confidence,
          temporalDepthYears: payload.temporalDepthYears,
          riskLevel: payload.riskLevel,
          timestamp: payload.timestamp,
          solanaSlot,
          txSignature,
        }
      );

      await tx.run(
        `MATCH (a:WorldActor {id: $entityId})-[:HAS_STATE]->(prev:HistoricalRecon)
         WHERE NOT (prev)-[:SUPERSEDES]->()
         WITH prev MATCH (s:HistoricalRecon {id: $stateId})
         CREATE (s)-[:SUPERSEDES {at: $now}]->(prev)`,
        { entityId: payload.entityId, stateId, now }
      );

      await tx.run(
        `MATCH (a:WorldActor {id: $entityId}), (s:HistoricalRecon {id: $stateId})
         CREATE (a)-[:HAS_STATE {since: $timestamp, source: 'qal'}]->(s)`,
        { entityId: payload.entityId, stateId, timestamp: payload.timestamp }
      );

      await tx.run(
        `CREATE (e:SubstrateEvent {
           id: $eventId,
           type: 'RECONSTRUCTION_COMPLETE',
           source: 'qal',
           entity_id: $entityId,
           payload_hash: $payloadHash,
           solana_slot: $solanaSlot,
           timestamp: $timestamp
         })`,
        {
          eventId,
          entityId: payload.entityId,
          payloadHash: `confidence:${payload.confidence}:domain:${payload.domain}`,
          solanaSlot,
          timestamp: payload.timestamp,
        }
      );

      await tx.run(
        `MATCH (s:HistoricalRecon {id: $stateId}), (e:SubstrateEvent {id: $eventId})
         CREATE (s)-[:EMITTED]->(e)`,
        { stateId, eventId }
      );
    });

    console.log(`[historical-recon-writer] Wrote HistoricalRecon ${stateId} for entity ${payload.entityId}`);
    return eventId;
  } finally {
    await session.close();
  }
}
