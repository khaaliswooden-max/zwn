// Rich mock data used as silent fallback when backend is unreachable.

export const MOCK_ENTITIES = [
  {
    actor: {
      id: 'supplier-alpha',
      created_at: 1712000000000,
      last_seen: 1712600000000,
    },
    compliance: {
      id: 'cs-001',
      entity_id: 'supplier-alpha',
      status: 'COMPLIANT',
      score: 87,
      domain: 'halal',
      timestamp: 1712600000000,
      solana_slot: 320000000,
      tx_signature: '4xK7m...vQ9r',
    },
    procurement: {
      id: 'ps-001',
      entity_id: 'supplier-alpha',
      fitiq: 72,
      upd: 68,
      timestamp: 1712600000000,
      solana_slot: 320000000,
    },
    biological: {
      id: 'bs-001',
      entity_id: 'supplier-alpha',
      serotonin: 45.2,
      dopamine: 38.1,
      cortisol: 12.4,
      gaba: 22.0,
      anomaly_flag: false,
      sensitivity: 0.925,
      timestamp: 1712600000000,
    },
    historical: {
      id: 'hr-001',
      entity_id: 'supplier-alpha',
      domain: 'ITAR',
      confidence: 0.82,
      temporal_depth_years: 12,
      risk_metrics: '{"volatility":0.14}',
      timestamp: 1712600000000,
    },
    migration: null,
    compute: null,
    risk: {
      entityId: 'supplier-alpha',
      riskLevel: 'LOW',
      complianceStatus: 'COMPLIANT',
      complianceScore: 87,
      fitiq: 72,
      availability: null,
      anomalyFlag: false,
    },
  },
  {
    actor: {
      id: 'agency-bravo',
      created_at: 1710000000000,
      last_seen: 1712600000000,
    },
    compliance: {
      id: 'cs-002',
      entity_id: 'agency-bravo',
      status: 'VIOLATION',
      score: 23,
      domain: 'esg',
      timestamp: 1712580000000,
      solana_slot: 319990000,
      tx_signature: '7bR2n...wP4s',
    },
    procurement: {
      id: 'ps-002',
      entity_id: 'agency-bravo',
      fitiq: 41,
      upd: 55,
      timestamp: 1712580000000,
      solana_slot: 319991000,
    },
    biological: null,
    historical: {
      id: 'hr-002',
      entity_id: 'agency-bravo',
      domain: 'ESG',
      confidence: 0.61,
      temporal_depth_years: 7,
      risk_metrics: '{"volatility":0.38}',
      timestamp: 1712500000000,
    },
    migration: null,
    compute: {
      id: 'comp-002',
      entity_id: 'agency-bravo',
      xdop_score: 88,
      wcbi: 91,
      ddil_hours: 28,
      tops: 450,
      availability: 0.87,
      timestamp: 1712580000000,
    },
    risk: {
      entityId: 'agency-bravo',
      riskLevel: 'CRITICAL',
      complianceStatus: 'VIOLATION',
      complianceScore: 23,
      fitiq: 41,
      availability: 0.87,
      anomalyFlag: false,
    },
  },
  {
    actor: {
      id: 'node-charlie',
      created_at: 1711000000000,
      last_seen: 1712600000000,
    },
    compliance: {
      id: 'cs-003',
      entity_id: 'node-charlie',
      status: 'FLAGGED',
      score: 61,
      domain: 'itar',
      timestamp: 1712550000000,
      solana_slot: 319950000,
    },
    procurement: null,
    biological: {
      id: 'bs-003',
      entity_id: 'node-charlie',
      serotonin: 12.1,
      dopamine: 8.7,
      cortisol: 41.2,
      gaba: 9.8,
      anomaly_flag: true,
      sensitivity: 0.925,
      timestamp: 1712550000000,
    },
    historical: null,
    migration: {
      id: 'ms-003',
      project_id: 'node-charlie',
      semantic_preservation: 0.97,
      test_coverage: 0.88,
      velocity_loc_day: 820,
      artifact_hash: 'a1b2c3...f9e8',
      timestamp: 1712550000000,
    },
    compute: {
      id: 'comp-003',
      entity_id: 'node-charlie',
      xdop_score: 76,
      wcbi: 82,
      ddil_hours: 36,
      tops: 380,
      availability: 0.99,
      timestamp: 1712550000000,
    },
    risk: {
      entityId: 'node-charlie',
      riskLevel: 'HIGH',
      complianceStatus: 'FLAGGED',
      complianceScore: 61,
      fitiq: null,
      availability: 0.99,
      anomalyFlag: true,
    },
  },
];

export const MOCK_CAUSAL_CHAIN = [
  {
    event: {
      id: 'evt-001',
      type: 'COMPLIANCE_STATE_CHANGE',
      source: 'civium',
      entity_id: 'agency-bravo',
      solana_slot: 319990000,
      timestamp: 1712580000000,
    },
    effect: {
      id: 'ps-002-v2',
      entity_id: 'agency-bravo',
      fitiq: 41,
      upd: 55,
      substrate: 'ProcurementState',
    },
  },
  {
    event: {
      id: 'evt-002',
      type: 'FITIQ_THRESHOLD',
      source: 'aureon',
      entity_id: 'agency-bravo',
      solana_slot: 319991200,
      timestamp: 1712580480000,
    },
    effect: {
      id: 'settle-flag-001',
      transaction_id: 'tx-bravo-0041',
      event_type: 'FLAG',
      counterparty_id: 'agency-bravo',
      substrate: 'SettlementRecord',
    },
  },
];

