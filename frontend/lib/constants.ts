export const ZWM_API_BASE =
  process.env.NEXT_PUBLIC_ZWM_API_URL ?? 'http://localhost:3001';

export const ZWM_GQL_BASE =
  process.env.NEXT_PUBLIC_ZWM_GRAPHQL_URL ?? 'http://localhost:4000/graphql';

export const PROGRAM_ID = 'H1eSx6ij1Q296Tzss62AHuamn1rD4a9MkDapYu1CyvVM';

// ── Substrate display ────────────────────────────────────────────────────────

export const SUBSTRATE_COLORS: Record<string, string> = {
  WorldActor: '#1D9E75',
  ComplianceState: '#7F77DD',
  ProcurementState: '#7F77DD',
  BiologicalState: '#EF9F27',
  HistoricalRecon: '#EF9F27',
  MigrationState: '#D85A30',
  ComputeState: '#D85A30',
  SubstrateEvent: '#888780',
};

export const SUBSTRATE_LABELS: Record<string, string> = {
  ComplianceState: 'COMPLIANCE',
  ProcurementState: 'PROCUREMENT',
  BiologicalState: 'BIOLOGICAL',
  HistoricalRecon: 'HISTORICAL',
  MigrationState: 'MIGRATION',
  ComputeState: 'COMPUTE',
};

export const SUBSTRATE_KEY_METRIC = (
  type: string,
  s: Record<string, unknown>
): string => {
  switch (type) {
    case 'ComplianceState':
      return `${String(s.status ?? '—')} · ${String(s.score ?? '—')}/100`;
    case 'ProcurementState':
      return `FitIQ ${String(s.fitiq ?? '—')} · UPD ${String(s.upd ?? '—')}`;
    case 'BiologicalState':
      return s.anomaly_flag ? 'ANOMALY DETECTED' : 'nominal';
    case 'HistoricalRecon':
      return `confidence ${String(s.confidence ?? '—')}`;
    case 'MigrationState':
      return `preservation ${String(s.semantic_preservation ?? '—')}`;
    case 'ComputeState':
      return `availability ${String(s.availability ?? '—')}`;
    default:
      return '—';
  }
};

// ── Risk ─────────────────────────────────────────────────────────────────────

export const RISK_COLORS: Record<string, string> = {
  LOW: '#1D9E75',
  MEDIUM: '#EF9F27',
  HIGH: '#D85A30',
  CRITICAL: '#ff4444',
};

// ── Platforms and actions ─────────────────────────────────────────────────────

export const PLATFORMS = [
  'civium', 'aureon', 'qal', 'symbion', 'relian', 'podx', 'veyra', 'zusdc', 'zuup_hq',
] as const;

export type Platform = (typeof PLATFORMS)[number];

export const PLATFORM_ACTIONS: Record<string, string[]> = {
  civium: ['COMPLIANCE_STATE_CHANGE'],
  aureon: ['RECALCULATE_FIT_IQ', 'UPDATE_RISK_PRIORS'],
  qal: ['RECONSTRUCTION_COMPLETE'],
  symbion: ['BIOLOGICAL_READING'],
  relian: ['MIGRATION_COMPLETE'],
  podx: ['PRIORITIZE_COMPUTE', 'REALLOCATE_WORKLOAD'],
  veyra: ['TRIGGER_REASONING'],
  zusdc: ['FLAG_SETTLEMENT', 'RELEASE_HOLD'],
  zuup_hq: ['WRITE_ATTESTATION'],
};

export const ACTION_CAUSAL_DESC: Record<string, string> = {
  COMPLIANCE_STATE_CHANGE:
    'VIOLATION → RECALCULATE_FIT_IQ (aureon) + FLAG_SETTLEMENT (zusdc)',
  RECALCULATE_FIT_IQ:
    'FitIQ < 50 → FLAG_SETTLEMENT (zusdc)',
  UPDATE_RISK_PRIORS:
    'No downstream trigger',
  RECONSTRUCTION_COMPLETE:
    'confidence > 0.75 → UPDATE_RISK_PRIORS (aureon)',
  BIOLOGICAL_READING:
    'severity === HIGH → PRIORITIZE_COMPUTE (podx) + TRIGGER_REASONING (veyra)',
  MIGRATION_COMPLETE:
    'semantic_preservation >= 0.95 → WRITE_ATTESTATION (zuup_hq)',
  PRIORITIZE_COMPUTE:
    'Direct compute prioritization on podx',
  REALLOCATE_WORKLOAD:
    'Workload reallocation on podx',
  TRIGGER_REASONING:
    'Triggers reasoning cycle on veyra',
  FLAG_SETTLEMENT:
    'Flags settlement for review on zusdc',
  RELEASE_HOLD:
    'Releases flagged settlement on zusdc',
  WRITE_ATTESTATION:
    'Writes SHA256 attestation on-chain via zuup_hq',
};

export type FieldDef = {
  name: string;
  label: string;
  type: 'text' | 'number' | 'select';
  placeholder: string;
  options?: string[];
};

