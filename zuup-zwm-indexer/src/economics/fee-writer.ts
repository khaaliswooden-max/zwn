import { Driver } from 'neo4j-driver';
import { v4 as uuidv4 } from 'uuid';
import { FeeRecordPayload } from './types';

/**
 * Writes a FeeRecord node to the Neo4j graph.
 * Follows the append-only pattern:
 *   1. Create FeeRecord node
 *   2. Wire FEE_ON edge to the originating SettlementRecord
 *   3. Wire HAS_STATE from the entity's WorldActor
 *   4. Create SubstrateEvent
 *   5. Wire EMITTED edge
 */
export async function writeFeeRecord(
  driver: Driver,
  payload: FeeRecordPayload,
): Promise<string> {
  const session = driver.session();
  const feeId = uuidv4();
  const eventId = uuidv4();
  const now = Date.now();

  try {
    await session.executeWrite(async (tx) => {
      // 1. Create FeeRecord
      await tx.run(
        `CREATE (f:FeeRecord {
           id: $feeId,
           settlement_id: $settlementId,
           fee_amount_usdc: $feeAmountUsdc,
           fee_basis_points: $feeBasisPoints,
           fee_type: $feeType,
           source_platform: $sourcePlatform,
           target_platform: $targetPlatform,
           entity_id: $entityId,
           timestamp: $now
         })`,
        {
          feeId,
          settlementId: payload.settlementId,
          feeAmountUsdc: payload.feeAmountUsdc,
          feeBasisPoints: payload.feeBasisPoints,
          feeType: payload.feeType,
          sourcePlatform: payload.sourcePlatform,
          targetPlatform: payload.targetPlatform,
          entityId: payload.entityId,
          now,
        },
      );

      // 2. Wire FEE_ON to SettlementRecord (if it exists in the graph)
      await tx.run(
        `MATCH (f:FeeRecord {id: $feeId}), (s:SettlementRecord {id: $settlementId})
         CREATE (f)-[:FEE_ON {basis_points: $feeBasisPoints}]->(s)`,
        { feeId, settlementId: payload.settlementId, feeBasisPoints: payload.feeBasisPoints },
      );

      // 3. Wire HAS_STATE from entity WorldActor
      await tx.run(
        `MERGE (a:WorldActor {id: $entityId})
         ON CREATE SET a.created_at = $now
         SET a.last_seen = $now
         WITH a
         MATCH (f:FeeRecord {id: $feeId})
         CREATE (a)-[:HAS_STATE {since: $now, source: 'economics'}]->(f)`,
        { entityId: payload.entityId, feeId, now },
      );

      // 4. Create SubstrateEvent
      await tx.run(
        `CREATE (e:SubstrateEvent {
           id: $eventId,
           type: 'FEE_COLLECTED',
           source: 'economics',
           entity_id: $entityId,
           payload_hash: $payloadHash,
           solana_slot: 0,
           timestamp: $now
         })`,
        {
          eventId,
          entityId: payload.entityId,
          payloadHash: `fee:${payload.feeType}:${payload.feeBasisPoints}bps:${payload.feeAmountUsdc}`,
          now,
        },
      );

      // 5. Wire EMITTED edge
      await tx.run(
        `MATCH (f:FeeRecord {id: $feeId}), (e:SubstrateEvent {id: $eventId})
         CREATE (f)-[:EMITTED]->(e)`,
        { feeId, eventId },
      );
    });

    console.log(
      `[fee-writer] Wrote FeeRecord ${feeId} (${payload.feeBasisPoints}bps on ${payload.settlementId}) + SubstrateEvent ${eventId}`,
    );
    return eventId;
  } finally {
    await session.close();
  }
}
