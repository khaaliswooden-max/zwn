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
      // 1. Create ScaleMetric node
      await tx.run(
        `CREATE (m:ScaleMetric {
           id: $metricId,
           platform: $platform,
           omega_rsf: $omegaRsf,
           omega_max: $omegaMax,
           entropy_production: $entropyProduction,
           lyapunov_exponent: $lyapunovExponent,
           market_footprint: $marketFootprint,
           jurisdictional_coverage: $jurisdictionalCoverage,
           assessment_status: $assessmentStatus,
           timestamp: $now
         })`,
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
          now,
        },
      );

      // 2. Wire SUPERSEDES to previous metric for the same platform
      await tx.run(
        `MATCH (prev:ScaleMetric {platform: $platform})
         WHERE prev.id <> $metricId
         WITH prev ORDER BY prev.timestamp DESC LIMIT 1
         MATCH (m:ScaleMetric {id: $metricId})
         CREATE (m)-[:SUPERSEDES {at: $now}]->(prev)`,
        { platform, metricId, now },
      );

      // 3. Wire ASSESSED_BY to active objectives
      await tx.run(
        `MATCH (o:ObjectiveState)
         WHERE o.status IN ['ACTIVE', 'APPROVED'] AND NOT (o)-[:SUPERSEDES]->()
         WITH o
         MATCH (m:ScaleMetric {id: $metricId})
         CREATE (m)-[:ASSESSED_BY {at: $now}]->(o)`,
        { metricId, now },
      );

      // 4. Create SubstrateEvent
      await tx.run(
        `CREATE (e:SubstrateEvent {
           id: $eventId,
           type: 'SCALE_METRIC_UPDATE',
           source: 'economics',
           entity_id: $platform,
           payload_hash: $payloadHash,
           solana_slot: 0,
           timestamp: $now
         })`,
        {
          eventId,
          platform,
          payloadHash: `scale:${platform}:rsf=${omegaRsf}:max=${omegaMax}:${assessmentStatus}`,
          now,
        },
      );

      // 5. Wire EMITTED edge
      await tx.run(
        `MATCH (m:ScaleMetric {id: $metricId}), (e:SubstrateEvent {id: $eventId})
         CREATE (m)-[:EMITTED]->(e)`,
        { metricId, eventId },
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
