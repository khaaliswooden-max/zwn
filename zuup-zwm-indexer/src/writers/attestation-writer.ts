import { Driver } from 'neo4j-driver';
import { v4 as uuidv4 } from 'uuid';
import { ZuuphqStatePayload } from '../parsers/zuuphq-parser';

export async function writeAttestation(
  driver: Driver,
  payload: ZuuphqStatePayload,
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
        `CREATE (s:Attestation {
           id: $stateId,
           attestation_id: $attestationId,
           sha256: $sha256,
           pda_address: $pdaAddress,
           score: $score,
           attestation_type: $attestationType,
           timestamp: $timestamp,
           solana_slot: $solanaSlot,
           is_current: true
         })
         WITH s
         CREATE (e:SubstrateEvent {
           id: $eventId,
           type: 'ATTESTATION_CREATED',
           source: 'zuup_hq',
           entity_id: $attestationId,
           payload_hash: $payloadHash,
           solana_slot: $solanaSlot,
           timestamp: $timestamp
         })
         CREATE (s)-[:EMITTED]->(e)`,
        {
          stateId, attestationId: payload.attestationId,
          sha256: Buffer.from(payload.sha256).toString('hex'),
          pdaAddress: payload.pdaAddress,
          score: payload.score, attestationType: payload.attestationType,
          timestamp: payload.timestamp, solanaSlot,
          payloadHash: `attest:${payload.attestationType}:${payload.score}`,
          eventId, now,
        }
      );
    });

    console.log(`[attestation-writer] Wrote Attestation ${stateId} + SubstrateEvent ${eventId} for ${payload.attestationId}`);
    return eventId;
  } finally {
    await session.close();
  }
}
