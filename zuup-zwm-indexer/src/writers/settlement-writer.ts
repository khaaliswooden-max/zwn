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
  const stateId = uuidv4();
  const eventId = uuidv4();
  const now = Date.now();

  try {
    await session.executeWrite(async (tx) => {
      await tx.run(
        `MERGE (a:WorldActor {id: $counterpartyId})
           ON CREATE SET a.created_at = $now
           SET a.last_seen = $now
         WITH a
         CREATE (s:SettlementRecord {
           id: $stateId,
           transaction_id: $transactionId,
           counterparty_id: $counterpartyId,
           amount: $amountUsdc,
           event_type: $eventType,
           mint_sig: $txSignature,
           burn_sig: '',
           timestamp: $timestamp,
           solana_slot: $solanaSlot,
           is_current: true
         })
         WITH a, s
         CREATE (a)-[:HAS_STATE {since: $timestamp, source: 'zusdc'}]->(s)
         WITH s
         CREATE (e:SubstrateEvent {
           id: $eventId,
           type: 'SETTLEMENT_EVENT',
           source: 'zusdc',
           entity_id: $counterpartyId,
           payload_hash: $payloadHash,
           solana_slot: $solanaSlot,
           timestamp: $timestamp
         })
         CREATE (s)-[:EMITTED]->(e)`,
        {
          stateId, transactionId: payload.transactionId,
          counterpartyId: payload.counterpartyId,
          amountUsdc: payload.amountUsdc, eventType: payload.eventType,
          timestamp: payload.timestamp, solanaSlot, txSignature,
          payloadHash: `settlement:${payload.eventType}:${payload.amountUsdc}`,
          eventId, now,
        }
      );
    });

    console.log(`[settlement-writer] Wrote SettlementRecord ${stateId} + SubstrateEvent ${eventId} for tx ${payload.transactionId}`);
    return eventId;
  } finally {
    await session.close();
  }
}
