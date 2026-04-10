import { Driver } from 'neo4j-driver';
import { v4 as uuidv4 } from 'uuid';
import { ObjectivePayload } from './types';

/**
 * Writes an ObjectiveState node to the Neo4j graph.
 * Follows the same append-only pattern as compliance-writer.ts:
 *   1. Merge WorldActor (the proposer)
 *   2. Create ObjectiveState node (is_current = true)
 *   3. Wire SUPERSEDES to previous objective of the same type (if any)
 *   4. Attach GOVERNS edge to target entity (or global)
 *   5. Create SubstrateEvent + EMITTED edge
 *
 * Batched into a single Cypher statement (6 round-trips -> 1).
 */
export async function writeObjectiveState(
  driver: Driver,
  payload: ObjectivePayload,
  targetEntityId: string,
  solanaSlot: number,
  txSignature: string,
): Promise<string> {
  const session = driver.session();
  const stateId = uuidv4();
  const eventId = uuidv4();
  const now = Date.now();

  try {
    await session.executeWrite(async (tx) => {
      // Main batched write: actor + state + supersedes + governs + event + emitted
      await tx.run(
        `// 1. Merge WorldActor for the proposer
         MERGE (a:WorldActor {id: $proposerId})
           ON CREATE SET a.created_at = $now
           SET a.last_seen = $now
         WITH a
         // 2. Create ObjectiveState (is_current = true)
         CREATE (o:ObjectiveState {
           id: $stateId,
           objective_type: $objectiveType,
           target_metric: $targetMetric,
           target_value: $targetValue,
           time_horizon_years: $timeHorizonYears,
           omega_floor: $omegaFloor,
           lyapunov_envelope: $lyapunovEnvelope,
           status: $status,
           proposer_id: $proposerId,
           dao_vote_id: $daoVoteId,
           timestamp: $now,
           solana_slot: $solanaSlot,
           is_current: true
         })
         WITH a, o
         // 3. Find previous current objective of same type and mark superseded
         OPTIONAL MATCH (prev:ObjectiveState {objective_type: $objectiveType, is_current: true})
           WHERE prev.id <> o.id
         SET prev.is_current = false
         WITH a, o, prev
         FOREACH (_ IN CASE WHEN prev IS NOT NULL THEN [1] ELSE [] END |
           CREATE (o)-[:SUPERSEDES {at: $now}]->(prev)
         )
         WITH a, o
         // 4. Attach GOVERNS edge to target entity
         MERGE (target:WorldActor {id: $targetEntityId})
           ON CREATE SET target.created_at = $now
           SET target.last_seen = $now
         WITH o, target
         CREATE (o)-[:GOVERNS {since: $now, priority: $timeHorizonYears}]->(target)
         WITH o
         // 5-6. Create SubstrateEvent + EMITTED
         CREATE (e:SubstrateEvent {
           id: $eventId,
           type: 'OBJECTIVE_STATE_CHANGE',
           source: 'governance',
           entity_id: $proposerId,
           payload_hash: $payloadHash,
           solana_slot: $solanaSlot,
           timestamp: $now
         })
         CREATE (o)-[:EMITTED]->(e)`,
        {
          stateId,
          objectiveType: payload.objectiveType,
          targetMetric: payload.targetMetric,
          targetValue: payload.targetValue,
          timeHorizonYears: payload.timeHorizonYears,
          omegaFloor: payload.omegaFloor,
          lyapunovEnvelope: payload.lyapunovEnvelope,
          status: payload.status,
          proposerId: payload.proposerId,
          daoVoteId: payload.daoVoteId,
          targetEntityId,
          payloadHash: `obj:${payload.objectiveType}:${payload.status}:${payload.targetMetric}`,
          eventId,
          solanaSlot,
          now,
        },
      );
    });

    console.log(
      `[objective-writer] Wrote ObjectiveState ${stateId} (${payload.objectiveType}:${payload.status}) + SubstrateEvent ${eventId}`,
    );
    return eventId;
  } finally {
    await session.close();
  }
}
