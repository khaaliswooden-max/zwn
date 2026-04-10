import { Driver } from 'neo4j-driver';
import { v4 as uuidv4 } from 'uuid';
import { AssessmentStatus, ScaleMetricPayload } from './types';
import { SCALE_PARAMS } from '../../config/scale-rules';

/**
 * D7 Scale Coherence Evaluator
 *
 * Adds a seventh dimension to the OMEGA-VEB-1 framework. Instead of a binary
 * pass/fail on sustainability (omega > 1.0), this computes a maximum viable
 * omega envelope:
 *
 *   omega_max = market_footprint_ratio * jurisdictional_coverage_ratio * (1 - entropy_normalized)
 *
 * If omega_rsf exceeds omega_max, the system is growing faster than its
 * institutional and thermodynamic foundations can support — the scale-breach
 * causal rule fires and triggers Veyra reasoning.
 */

/**
 * Computes omega_max — the maximum viable RSF coefficient at current scale.
 */
export function computeOmegaMax(
  marketFootprint: number,
  jurisdictionalCoverage: number,
  entropyProduction: number,
): number {
  const marketRatio = Math.min(marketFootprint / SCALE_PARAMS.marketSizeEstimate, 1.0);
  const jurisdictionRatio = Math.min(jurisdictionalCoverage / SCALE_PARAMS.requiredJurisdictions, 1.0);
  const entropyNormalized = Math.min(entropyProduction / SCALE_PARAMS.maxEntropyBudget, 1.0);

  return marketRatio * jurisdictionRatio * (1 - entropyNormalized);
}

/**
 * Determines assessment status based on omega_rsf vs omega_max relationship.
 */
export function assessScaleStatus(omegaRsf: number, omegaMax: number): AssessmentStatus {
  if (omegaMax <= 0) return 'CONTRACTING';
  const ratio = omegaRsf / omegaMax;
  if (ratio > 1.0) return 'SCALE_BREACH';
  if (ratio > 0.85) return 'APPROACHING_CEILING';
  return 'STABLE';
}

/**
 * Evaluates scale coherence for a platform and writes a ScaleMetric node.
 * Called periodically or after significant state changes.
 */
export async function evaluateAndWriteScaleMetric(
  driver: Driver,
  platform: string,
  omegaRsf: number,
  entropyProduction: number,
  lyapunovExponent: number,
  marketFootprint: number,
  jurisdictionalCoverage: number,
): Promise<{ eventId: string; metric: ScaleMetricPayload }> {
  const omegaMax = computeOmegaMax(marketFootprint, jurisdictionalCoverage, entropyProduction);
  const assessmentStatus = assessScaleStatus(omegaRsf, omegaMax);

  const metric: ScaleMetricPayload = {
    platform,
    omegaRsf,
    omegaMax,
    entropyProduction,
    lyapunovExponent,
    marketFootprint,
    jurisdictionalCoverage,
    assessmentStatus,
  };

  const session = driver.session();
  const metricId = uuidv4();
  const eventId = uuidv4();
  const now = Date.now();

  try {
    await session.executeWrite(async (tx) => {
      // Main batched write: metric + supersedes + event + emitted (5 round-trips -> 2)
      await tx.run(
        `// 1. Create ScaleMetric node (is_current = true)
         CREATE (m:ScaleMetric {
           id: $metricId,
           platform: $platform,
           omega_rsf: $omegaRsf,
           omega_max: $omegaMax,
           entropy_production: $entropyProduction,
           lyapunov_exponent: $lyapunovExponent,
           market_footprint: $marketFootprint,
           jurisdictional_coverage: $jurisdictionalCoverage,
           assessment_status: $assessmentStatus,
           timestamp: $now,
           is_current: true
         })
         WITH m
         // 2. Wire SUPERSEDES to previous metric for same platform
         OPTIONAL MATCH (prev:ScaleMetric {platform: $platform, is_current: true})
           WHERE prev.id <> m.id
         SET prev.is_current = false
         WITH m, prev
         FOREACH (_ IN CASE WHEN prev IS NOT NULL THEN [1] ELSE [] END |
           CREATE (m)-[:SUPERSEDES {at: $now}]->(prev)
         )
         WITH m
         // 4-5. Create SubstrateEvent + EMITTED
         CREATE (e:SubstrateEvent {
           id: $eventId,
           type: 'SCALE_METRIC_UPDATE',
           source: 'economics',
           entity_id: $platform,
           payload_hash: $payloadHash,
           solana_slot: 0,
           timestamp: $now
         })
         CREATE (m)-[:EMITTED]->(e)`,
        {
          metricId,
          platform,
          omegaRsf,
          omegaMax,
          entropyProduction,
          lyapunovExponent,
          marketFootprint,
          jurisdictionalCoverage,
          assessmentStatus,
          payloadHash: `scale:${platform}:rsf=${omegaRsf}:max=${omegaMax}:${assessmentStatus}`,
          eventId,
          now,
        },
      );

      // 3. Wire ASSESSED_BY to active objectives (separate: multi-match)
      await tx.run(
        `MATCH (o:ObjectiveState)
         WHERE o.status IN ['ACTIVE', 'APPROVED'] AND o.is_current = true
         WITH o
         MATCH (m:ScaleMetric {id: $metricId})
         CREATE (m)-[:ASSESSED_BY {at: $now}]->(o)`,
        { metricId, now },
      );
    });

    console.log(
      `[scale-coherence] Platform ${platform}: omega_rsf=${omegaRsf.toFixed(3)} omega_max=${omegaMax.toFixed(3)} status=${assessmentStatus}`,
    );
    return { eventId, metric };
  } finally {
    await session.close();
  }
}
