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
      await tx.run(
        `// 1. Merge WorldActor
         MERGE (a:WorldActor {id: $entityId})
           ON CREATE SET a.created_at = $now
           SET a.last_seen = $now
         WITH a
         // 2. Create new ProcurementState (is_current = true)
         CREATE (s:ProcurementState {
           id: $stateId,
           entity_id: $entityId,
           fitiq: $fitiq,
           upd: $upd,
           opportunity_count: $opportunityCount,
           timestamp: $timestamp,
           solana_slot: $solanaSlot,
           tx_signature: $txSignature,
           is_current: true
         })
         WITH a, s
         // 3. Find previous current state and mark it superseded
         OPTIONAL MATCH (a)-[:HAS_STATE]->(prev:ProcurementState {is_current: true})
           WHERE prev.id <> s.id
         SET prev.is_current = false
         WITH a, s, prev
         // 4. Wire SUPERSEDES edge to previous state (if any)
         FOREACH (_ IN CASE WHEN prev IS NOT NULL THEN [1] ELSE [] END |
           CREATE (s)-[:SUPERSEDES {at: $now}]->(prev)
         )
         WITH a, s
         // 5. Attach HAS_STATE
         CREATE (a)-[:HAS_STATE {since: $timestamp, source: 'aureon'}]->(s)
         WITH s
         // 6. Create SubstrateEvent + EMITTED edge
         CREATE (e:SubstrateEvent {
           id: $eventId,
           type: 'PROCUREMENT_STATE_CHANGE',
           source: 'aureon',
           entity_id: $entityId,
           payload_hash: $payloadHash,
           solana_slot: $solanaSlot,
           timestamp: $timestamp
         })
         CREATE (s)-[:EMITTED]->(e)`,
        {
          stateId,
          entityId: payload.entityId,
          fitiq: payload.fitiqScore,
          upd: payload.updScore,
          opportunityCount: payload.opportunityCount,
          timestamp: payload.timestamp,
          solanaSlot,
          txSignature,
          payloadHash: `fitiq:${payload.fitiqScore}:upd:${payload.updScore}`,
          eventId,
          now,
        }
      );

      // 7. Wire CAUSED_BY if this was triggered by a causal event (separate query - needs conditional logic)
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
