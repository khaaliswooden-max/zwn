export interface CausalRule {
  id: string;
  trigger: string;         // SubstrateEvent type
  source: string;          // emitting platform
  condition: (payload: Record<string, unknown>) => boolean;
  effect: string;          // action string sent to target
  targetEnvKey: string;    // env var holding target ingest URL
  effectParams: (payload: Record<string, unknown>, substrateEventId: string) => Record<string, unknown>;
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
    condition: (p) => p['severity'] === 'HIGH',
    effect: 'PRIORITIZE_COMPUTE',
    targetEnvKey: 'PODX_INGEST_URL',
    effectParams: (p, eventId) => ({
      subjectId: p['subjectId'],
      priority: 'CRITICAL',
      triggerEventId: eventId,
    }),
  },
  {
    id: 'symbion-anomaly-veyra',
    trigger: 'BIOLOGICAL_ANOMALY',
    source: 'symbion',
    condition: (p) => p['severity'] === 'HIGH',
    effect: 'TRIGGER_REASONING',
    targetEnvKey: 'VEYRA_INGEST_URL',
    effectParams: (p, eventId) => ({
      context: 'BIOLOGICAL_ANOMALY_HIGH',
      subjectId: p['subjectId'],
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
];
