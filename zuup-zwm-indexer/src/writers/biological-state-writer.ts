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
      // WorldActor keyed on subject_id
      await tx.run(
        `MERGE (a:WorldActor {id: $subjectId})
         ON CREATE SET a.created_at = $now
         SET a.last_seen = $now`,
        { subjectId: payload.subjectId, now }
      );

      await tx.run(
        `CREATE (s:BiologicalState {
           id: $stateId,
           entity_id: $subjectId,
           serotonin: $serotoninNm,
           dopamine: $dopamineNm,
           cortisol: $cortisolNm,
           gaba: $gabaNm,
           anomaly_flag: $anomalyFlag,
           sensitivity: $severity,
           timestamp: $timestamp,
           solana_slot: $solanaSlot,
           tx_signature: $txSignature
         })`,
        {
          stateId,
          subjectId: payload.subjectId,
          serotoninNm: payload.serotoninNm,
          dopamineNm: payload.dopamineNm,
          cortisolNm: payload.cortisolNm,
          gabaNm: payload.gabaNm,
          anomalyFlag: payload.anomalyFlag,
          severity: payload.severity,
          timestamp: payload.timestamp,
          solanaSlot,
          txSignature,
        }
      );

      await tx.run(
        `MATCH (a:WorldActor {id: $subjectId})-[:HAS_STATE]->(prev:BiologicalState)
         WHERE NOT (prev)-[:SUPERSEDES]->()
         WITH prev MATCH (s:BiologicalState {id: $stateId})
         CREATE (s)-[:SUPERSEDES {at: $now}]->(prev)`,
        { subjectId: payload.subjectId, stateId, now }
      );

      await tx.run(
        `MATCH (a:WorldActor {id: $subjectId}), (s:BiologicalState {id: $stateId})
         CREATE (a)-[:HAS_STATE {since: $timestamp, source: 'symbion'}]->(s)`,
        { subjectId: payload.subjectId, stateId, timestamp: payload.timestamp }
      );

      // Event type depends on whether this is an anomaly reading
      const eventType = payload.anomalyFlag ? 'BIOLOGICAL_ANOMALY' : 'BIOLOGICAL_READING';
      await tx.run(
        `CREATE (e:SubstrateEvent {
           id: $eventId,
           type: $eventType,
           source: 'symbion',
           entity_id: $subjectId,
           payload_hash: $payloadHash,
           solana_slot: $solanaSlot,
           timestamp: $timestamp
         })`,
        {
          eventId,
          eventType,
          subjectId: payload.subjectId,
          payloadHash: `anomaly:${payload.anomalyFlag}:severity:${payload.severity}`,
          solanaSlot,
          timestamp: payload.timestamp,
        }
      );

      await tx.run(
        `MATCH (s:BiologicalState {id: $stateId}), (e:SubstrateEvent {id: $eventId})
         CREATE (s)-[:EMITTED]->(e)`,
        { stateId, eventId }
      );
    });

    console.log(`[biological-state-writer] Wrote BiologicalState ${stateId} for subject ${payload.subjectId}`);
    return eventId;
  } finally {
    await session.close();
  }
}
