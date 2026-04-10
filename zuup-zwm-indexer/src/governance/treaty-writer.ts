import { Driver } from 'neo4j-driver';
import { v4 as uuidv4 } from 'uuid';
import { TreatyAttestationPayload } from './types';

/**
 * Writes a TreatyAttestation node to the Neo4j graph.
 * Follows the append-only pattern:
 *   1. Merge WorldActor for the bilateral partner
 *   2. Create TreatyAttestation node
 *   3. Wire EXPANDS_SCOPE to previous treaty for the same jurisdiction (if any)
 *   4. Wire AUTHORIZED_BY from active JURISDICTIONAL_EXPANSION objectives
 *   5. Create SubstrateEvent + EMITTED edge
 *
 * Batched into minimal Cypher statements (6 round-trips -> 2).
 * The AUTHORIZED_BY step requires a separate query due to multi-match semantics.
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
      // Main batched write: actor + treaty + expands_scope + event + emitted
      await tx.run(
        `// 1. Merge WorldActor for bilateral partner
         MERGE (a:WorldActor {id: $partnerId})
           ON CREATE SET a.created_at = $now
           SET a.last_seen = $now
         WITH a
         // 2. Create TreatyAttestation
         CREATE (t:TreatyAttestation {
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
         })
         WITH t
         // 3. Wire EXPANDS_SCOPE to previous treaty for same jurisdiction (if any)
         OPTIONAL MATCH (prev:TreatyAttestation {jurisdiction_code: $jurisdictionCode})
           WHERE prev.id <> t.id
         WITH t, prev ORDER BY prev.timestamp DESC LIMIT 1
         FOREACH (_ IN CASE WHEN prev IS NOT NULL THEN [1] ELSE [] END |
           CREATE (t)-[:EXPANDS_SCOPE {at: $now}]->(prev)
         )
         WITH t
         // 5-6. Create SubstrateEvent + EMITTED
         CREATE (e:SubstrateEvent {
           id: $eventId,
           type: 'TREATY_ATTESTATION_NEW',
           source: 'civium',
           entity_id: $bilateralPartner,
           payload_hash: $payloadHash,
           solana_slot: $solanaSlot,
           timestamp: $now
         })
         CREATE (t)-[:EMITTED]->(e)`,
        {
          treatyId,
          partnerId: payload.bilateralPartner,
          jurisdictionCode: payload.jurisdictionCode,
          jurisdictionName: payload.jurisdictionName,
          treatyType: payload.treatyType,
          complianceDomain: payload.complianceDomain,
          attestationHash: payload.attestationHash,
          bilateralPartner: payload.bilateralPartner,
          effectiveDate: payload.effectiveDate,
          expiryDate: payload.expiryDate,
          civiumVerificationId: payload.civiumVerificationId,
          payloadHash: `treaty:${payload.jurisdictionCode}:${payload.treatyType}:${payload.attestationHash}`,
          eventId,
          solanaSlot,
          now,
        },
      );

      // 4. Wire AUTHORIZED_BY from active JURISDICTIONAL_EXPANSION objectives
      // Separate query: multi-match across independent ObjectiveState nodes
      await tx.run(
        `MATCH (o:ObjectiveState)
         WHERE o.status IN ['ACTIVE', 'APPROVED']
           AND o.objective_type = 'JURISDICTIONAL_EXPANSION'
           AND o.is_current = true
         WITH o
         MATCH (t:TreatyAttestation {id: $treatyId})
         CREATE (o)-[:AUTHORIZED_BY {scope: $jurisdictionCode}]->(t)`,
        { treatyId, jurisdictionCode: payload.jurisdictionCode },
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
