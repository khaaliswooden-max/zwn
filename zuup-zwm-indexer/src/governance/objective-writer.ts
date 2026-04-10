import { Driver } from 'neo4j-driver';
import { v4 as uuidv4 } from 'uuid';
import { ObjectivePayload } from './types';

/**
 * Writes an ObjectiveState node to the Neo4j graph.
 * Follows the same append-only pattern as compliance-writer.ts:
 *   1. Merge WorldActor (the proposer)
 *   2. Create ObjectiveState node
 *   3. Wire SUPERSEDES to previous objective of the same type (if any)
 *   4. Attach GOVERNS edge to target entity (or global)
 *   5. Create SubstrateEvent
 *   6. Wire EMITTED edge
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
      // 1. Merge WorldActor for the proposer
      await tx.run(
        `MERGE (a:WorldActor {id: $proposerId})
         ON CREATE SET a.created_at = $now
         SET a.last_seen = $now`,
        { proposerId: payload.proposerId, now },
      );

      // 2. Create ObjectiveState
      await tx.run(
        `CREATE (o:ObjectiveState {
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
           solana_slot: $solanaSlot
         })`,
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
          now,
          solanaSlot,
        },
      );

      // 3. Wire SUPERSEDES to previous objective of the same type (if any)
      await tx.run(
        `MATCH (prev:ObjectiveState {objective_type: $objectiveType})
         WHERE prev.id <> $stateId AND NOT (prev)-[:SUPERSEDES]->()
         WITH prev
         MATCH (o:ObjectiveState {id: $stateId})
         CREATE (o)-[:SUPERSEDES {at: $now}]->(prev)`,
        { objectiveType: payload.objectiveType, stateId, now },
      );

      // 4. Attach GOVERNS edge to target entity
      await tx.run(
        `MERGE (target:WorldActor {id: $targetEntityId})
         ON CREATE SET target.created_at = $now
         SET target.last_seen = $now
         WITH target
         MATCH (o:ObjectiveState {id: $stateId})
         CREATE (o)-[:GOVERNS {since: $now, priority: $timeHorizonYears}]->(target)`,
        { targetEntityId, stateId, now, timeHorizonYears: payload.timeHorizonYears },
      );

      // 5. Create SubstrateEvent
      await tx.run(
        `CREATE (e:SubstrateEvent {
           id: $eventId,
           type: 'OBJECTIVE_STATE_CHANGE',
           source: 'governance',
           entity_id: $proposerId,
           payload_hash: $payloadHash,
           solana_slot: $solanaSlot,
           timestamp: $now
         })`,
        {
          eventId,
          proposerId: payload.proposerId,
          payloadHash: `obj:${payload.objectiveType}:${payload.status}:${payload.targetMetric}`,
          solanaSlot,
          now,
        },
      );

      // 6. Wire EMITTED edge
      await tx.run(
        `MATCH (o:ObjectiveState {id: $stateId}), (e:SubstrateEvent {id: $eventId})
         CREATE (o)-[:EMITTED]->(e)`,
        { stateId, eventId },
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
