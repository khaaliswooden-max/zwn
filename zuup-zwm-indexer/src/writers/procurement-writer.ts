import { Driver } from 'neo4j-driver';
import { v4 as uuidv4 } from 'uuid';
import { AureonStatePayload } from '../parsers/aureon-parser';

export async function writeProcurementState(
  driver: Driver,
  payload: AureonStatePayload,
  solanaSlot: number,
  txSignature: string,
  causedByEventId?: string
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

      // 2. Create ProcurementState
      await tx.run(
        `CREATE (s:ProcurementState {
           id: $stateId,
           entity_id: $entityId,
           fitiq: $fitiq,
           upd: $upd,
           opportunity_count: $opportunityCount,
           timestamp: $timestamp,
           solana_slot: $solanaSlot,
           tx_signature: $txSignature
         })`,
        {
          stateId,
          entityId: payload.entityId,
          fitiq: payload.fitiqScore,
          upd: payload.updScore,
          opportunityCount: payload.opportunityCount,
          timestamp: payload.timestamp,
          solanaSlot,
          txSignature,
        }
      );

      // 3. Wire SUPERSEDES to previous current state (if any)
      await tx.run(
        `MATCH (a:WorldActor {id: $entityId})-[:HAS_STATE]->(prev:ProcurementState)
         WHERE NOT (prev)-[:SUPERSEDES]->()
         WITH prev
         MATCH (s:ProcurementState {id: $stateId})
         CREATE (s)-[:SUPERSEDES {at: $now}]->(prev)`,
        { entityId: payload.entityId, stateId, now }
      );

      // 4. Attach HAS_STATE
      await tx.run(
        `MATCH (a:WorldActor {id: $entityId}), (s:ProcurementState {id: $stateId})
         CREATE (a)-[:HAS_STATE {since: $timestamp, source: 'aureon'}]->(s)`,
        { entityId: payload.entityId, stateId, timestamp: payload.timestamp }
      );

      // 5. Create SubstrateEvent
      await tx.run(
        `CREATE (e:SubstrateEvent {
           id: $eventId,
           type: 'PROCUREMENT_STATE_CHANGE',
           source: 'aureon',
           entity_id: $entityId,
           payload_hash: $payloadHash,
           solana_slot: $solanaSlot,
           timestamp: $timestamp
         })`,
        {
          eventId,
          entityId: payload.entityId,
          payloadHash: `fitiq:${payload.fitiqScore}:upd:${payload.updScore}`,
          solanaSlot,
          timestamp: payload.timestamp,
        }
      );

      // 6. Wire EMITTED edge
      await tx.run(
        `MATCH (s:ProcurementState {id: $stateId}), (e:SubstrateEvent {id: $eventId})
         CREATE (s)-[:EMITTED]->(e)`,
        { stateId, eventId }
      );

      // 7. Wire CAUSED_BY if this was triggered by a causal event
      if (causedByEventId) {
        await tx.run(
          `MATCH (s:ProcurementState {id: $stateId}), (trigger:SubstrateEvent {id: $causedByEventId})
           CREATE (s)-[:CAUSED_BY {lag_ms: $lagMs, rule_id: 'COMPLIANCE_STATE_CHANGE->RECALCULATE_FIT_IQ'}]->(trigger)`,
          {
            stateId,
            causedByEventId,
            lagMs: Date.now() - now,
          }
        );
      }
    });

    console.log(`[procurement-writer] Wrote ProcurementState ${stateId} + SubstrateEvent ${eventId} for entity ${payload.entityId}`);
    return eventId;
  } finally {
    await session.close();
  }
}
