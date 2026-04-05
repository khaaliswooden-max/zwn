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

  // Degrade trigger: availability < 0.90 → COMPUTE_DEGRADATION in SubstrateEvent
  const eventType = payload.availability < 0.90 ? 'COMPUTE_DEGRADATION' : 'COMPUTE_STATE_UPDATE';

  try {
    await session.executeWrite(async (tx) => {
      await tx.run(
        `MERGE (a:WorldActor {id: $nodeId})
         ON CREATE SET a.created_at = $now
         SET a.last_seen = $now`,
        { nodeId: payload.nodeId, now }
      );

      await tx.run(
        `CREATE (s:ComputeState {
           id: $stateId,
           entity_id: $nodeId,
           xdop_score: $xdopScore,
           wcbi: $wcbiScore,
           ddil_hours: $ddilHours,
           tops: $tops,
           availability: $availability,
           timestamp: $timestamp,
           solana_slot: $solanaSlot,
           tx_signature: $txSignature
         })`,
        {
          stateId,
          nodeId: payload.nodeId,
          xdopScore: payload.xdopScore,
          wcbiScore: payload.wcbiScore,
          ddilHours: payload.ddilHours,
          tops: payload.tops,
          availability: payload.availability,
          timestamp: payload.timestamp,
          solanaSlot,
          txSignature,
        }
      );

      await tx.run(
        `MATCH (a:WorldActor {id: $nodeId})-[:HAS_STATE]->(prev:ComputeState)
         WHERE NOT (prev)-[:SUPERSEDES]->()
         WITH prev MATCH (s:ComputeState {id: $stateId})
         CREATE (s)-[:SUPERSEDES {at: $now}]->(prev)`,
        { nodeId: payload.nodeId, stateId, now }
      );

      await tx.run(
        `MATCH (a:WorldActor {id: $nodeId}), (s:ComputeState {id: $stateId})
         CREATE (a)-[:HAS_STATE {since: $timestamp, source: 'podx'}]->(s)`,
        { nodeId: payload.nodeId, stateId, timestamp: payload.timestamp }
      );

      await tx.run(
        `CREATE (e:SubstrateEvent {
           id: $eventId,
           type: $eventType,
           source: 'podx',
           entity_id: $nodeId,
           payload_hash: $payloadHash,
           solana_slot: $solanaSlot,
           timestamp: $timestamp
         })`,
        {
          eventId,
          eventType,
          nodeId: payload.nodeId,
          payloadHash: `xdop:${payload.xdopScore}:avail:${payload.availability}`,
          solanaSlot,
          timestamp: payload.timestamp,
        }
      );

      await tx.run(
        `MATCH (s:ComputeState {id: $stateId}), (e:SubstrateEvent {id: $eventId})
         CREATE (s)-[:EMITTED]->(e)`,
        { stateId, eventId }
      );
    });

    console.log(`[compute-state-writer] Wrote ComputeState ${stateId} (${eventType}) for node ${payload.nodeId}`);
    return eventId;
  } finally {
    await session.close();
  }
}
