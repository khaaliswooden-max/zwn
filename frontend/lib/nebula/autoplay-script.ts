export interface AutoplayStep {
  label: string;
  sourceNodeId: string;
  targetNodeId: string;
  baseDelay: number;
  jitterMs?: number;
}

/**
 * Scripted causal replay: Civium compliance violation cascades through
 * Aureon procurement recalculation to FitIQ threshold flagging.
 *
 * Follows the agency-bravo mock causal chain:
 *   cs-002 (violation) -> evt-001 (COMPLIANCE_CHANGE)
 *     -> ps-002 (FitIQ recalc) + evt-002 (FITIQ_THRESHOLD)
 *       -> comp-002 (compute/settlement review)
 */
export const AUTOPLAY_SCRIPT: AutoplayStep[] = [
  {
    label: 'Civium violation emits event',
    sourceNodeId: 'cs-002',
    targetNodeId: 'evt-001',
    baseDelay: 0,
    jitterMs: 0,
  },
  {
    label: 'Event triggers procurement recalc',
    sourceNodeId: 'evt-001',
    targetNodeId: 'ps-002',
    baseDelay: 800,
    jitterMs: 200,
  },
  {
    label: 'Event cascades to FitIQ threshold',
    sourceNodeId: 'evt-001',
    targetNodeId: 'evt-002',
    baseDelay: 400,
    jitterMs: 150,
  },
  {
    label: 'FitIQ threshold flags compute review',
    sourceNodeId: 'evt-002',
    targetNodeId: 'comp-002',
    baseDelay: 1200,
    jitterMs: 300,
  },
];

export const INITIAL_DELAY_MS = 2000;
export const CYCLE_PAUSE_MS = 4000;
export const IDLE_RESUME_MS = 3000;