export const MOCK_GRAPH_DATA = {
  nodes: [
    { id: 'supplier-alpha', label: 'supplier-alpha', type: 'WorldActor', color: '#1D9E75', val: 8 },
    { id: 'agency-bravo', label: 'agency-bravo', type: 'WorldActor', color: '#1D9E75', val: 8 },
    { id: 'node-charlie', label: 'node-charlie', type: 'WorldActor', color: '#1D9E75', val: 8 },
    { id: 'cs-001', label: 'compliance', type: 'ComplianceState', color: '#7F77DD', val: 4 },
    { id: 'ps-001', label: 'procurement', type: 'ProcurementState', color: '#7F77DD', val: 4 },
    { id: 'bs-001', label: 'biological', type: 'BiologicalState', color: '#EF9F27', val: 4 },
    { id: 'hr-001', label: 'historical', type: 'HistoricalRecon', color: '#EF9F27', val: 4 },
    { id: 'cs-002', label: 'compliance', type: 'ComplianceState', color: '#7F77DD', val: 4 },
    { id: 'ps-002', label: 'procurement', type: 'ProcurementState', color: '#7F77DD', val: 4 },
    { id: 'hr-002', label: 'historical', type: 'HistoricalRecon', color: '#EF9F27', val: 4 },
    { id: 'comp-002', label: 'compute', type: 'ComputeState', color: '#D85A30', val: 4 },
    { id: 'cs-003', label: 'compliance', type: 'ComplianceState', color: '#7F77DD', val: 4 },
    { id: 'bs-003', label: 'biological', type: 'BiologicalState', color: '#EF9F27', val: 4 },
    { id: 'ms-003', label: 'migration', type: 'MigrationState', color: '#D85A30', val: 4 },
    { id: 'comp-003', label: 'compute', type: 'ComputeState', color: '#D85A30', val: 4 },
    { id: 'evt-001', label: 'COMPLIANCE_CHANGE', type: 'SubstrateEvent', color: '#888780', val: 3 },
    { id: 'evt-002', label: 'FITIQ_THRESHOLD', type: 'SubstrateEvent', color: '#888780', val: 3 },
  ],
  links: [
    { source: 'supplier-alpha', target: 'cs-001', color: 'rgba(255,255,255,0.2)', type: 'HAS_STATE' },
    { source: 'supplier-alpha', target: 'ps-001', color: 'rgba(255,255,255,0.2)', type: 'HAS_STATE' },
    { source: 'supplier-alpha', target: 'bs-001', color: 'rgba(255,255,255,0.2)', type: 'HAS_STATE' },
    { source: 'supplier-alpha', target: 'hr-001', color: 'rgba(255,255,255,0.2)', type: 'HAS_STATE' },
    { source: 'agency-bravo', target: 'cs-002', color: 'rgba(255,255,255,0.2)', type: 'HAS_STATE' },
    { source: 'agency-bravo', target: 'ps-002', color: 'rgba(255,255,255,0.2)', type: 'HAS_STATE' },
    { source: 'agency-bravo', target: 'hr-002', color: 'rgba(255,255,255,0.2)', type: 'HAS_STATE' },
    { source: 'agency-bravo', target: 'comp-002', color: 'rgba(255,255,255,0.2)', type: 'HAS_STATE' },
    { source: 'node-charlie', target: 'cs-003', color: 'rgba(255,255,255,0.2)', type: 'HAS_STATE' },
    { source: 'node-charlie', target: 'bs-003', color: 'rgba(255,255,255,0.2)', type: 'HAS_STATE' },
    { source: 'node-charlie', target: 'ms-003', color: 'rgba(255,255,255,0.2)', type: 'HAS_STATE' },
    { source: 'node-charlie', target: 'comp-003', color: 'rgba(255,255,255,0.2)', type: 'HAS_STATE' },
    { source: 'cs-002', target: 'evt-001', color: '#D85A30', type: 'EMITTED' },
    { source: 'evt-001', target: 'ps-002', color: '#D85A30', type: 'CAUSED_BY' },
    { source: 'evt-001', target: 'evt-002', color: '#D85A30', type: 'CAUSED_BY' },
  ],
};

// ── Lookup helpers ────────────────────────────────────────────────────────────

export function getMockWorldState(entityId: string) {
  return (
    MOCK_ENTITIES.find((e) => e.actor.id === entityId) ??
    MOCK_ENTITIES[0]
  );
}

export function getMockRisk(entityId: string) {
  return (
    MOCK_ENTITIES.find((e) => e.actor.id === entityId)?.risk ??
    MOCK_ENTITIES[0].risk
  );
}

export function getMockEntitiesByCompliance(status: string) {
  return MOCK_ENTITIES.filter(
    (e) => e.compliance?.status === status
  ).map((e) => e.actor);
}

export const RECENT_ENTITY_IDS = [
  'supplier-alpha',
  'agency-bravo',
  'node-charlie',
];
