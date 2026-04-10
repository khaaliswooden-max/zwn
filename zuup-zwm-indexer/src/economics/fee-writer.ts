import { Driver } from 'neo4j-driver';
import { v4 as uuidv4 } from 'uuid';
import { FeeRecordPayload } from './types';

/**
 * Writes a FeeRecord node to the Neo4j graph.
 * Follows the append-only pattern:
 *   1. Merge WorldActor + Create FeeRecord
 *   2. Wire FEE_ON edge to the originating SettlementRecord
 *   3. Wire HAS_STATE from the entity's WorldActor
 *   4. Create SubstrateEvent + EMITTED edge
 *
 * Batched into minimal Cypher (5 round-trips -> 2).
 * FEE_ON is separate because SettlementRecord may not exist.
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
      // Main batched write: actor + fee + has_state + event + emitted
      await tx.run(
        `// 1+3. Merge WorldActor and create FeeRecord with HAS_STATE
         MERGE (a:WorldActor {id: $entityId})
           ON CREATE SET a.created_at = $now
           SET a.last_seen = $now
         WITH a
         CREATE (f:FeeRecord {
           id: $feeId,
           settlement_id: $settlementId,
           fee_amount_usdc: $feeAmountUsdc,
           fee_basis_points: $feeBasisPoints,
           fee_type: $feeType,
           source_platform: $sourcePlatform,
           target_platform: $targetPlatform,
           entity_id: $entityId,
           timestamp: $now
         })
         CREATE (a)-[:HAS_STATE {since: $now, source: 'economics'}]->(f)
         WITH f
         // 4-5. Create SubstrateEvent + EMITTED
         CREATE (e:SubstrateEvent {
           id: $eventId,
           type: 'FEE_COLLECTED',
           source: 'economics',
           entity_id: $entityId,
           payload_hash: $payloadHash,
           solana_slot: 0,
           timestamp: $now
         })
         CREATE (f)-[:EMITTED]->(e)`,
        {
          feeId,
          settlementId: payload.settlementId,
          feeAmountUsdc: payload.feeAmountUsdc,
          feeBasisPoints: payload.feeBasisPoints,
          feeType: payload.feeType,
          sourcePlatform: payload.sourcePlatform,
          targetPlatform: payload.targetPlatform,
          entityId: payload.entityId,
          payloadHash: `fee:${payload.feeType}:${payload.feeBasisPoints}bps:${payload.feeAmountUsdc}`,
          eventId,
          now,
        },
      );

      // 2. Wire FEE_ON to SettlementRecord (separate: record may not exist)
      await tx.run(
        `MATCH (f:FeeRecord {id: $feeId}), (s:SettlementRecord {id: $settlementId})
         CREATE (f)-[:FEE_ON {basis_points: $feeBasisPoints}]->(s)`,
        { feeId, settlementId: payload.settlementId, feeBasisPoints: payload.feeBasisPoints },
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
