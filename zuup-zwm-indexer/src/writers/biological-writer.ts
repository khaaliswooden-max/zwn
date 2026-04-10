import { Driver } from 'neo4j-driver';
import { v4 as uuidv4 } from 'uuid';
import { SymbionStatePayload } from '../parsers/symbion-parser';

export async function writeBiologicalState(
  driver: Driver,
  payload: SymbionStatePayload,
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
         CREATE (s:BiologicalState {
           id: $stateId,
           entity_id: $entityId,
           serotonin: $serotonin,
           dopamine: $dopamine,
           cortisol: $cortisol,
           gaba: $gaba,
           anomaly_flag: $anomalyFlag,
           severity: $severity,
           timestamp: $timestamp,
           solana_slot: $solanaSlot,
           tx_signature: $txSignature,
           is_current: true
         })
         WITH a, s
         OPTIONAL MATCH (a)-[:HAS_STATE]->(prev:BiologicalState {is_current: true})
           WHERE prev.id <> s.id
         SET prev.is_current = false
         WITH a, s, prev
         FOREACH (_ IN CASE WHEN prev IS NOT NULL THEN [1] ELSE [] END |
           CREATE (s)-[:SUPERSEDES {at: $now}]->(prev)
         )
         WITH a, s
         CREATE (a)-[:HAS_STATE {since: $timestamp, source: 'symbion'}]->(s)
         WITH s
         CREATE (e:SubstrateEvent {
           id: $eventId,
           type: 'BIOLOGICAL_ANOMALY',
           source: 'symbion',
           entity_id: $entityId,
           payload_hash: $payloadHash,
           solana_slot: $solanaSlot,
           timestamp: $timestamp
         })
         CREATE (s)-[:EMITTED]->(e)`,
        {
          stateId, entityId: payload.subjectId,
          serotonin: payload.serotoninNm, dopamine: payload.dopamineNm,
          cortisol: payload.cortisolNm, gaba: payload.gabaNm,
          anomalyFlag: payload.anomalyFlag, severity: payload.severity,
          timestamp: payload.timestamp, solanaSlot, txSignature,
          payloadHash: `bio:${payload.severity}:anomaly=${payload.anomalyFlag}`,
          eventId, now,
        }
      );
    });

    console.log(`[biological-writer] Wrote BiologicalState ${stateId} + SubstrateEvent ${eventId} for subject ${payload.subjectId}`);
    return eventId;
  } finally {
    await session.close();
  }
}
