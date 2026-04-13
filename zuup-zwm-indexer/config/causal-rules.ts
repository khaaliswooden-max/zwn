export interface CausalRule {
  id: string;
  trigger: string;         // SubstrateEvent type
  source: string;          // emitting platform
  condition: (payload: Record<string, unknown>) => boolean;
  effect: string;          // action string sent to target
  targetEnvKey: string;    // env var holding target ingest URL
  effectParams: (payload: Record<string, unknown>, substrateEventId: string) => Record<string, unknown>;
  timeoutMs?: number;      // per-rule HTTP timeout (default: 10000)
  maxRetries?: number;     // per-rule retry limit (default: 3)
}

export const CAUSAL_RULES: CausalRule[] = [
  {
    id: 'civium-violation-aureon',
    trigger: 'COMPLIANCE_STATE_CHANGE',
    source: 'civium',
    condition: (p) => p['status'] === 'VIOLATION',
    effect: 'RECALCULATE_FIT_IQ',
    targetEnvKey: 'AUREON_INGEST_URL',
    effectParams: (p, eventId) => ({
      entityId: p['entityId'],
      penalty: 0.40,
      reason: 'COMPLIANCE_VIOLATION',
      triggerEventId: eventId,
    }),
  },
  {
    id: 'civium-violation-zusdc',
    trigger: 'COMPLIANCE_STATE_CHANGE',
    source: 'civium',
    condition: (p) => p['status'] === 'VIOLATION',
    effect: 'FLAG_SETTLEMENT',
    targetEnvKey: 'ZUSDC_INGEST_URL',
    effectParams: (p, eventId) => ({
      entityId: p['entityId'],
      reason: 'COMPLIANCE_VIOLATION',
      triggerEventId: eventId,
    }),
  },
  {
    id: 'qal-recon-aureon',
    trigger: 'RECONSTRUCTION_COMPLETE',
    source: 'qal',
    condition: (p) => Number(p['confidence']) > 0.75,
    effect: 'UPDATE_RISK_PRIORS',
    targetEnvKey: 'AUREON_INGEST_URL',
    effectParams: (p, eventId) => ({
      entityId: p['entityId'],
      confidence: p['confidence'],
      domain: p['domain'],
      triggerEventId: eventId,
    }),
  },
  {
    id: 'symbion-anomaly-podx',
    trigger: 'BIOLOGICAL_ANOMALY',
    source: 'symbion',
    // Fire if NN detects anomaly (preferred) OR original on-chain severity is HIGH (fallback)
    condition: (p) => p['nnIsAnomaly'] === true || p['severity'] === 'HIGH',
    effect: 'PRIORITIZE_COMPUTE',
    targetEnvKey: 'PODX_INGEST_URL',
    effectParams: (p, eventId) => ({
      subjectId: p['subjectId'],
      priority: 'CRITICAL',
      anomalyScore: p['anomalyScore'] ?? null,
      detectionSource: p['nnIsAnomaly'] != null ? 'nn_vae' : 'on_chain_threshold',
      triggerEventId: eventId,
    }),
  },
  {
    id: 'symbion-anomaly-veyra',
    trigger: 'BIOLOGICAL_ANOMALY',
    source: 'symbion',
    // Fire if NN detects anomaly (preferred) OR original on-chain severity is HIGH (fallback)
    condition: (p) => p['nnIsAnomaly'] === true || p['severity'] === 'HIGH',
    effect: 'TRIGGER_REASONING',
    targetEnvKey: 'VEYRA_INGEST_URL',
    timeoutMs: 30_000,  // reasoning takes longer
    effectParams: (p, eventId) => ({
      context: 'BIOLOGICAL_ANOMALY_HIGH',
      subjectId: p['subjectId'],
      anomalyScore: p['anomalyScore'] ?? null,
      detectionSource: p['nnIsAnomaly'] != null ? 'nn_vae' : 'on_chain_threshold',
      triggerEventId: eventId,
    }),
  },
  {
    // NEW: NN-detected subtle anomaly (score > 0.7 but on-chain severity is not HIGH)
    // Triggers Veyra reasoning for early warning — catches anomalies that
    // the on-chain 3-sigma threshold would miss.
    id: 'symbion-nn-early-warning-veyra',
    trigger: 'BIOLOGICAL_ANOMALY',
    source: 'symbion',
    condition: (p) =>
      typeof p['anomalyScore'] === 'number' &&
      (p['anomalyScore'] as number) > 0.7 &&
      p['severity'] !== 'HIGH',
    effect: 'TRIGGER_REASONING',
    targetEnvKey: 'VEYRA_INGEST_URL',
    timeoutMs: 30_000,
    effectParams: (p, eventId) => ({
      context: 'BIOLOGICAL_ANOMALY_NN_EARLY_WARNING',
      subjectId: p['subjectId'],
      anomalyScore: p['anomalyScore'],
      onChainSeverity: p['severity'],
      detectionSource: 'nn_vae',
      triggerEventId: eventId,
    }),
  },
  {
    id: 'relian-migration-zuuphq',
    trigger: 'MIGRATION_COMPLETE',
    source: 'relian',
    condition: (p) => Number(p['semanticPreservation']) >= 0.95,
    effect: 'WRITE_ATTESTATION',
    targetEnvKey: 'ZUUP_HQ_INGEST_URL',
    effectParams: (p, eventId) => ({
      projectId: p['projectId'],
      artifactHash: p['artifactHash'],
      semanticPreservation: p['semanticPreservation'],
      triggerEventId: eventId,
    }),
  },
  {
    id: 'podx-degradation-veyra',
    trigger: 'COMPUTE_DEGRADATION',
    source: 'podx',
    condition: (p) => Number(p['availability']) < 0.90,
    effect: 'TRIGGER_REASONING',
    targetEnvKey: 'VEYRA_INGEST_URL',
    timeoutMs: 30_000,  // reasoning takes longer
    effectParams: (p, eventId) => ({
      context: 'COMPUTE_DEGRADATION',
      nodeId: p['nodeId'],
      availability: p['availability'],
      triggerEventId: eventId,
    }),
  },
  {
    id: 'aureon-fitiq-zusdc',
    trigger: 'FITIQ_THRESHOLD',
    source: 'aureon',
    condition: (p) => Number(p['fitiq']) < 50,
    effect: 'FLAG_SETTLEMENT',
    targetEnvKey: 'ZUSDC_INGEST_URL',
    effectParams: (p, eventId) => ({
      entityId: p['entityId'],
      fitiq: p['fitiq'],
      reason: 'FITIQ_BELOW_THRESHOLD',
      triggerEventId: eventId,
    }),
  },

  // --- Governance + Economics rules ---

  {
    id: 'treaty-expansion-dao',
    trigger: 'TREATY_ATTESTATION_NEW',
    source: 'civium',
    condition: () => true, // All new treaties trigger scope expansion notification
    effect: 'NOTIFY_SCOPE_EXPANSION',
    targetEnvKey: 'GOVERNANCE_INGEST_URL',
    effectParams: (p, eventId) => ({
      jurisdictionCode: p['jurisdictionCode'],
      treatyType: p['treatyType'],
      bilateralPartner: p['bilateralPartner'],
      triggerEventId: eventId,
    }),
  },
  {
    id: 'scale-breach-veyra',
    trigger: 'SCALE_METRIC_UPDATE',
    source: 'economics',
    condition: (p) => Number(p['omegaRsf']) > Number(p['omegaMax']),
    effect: 'TRIGGER_REASONING',
    targetEnvKey: 'VEYRA_INGEST_URL',
    timeoutMs: 30_000,  // reasoning takes longer
    effectParams: (p, eventId) => ({
      context: 'SCALE_BREACH',
      platform: p['platform'],
      omegaRsf: p['omegaRsf'],
      omegaMax: p['omegaMax'],
      assessmentStatus: p['assessmentStatus'],
      triggerEventId: eventId,
    }),
  },
  {
    id: 'objective-approved-all',
    trigger: 'OBJECTIVE_STATE_CHANGE',
    source: 'governance',
    condition: (p) => p['status'] === 'APPROVED',
    effect: 'BROADCAST_OBJECTIVE',
    targetEnvKey: 'GOVERNANCE_INGEST_URL',
    effectParams: (p, eventId) => ({
      objectiveType: p['objectiveType'],
      targetMetric: p['targetMetric'],
      targetValue: p['targetValue'],
      timeHorizonYears: p['timeHorizonYears'],
      triggerEventId: eventId,
    }),
  },
  {
    id: 'settlement-fee-zusdc',
    trigger: 'SETTLEMENT_EVENT',
    source: 'zusdc',
    condition: (p) => Number(p['amountUsdc']) >= 1_000_000, // >= $1 USDC (6 decimals)
    effect: 'CALCULATE_FEE',
    targetEnvKey: 'ECONOMICS_INGEST_URL',
    effectParams: (p, eventId) => ({
      settlementId: p['transactionId'],
      amountUsdc: p['amountUsdc'],
      counterpartyId: p['counterpartyId'],
      eventType: p['eventType'],
      triggerEventId: eventId,
    }),
  },
];
