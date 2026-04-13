/**
 * Thin HTTP client for the nn-service anomaly detection endpoint.
 *
 * Designed for graceful degradation: if nn-service is unreachable, returns
 * null and the caller falls back to the existing threshold-based rules.
 */
import axios from 'axios';
import { Driver } from 'neo4j-driver';
import { v4 as uuidv4 } from 'uuid';
import { AnomalyDetectionRequest, AnomalyDetectionResult, AnomalyScorePayload } from './types';

const NN_SERVICE_URL = process.env['NN_SERVICE_URL'] || 'http://localhost:5100';
const NN_TIMEOUT_MS = Number(process.env['NN_TIMEOUT_MS'] || '3000');

/**
 * Call nn-service to score a biological state vector for anomalies.
 * Returns null if the service is unavailable (graceful degradation).
 */
export async function detectBiologicalAnomaly(
  features: {
    serotonin: number;
    dopamine: number;
    cortisol: number;
    gaba: number;
  },
  entityId: string,
  substrateEventId: string,
): Promise<AnomalyDetectionResult | null> {
  const body: AnomalyDetectionRequest = {
    model_name: 'biological_vae',
    features: [features.serotonin, features.dopamine, features.cortisol, features.gaba],
    n_samples: 10,
    entity_id: entityId,
    substrate_event_id: substrateEventId,
  };

  try {
    const response = await axios.post<AnomalyDetectionResult>(
      `${NN_SERVICE_URL}/detect/anomaly`,
      body,
      { timeout: NN_TIMEOUT_MS, headers: { 'Content-Type': 'application/json' } },
    );
    return response.data;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[nn/anomaly-client] nn-service unavailable, falling back to rules: ${msg}`);
    return null;
  }
}

/**
 * Write an AnomalyScore node to Neo4j, linked to the BiologicalState and SubstrateEvent.
 *
 * Graph shape:
 *   (BiologicalState)-[:SCORED_BY]->(AnomalyScore)
 *   (AnomalyScore)-[:DETECTED_FROM]->(SubstrateEvent)
 */
export async function writeAnomalyScore(
  driver: Driver,
  payload: AnomalyScorePayload,
): Promise<string> {
  const scoreId = uuidv4();
  const now = Date.now();
  const session = driver.session();

  try {
    await session.executeWrite(async (tx) => {
      await tx.run(
        `CREATE (a:AnomalyScore {
           id: $scoreId,
           entity_id: $entityId,
           substrate: $substrate,
           anomaly_score: $anomalyScore,
           raw_score: $rawScore,
           is_anomaly: $isAnomaly,
           model_version: $modelVersion,
           timestamp: $now
         })
         WITH a
         OPTIONAL MATCH (bs:BiologicalState {id: $biologicalStateId})
         FOREACH (_ IN CASE WHEN bs IS NOT NULL THEN [1] ELSE [] END |
           CREATE (bs)-[:SCORED_BY {at: $now}]->(a)
         )
         WITH a
         MATCH (e:SubstrateEvent {id: $substrateEventId})
         CREATE (a)-[:DETECTED_FROM {at: $now}]->(e)`,
        {
          scoreId,
          entityId: payload.entityId,
          substrate: payload.substrate,
          anomalyScore: payload.anomalyScore,
          rawScore: payload.rawScore,
          isAnomaly: payload.isAnomaly,
          modelVersion: payload.modelVersion,
          biologicalStateId: payload.biologicalStateId || '',
          substrateEventId: payload.substrateEventId,
          now,
        },
      );
    });

    console.log(
      `[nn/anomaly-client] Wrote AnomalyScore ${scoreId} for ${payload.entityId} — ` +
      `score: ${payload.anomalyScore.toFixed(4)}, anomaly: ${payload.isAnomaly}`
    );
    return scoreId;
  } finally {
    await session.close();
  }
}
