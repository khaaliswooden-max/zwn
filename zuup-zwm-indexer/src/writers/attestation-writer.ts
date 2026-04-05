import { Driver } from 'neo4j-driver';
import { v4 as uuidv4 } from 'uuid';
import { ZuupHqPayload } from '../parsers/zuuphq-parser';

export async function writeAttestation(
  driver: Driver,
  payload: ZuupHqPayload,
  solanaSlot: number,
  txSignature: string
): Promise<string> {
  const session = driver.session();
  const eventId = uuidv4();
  const now = Date.now();

  try {
    await session.executeWrite(async (tx) => {
      // Create Attestation node (content-addressed, immutable)
      await tx.run(
        `CREATE (a:Attestation {
           id: $attestationId,
           sha256: $sha256,
           pda_address: $pdaAddress,
           score: $score,
           attestation_type: $attestationType,
           solana_slot: $solanaSlot,
           timestamp: $timestamp
         })`,
        {
          attestationId: payload.attestationId,
          sha256: Buffer.from(payload.sha256).toString('hex'),
          pdaAddress: txSignature,   // placeholder until program is deployed
          score: payload.score,
          attestationType: payload.attestationType,
          solanaSlot,
          timestamp: payload.timestamp,
        }
      );

      // SubstrateEvent
      await tx.run(
        `CREATE (e:SubstrateEvent {
           id: $eventId,
           type: 'ATTESTATION_WRITTEN',
           source: 'zuuphq',
           entity_id: $attestationId,
           payload_hash: $sha256,
           solana_slot: $solanaSlot,
           timestamp: $timestamp
         })`,
        {
          eventId,
          attestationId: payload.attestationId,
          sha256: Buffer.from(payload.sha256).toString('hex'),
          solanaSlot,
          timestamp: payload.timestamp,
        }
      );

      // Link Attestation → SubstrateEvent
      await tx.run(
        `MATCH (a:Attestation {id: $attestationId}), (e:SubstrateEvent {id: $eventId})
         CREATE (a)-[:EMITTED]->(e)`,
        { attestationId: payload.attestationId, eventId }
      );
    });

    console.log(`[attestation-writer] Wrote Attestation ${payload.attestationId} (${payload.attestationType} score=${payload.score})`);
    return eventId;
  } finally {
    await session.close();
  }
}
