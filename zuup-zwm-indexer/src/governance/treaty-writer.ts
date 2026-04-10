import { Driver } from 'neo4j-driver';
import { v4 as uuidv4 } from 'uuid';
import { TreatyAttestationPayload } from './types';

/**
 * Writes a TreatyAttestation node to the Neo4j graph.
 * Follows the append-only pattern:
 *   1. Merge WorldActor for the bilateral partner
 *   2. Create TreatyAttestation node
 *   3. Wire EXPANDS_SCOPE to previous treaty for the same jurisdiction (if any)
 *   4. Wire AUTHORIZED_BY from any matching active ObjectiveState nodes
 *   5. Create SubstrateEvent
 *   6. Wire EMITTED edge
 */
export async function writeTreatyAttestation(
  driver: Driver,
  payload: TreatyAttestationPayload,
  solanaSlot: number,
  txSignature: string,
): Promise<string> {
  const session = driver.session();
  const treatyId = uuidv4();
  const eventId = uuidv4();
  const now = Date.now();

  try {
    await session.executeWrite(async (tx) => {
      // 1. Merge WorldActor for bilateral partner
      await tx.run(
        `MERGE (a:WorldActor {id: $partnerId})
         ON CREATE SET a.created_at = $now
         SET a.last_seen = $now`,
        { partnerId: payload.bilateralPartner, now },
      );

      // 2. Create TreatyAttestation
      await tx.run(
        `CREATE (t:TreatyAttestation {
           id: $treatyId,
           jurisdiction_code: $jurisdictionCode,
           jurisdiction_name: $jurisdictionName,
           treaty_type: $treatyType,
           compliance_domain: $complianceDomain,
           attestation_hash: $attestationHash,
           bilateral_partner: $bilateralPartner,
           effective_date: $effectiveDate,
           expiry_date: $expiryDate,
           civium_verification_id: $civiumVerificationId,
           timestamp: $now,
           solana_slot: $solanaSlot
         })`,
        {
          treatyId,
          jurisdictionCode: payload.jurisdictionCode,
          jurisdictionName: payload.jurisdictionName,
          treatyType: payload.treatyType,
          complianceDomain: payload.complianceDomain,
          attestationHash: payload.attestationHash,
          bilateralPartner: payload.bilateralPartner,
          effectiveDate: payload.effectiveDate,
          expiryDate: payload.expiryDate,
          civiumVerificationId: payload.civiumVerificationId,
          now,
          solanaSlot,
        },
      );

      // 3. Wire EXPANDS_SCOPE to previous treaty for the same jurisdiction (if any)
      await tx.run(
        `MATCH (prev:TreatyAttestation {jurisdiction_code: $jurisdictionCode})
         WHERE prev.id <> $treatyId
         WITH prev ORDER BY prev.timestamp DESC LIMIT 1
         MATCH (t:TreatyAttestation {id: $treatyId})
         CREATE (t)-[:EXPANDS_SCOPE {at: $now}]->(prev)`,
        { jurisdictionCode: payload.jurisdictionCode, treatyId, now },
      );

      // 4. Wire AUTHORIZED_BY from active objectives that require jurisdictional expansion
      await tx.run(
        `MATCH (o:ObjectiveState)
         WHERE o.status IN ['ACTIVE', 'APPROVED']
           AND o.objective_type = 'JURISDICTIONAL_EXPANSION'
           AND NOT (o)-[:SUPERSEDES]->()
         WITH o
         MATCH (t:TreatyAttestation {id: $treatyId})
         CREATE (o)-[:AUTHORIZED_BY {scope: $jurisdictionCode}]->(t)`,
        { treatyId, jurisdictionCode: payload.jurisdictionCode },
      );

      // 5. Create SubstrateEvent
      await tx.run(
        `CREATE (e:SubstrateEvent {
           id: $eventId,
           type: 'TREATY_ATTESTATION_NEW',
           source: 'civium',
           entity_id: $bilateralPartner,
           payload_hash: $payloadHash,
           solana_slot: $solanaSlot,
           timestamp: $now
         })`,
        {
          eventId,
          bilateralPartner: payload.bilateralPartner,
          payloadHash: `treaty:${payload.jurisdictionCode}:${payload.treatyType}:${payload.attestationHash}`,
          solanaSlot,
          now,
        },
      );

      // 6. Wire EMITTED edge
      await tx.run(
        `MATCH (t:TreatyAttestation {id: $treatyId}), (e:SubstrateEvent {id: $eventId})
         CREATE (t)-[:EMITTED]->(e)`,
        { treatyId, eventId },
      );
    });

    console.log(
      `[treaty-writer] Wrote TreatyAttestation ${treatyId} (${payload.jurisdictionCode}/${payload.treatyType}) + SubstrateEvent ${eventId}`,
    );
    return eventId;
  } finally {
    await session.close();
  }
}
