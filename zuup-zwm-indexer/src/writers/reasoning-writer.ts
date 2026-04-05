import { Driver } from 'neo4j-driver';
import { v4 as uuidv4 } from 'uuid';
import { VeyraStatePayload } from '../parsers/veyra-parser';

// Veyra has no dedicated state node in the graph schema — it emits SubstrateEvents only.
export async function writeReasoningEvent(
  driver: Driver,
  payload: VeyraStatePayload,
  solanaSlot: number,
  txSignature: string
): Promise<string> {
  const session = driver.session();
  const eventId = uuidv4();
  const now = Date.now();

  try {
    await session.executeWrite(async (tx) => {
      await tx.run(
        `CREATE (e:SubstrateEvent {
           id: $eventId,
           type: 'REASONING_COMPLETE',
           source: 'veyra',
           entity_id: $requestId,
           payload_hash: $payloadHash,
           solana_slot: $solanaSlot,
           timestamp: $timestamp
         })`,
        {
          eventId,
          requestId: payload.requestId,
          payloadHash: Buffer.from(payload.outputHash).toString('hex'),
          solanaSlot,
          timestamp: payload.timestamp,
        }
      );
    });

    console.log(`[reasoning-writer] Wrote SubstrateEvent ${eventId} for request ${payload.requestId} (v_score=${payload.vScore})`);
    return eventId;
  } finally {
    await session.close();
  }
}