export const ACTION_FIELDS: Record<string, FieldDef[]> = {
  COMPLIANCE_STATE_CHANGE: [
    { name: 'entity_id', label: 'entity_id', type: 'text', placeholder: 'supplier-abc' },
    { name: 'status', label: 'status', type: 'select', placeholder: 'COMPLIANT', options: ['COMPLIANT', 'VIOLATION', 'FLAGGED'] },
    { name: 'score', label: 'score (0–100)', type: 'number', placeholder: '85' },
    { name: 'domain', label: 'domain', type: 'select', placeholder: 'halal', options: ['halal', 'esg', 'itar'] },
  ],
  RECALCULATE_FIT_IQ: [
    { name: 'entity_id', label: 'entity_id', type: 'text', placeholder: 'supplier-abc' },
    { name: 'penalty', label: 'penalty (0.0–1.0)', type: 'number', placeholder: '0.4' },
  ],
  UPDATE_RISK_PRIORS: [
    { name: 'entity_id', label: 'entity_id', type: 'text', placeholder: 'supplier-abc' },
    { name: 'confidence', label: 'confidence (0.0–1.0)', type: 'number', placeholder: '0.8' },
  ],
  RECONSTRUCTION_COMPLETE: [
    { name: 'entity_id', label: 'entity_id', type: 'text', placeholder: 'supplier-abc' },
    { name: 'domain', label: 'domain', type: 'text', placeholder: 'ITAR' },
    { name: 'confidence', label: 'confidence', type: 'number', placeholder: '0.82' },
    { name: 'risk_level', label: 'risk_level', type: 'select', placeholder: 'LOW', options: ['LOW', 'MEDIUM', 'HIGH'] },
  ],
  BIOLOGICAL_READING: [
    { name: 'subject_id', label: 'subject_id', type: 'text', placeholder: 'subject-001' },
    { name: 'anomaly_flag', label: 'anomaly_flag', type: 'select', placeholder: 'false', options: ['false', 'true'] },
    { name: 'severity', label: 'severity', type: 'select', placeholder: 'NONE', options: ['NONE', 'LOW', 'MEDIUM', 'HIGH'] },
    { name: 'serotonin_nm', label: 'serotonin_nm', type: 'number', placeholder: '45.2' },
    { name: 'dopamine_nm', label: 'dopamine_nm', type: 'number', placeholder: '38.1' },
  ],
  MIGRATION_COMPLETE: [
    { name: 'project_id', label: 'project_id', type: 'text', placeholder: 'proj-001' },
    { name: 'semantic_preservation', label: 'semantic_preservation', type: 'number', placeholder: '0.96' },
    { name: 'test_coverage', label: 'test_coverage', type: 'number', placeholder: '0.87' },
    { name: 'loc_migrated', label: 'loc_migrated', type: 'number', placeholder: '12000' },
  ],
  PRIORITIZE_COMPUTE: [
    { name: 'entity_id', label: 'entity_id', type: 'text', placeholder: 'node-001' },
    { name: 'priority', label: 'priority', type: 'select', placeholder: 'CRITICAL', options: ['NORMAL', 'HIGH', 'CRITICAL'] },
  ],
  REALLOCATE_WORKLOAD: [
    { name: 'entity_id', label: 'entity_id', type: 'text', placeholder: 'node-001' },
  ],
  TRIGGER_REASONING: [
    { name: 'entity_id', label: 'entity_id', type: 'text', placeholder: 'supplier-abc' },
    { name: 'context', label: 'context', type: 'text', placeholder: 'compliance-violation' },
  ],
  FLAG_SETTLEMENT: [
    { name: 'entity_id', label: 'entity_id', type: 'text', placeholder: 'supplier-abc' },
    { name: 'transaction_id', label: 'transaction_id', type: 'text', placeholder: 'tx-001' },
  ],
  RELEASE_HOLD: [
    { name: 'entity_id', label: 'entity_id', type: 'text', placeholder: 'supplier-abc' },
    { name: 'transaction_id', label: 'transaction_id', type: 'text', placeholder: 'tx-001' },
  ],
  WRITE_ATTESTATION: [
    { name: 'entity_id', label: 'entity_id', type: 'text', placeholder: 'proj-001' },
    { name: 'sha256', label: 'sha256', type: 'text', placeholder: 'abc123def456...' },
    { name: 'score', label: 'score', type: 'number', placeholder: '97' },
  ],
};

// ── API Console endpoint definitions ─────────────────────────────────────────

export type EndpointDef = {
  label: string;
  method: 'GET' | 'POST';
  path: string;
  params: Array<{ name: string; placeholder: string; inPath?: boolean }>;
  needsBody?: boolean;
};

export const CONSOLE_ENDPOINTS: EndpointDef[] = [
  {
    label: 'GET /enterprise/world-state/:entityId',
    method: 'GET',
    path: '/enterprise/world-state/{entityId}',
    params: [{ name: 'entityId', placeholder: 'supplier-alpha', inPath: true }],
  },
  {
    label: 'GET /enterprise/risk/:entityId',
    method: 'GET',
    path: '/enterprise/risk/{entityId}',
    params: [{ name: 'entityId', placeholder: 'supplier-alpha', inPath: true }],
  },
  {
    label: 'GET /enterprise/compliance/:status',
    method: 'GET',
    path: '/enterprise/compliance/{status}',
    params: [
      { name: 'status', placeholder: 'COMPLIANT', inPath: true },
      { name: 'domain', placeholder: 'halal (optional)' },
    ],
  },
  {
    label: 'GET /enterprise/causal-chain/:eventId',
    method: 'GET',
    path: '/enterprise/causal-chain/{eventId}',
    params: [{ name: 'eventId', placeholder: 'evt-001', inPath: true }],
  },
  {
    label: 'POST /enterprise/api-keys',
    method: 'POST',
    path: '/enterprise/api-keys',
    params: [],
    needsBody: true,
  },
  {
    label: 'POST /enterprise/nn/karpathy/detect',
    method: 'POST',
    path: '/enterprise/nn/karpathy/detect',
    params: [],
    needsBody: true,
  },
  {
    label: 'POST /enterprise/nn/anomaly/batch',
    method: 'POST',
    path: '/enterprise/nn/anomaly/batch',
    params: [],
    needsBody: true,
  },
];
