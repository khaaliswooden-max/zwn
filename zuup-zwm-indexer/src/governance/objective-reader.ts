import { Driver } from 'neo4j-driver';

export interface ActiveObjective {
  id: string;
  objectiveType: string;
  targetMetric: string;
  targetValue: number;
  timeHorizonYears: number;
  omegaFloor: number;
  lyapunovEnvelope: number;
  status: string;
  proposerId: string;
  daoVoteId: string;
  timestamp: number;
}

export interface TreatyCoverage {
  id: string;
  jurisdictionCode: string;
  jurisdictionName: string;
  treatyType: string;
  complianceDomain: string;
  bilateralPartner: string;
  effectiveDate: number;
  expiryDate: number;
  timestamp: number;
}

export interface JurisdictionalSummary {
  totalTreaties: number;
  activeJurisdictions: number;
  jurisdictionCodes: string[];
  coverageDomains: string[];
}

/**
 * Reads current active objectives from the Neo4j graph.
 * Used by Veyra context injection to provide goal-directed reasoning context.
 */
export async function readActiveObjectives(driver: Driver): Promise<ActiveObjective[]> {
  const session = driver.session();
  try {
    const result = await session.run(
      `MATCH (o:ObjectiveState)
       WHERE o.status IN ['ACTIVE', 'APPROVED']
         AND o.is_current = true
       RETURN o
       ORDER BY o.timestamp DESC`,
    );

    return result.records.map((r) => {
      const props = r.get('o').properties as Record<string, unknown>;
      return {
        id: String(props['id']),
        objectiveType: String(props['objective_type']),
        targetMetric: String(props['target_metric']),
        targetValue: Number(props['target_value']),
        timeHorizonYears: Number(props['time_horizon_years']),
        omegaFloor: Number(props['omega_floor']),
        lyapunovEnvelope: Number(props['lyapunov_envelope']),
        status: String(props['status']),
        proposerId: String(props['proposer_id']),
        daoVoteId: String(props['dao_vote_id']),
        timestamp: Number(props['timestamp']),
      };
    });
  } finally {
    await session.close();
  }
}

/**
 * Reads current treaty coverage — all non-expired TreatyAttestation nodes.
 */
export async function readTreatyCoverage(driver: Driver): Promise<TreatyCoverage[]> {
  const session = driver.session();
  const now = Date.now();
  try {
    const result = await session.run(
      `MATCH (t:TreatyAttestation)
       WHERE t.expiry_date > $now OR t.expiry_date = 0
       RETURN t
       ORDER BY t.effective_date DESC`,
      { now },
    );

    return result.records.map((r) => {
      const props = r.get('t').properties as Record<string, unknown>;
      return {
        id: String(props['id']),
        jurisdictionCode: String(props['jurisdiction_code']),
        jurisdictionName: String(props['jurisdiction_name']),
        treatyType: String(props['treaty_type']),
        complianceDomain: String(props['compliance_domain']),
        bilateralPartner: String(props['bilateral_partner']),
        effectiveDate: Number(props['effective_date']),
        expiryDate: Number(props['expiry_date']),
        timestamp: Number(props['timestamp']),
      };
    });
  } finally {
    await session.close();
  }
}

/**
 * Computes jurisdictional summary — aggregate treaty coverage stats.
 */
export async function readJurisdictionalSummary(driver: Driver): Promise<JurisdictionalSummary> {
  const session = driver.session();
  const now = Date.now();
  try {
    const result = await session.run(
      `MATCH (t:TreatyAttestation)
       WHERE t.expiry_date > $now OR t.expiry_date = 0
       RETURN count(t) AS total,
              count(DISTINCT t.jurisdiction_code) AS jurisdictions,
              collect(DISTINCT t.jurisdiction_code) AS codes,
              collect(DISTINCT t.compliance_domain) AS domains`,
      { now },
    );

    if (result.records.length === 0) {
      return { totalTreaties: 0, activeJurisdictions: 0, jurisdictionCodes: [], coverageDomains: [] };
    }

    const rec = result.records[0];
    return {
      totalTreaties: Number(rec.get('total')),
      activeJurisdictions: Number(rec.get('jurisdictions')),
      jurisdictionCodes: rec.get('codes') as string[],
      coverageDomains: rec.get('domains') as string[],
    };
  } finally {
    await session.close();
  }
}
