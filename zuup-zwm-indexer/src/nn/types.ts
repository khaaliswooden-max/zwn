/** Shared types for neural network service integration. */

/** Response from POST /detect/anomaly */
export interface AnomalyDetectionResult {
  anomaly_score: number;   // Normalized 0.0-1.0 (higher = more anomalous)
  raw_score: number;       // Unnormalized reconstruction error
  is_anomaly: boolean;     // Whether raw_score exceeds trained threshold
  threshold: number;       // Training-set percentile threshold
  model_version: number;   // Model checkpoint version (Unix timestamp)
  entity_id?: string;
  substrate_event_id?: string;
}

/** Request body for POST /detect/anomaly */
export interface AnomalyDetectionRequest {
  model_name: string;
  features: number[];
  n_samples?: number;
  entity_id?: string;
  substrate_event_id?: string;
}

/** Neo4j node written after anomaly detection */
export interface AnomalyScorePayload {
  entityId: string;
  substrate: string;
  anomalyScore: number;
  rawScore: number;
  isAnomaly: boolean;
  modelVersion: number;
  substrateEventId: string;
  biologicalStateId?: string;
}
