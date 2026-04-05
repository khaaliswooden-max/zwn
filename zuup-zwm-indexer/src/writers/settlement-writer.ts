import { Driver } from 'neo4j-driver';
import { v4 as uuidv4 } from 'uuid';
import { ZusdcStatePayload } from '../parsers/zusdc-parser';

export async function writeSettlementRecord(
  driver: Driver,
  payload: ZusdcStatePayload,
  solanaSlot: number,
  txSignature: string
): Promise<string> {
  const session = driver.session();
  const recordId = uuidv4();
  const eventId = uuidv4();
  const now = Date.now();

  try {
    await session.executeWrite(async (tx) => {
      // SettlementRecord is standalone — linked to counterparty WorldActor
      await tx.run(
        `MERGE (a:WorldActor {id: $counterpartyId})
         ON CREATE SET a.created_at = $now
         SET a.last_seen = $now`,
        { counterpartyId: payload.counterpartyId, now }
      );

      await tx.run(
        `CREATE (r:SettlementRecord {
           id: $recordId,
           amount: $amountUsdc,
           mint_sig: $mintSig,
           burn_sig: $burnSig,
           counterparty_id: $counterpartyId,
           event_type: $eventType,
           transaction_id: $transactionId,
           solana_slot: $solanaSlot,
           timestamp: $timestamp
         })`,
        {
          recordId,
          amountUsdc: payload.amountUsdc,
          mintSig: payload.eventType === 'MINT' ? txSignature : '',
          burnSig: payload.eventType === 'BURN' ? txSignature : '',
          counterpartyId: payload.counterpartyId,
          eventType: payload.eventType,
          transactionId: payload.transactionId,
          solanaSlot,
          timestamp: payload.timestamp,
        }
      );

      // Link settlement to counterparty
      await tx.run(
        `MATCH (a:WorldActor {id: $counterpartyId}), (r:SettlementRecord {id: $recordId})
         CREATE (a)-[:HAS_STATE {since: $timestamp, source: 'zusdc'}]->(r)`,
        { counterpartyId: payload.counterpartyId, recordId, timestamp: payload.timestamp }
      );

      await tx.run(
        `CREATE (e:SubstrateEvent {
           id: $eventId,
           type: 'SETTLEMENT_EVENT',
           source: 'zusdc',
           entity_id: $counterpartyId,
           payload_hash: $payloadHash,
           solana_slot: $solanaSlot,
           timestamp: $timestamp
         })`,
        {
          eventId,
          counterpartyId: payload.counterpartyId,
          payloadHash: `tx:${payload.transactionId}:type:${payload.eventType}`,
          solanaSlot,
          timestamp: payload.timestamp,
        }
      );

      await tx.run(
        `MATCH (r:SettlementRecord {id: $recordId}), (e:SubstrateEvent {id: $eventId})
         CREATE (r)-[:EMITTED]->(e)`,
        { recordId, eventId }
      );
    });

    console.log(`[settlement-writer] Wrote SettlementRecord ${recordId} (${payload.eventType}) for tx ${payload.transactionId}`);
    return eventId;
  } finally {
    await session.close();
  }
}
