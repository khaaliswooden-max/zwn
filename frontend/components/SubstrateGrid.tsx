'use client';

import { useState } from 'react';
import { SUBSTRATE_COLORS, SUBSTRATE_LABELS, SUBSTRATE_KEY_METRIC } from '@/lib/constants';
import CodeBlock from './CodeBlock';

const SUBSTRATE_KEYS = [
  'compliance',
  'procurement',
  'biological',
  'historical',
  'migration',
  'compute',
] as const;

const SUBSTRATE_TYPE: Record<string, string> = {
  compliance: 'ComplianceState',
  procurement: 'ProcurementState',
  biological: 'BiologicalState',
  historical: 'HistoricalRecon',
  migration: 'MigrationState',
  compute: 'ComputeState',
};

interface Props {
  worldState: Record<string, unknown>;
}

export default function SubstrateGrid({ worldState }: Props) {
  const [expanded, setExpanded] = useState<string | null>(null);

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
      {SUBSTRATE_KEYS.map((key) => {
        const state = worldState[key] as Record<string, unknown> | undefined | null;
        const type = SUBSTRATE_TYPE[key];
        const color = SUBSTRATE_COLORS[type] ?? '#888780';
        const label = SUBSTRATE_LABELS[type] ?? key.toUpperCase();
        const isExpanded = expanded === key;

        return (
          <div
            key={key}
            className="border border-zwn-border rounded bg-zwn-surface cursor-pointer transition-colors hover:border-opacity-60"
            style={isExpanded ? { borderColor: `${color}50` } : undefined}
            onClick={() => setExpanded(isExpanded ? null : key)}
          >
            <div className="flex items-center justify-between px-3 py-2.5">
              <div className="flex items-center gap-2">
                <span
                  className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                  style={{ background: color }}
                />
                <span
                  className="text-[9px] tracking-widest font-semibold"
                  style={{ color }}
                >
                  {label}
                </span>
              </div>
              {state ? (
                <span className="text-[10px] text-zwn-muted text-right max-w-[160px] truncate">
                  {SUBSTRATE_KEY_METRIC(type, state)}
                </span>
              ) : (
                <span className="text-[10px] text-zwn-border">no data</span>
              )}
            </div>

            {state && (
              <div className="px-3 pb-1 flex items-center justify-between">
                <span className="text-[9px] text-zwn-border">
                  {state.timestamp
                    ? new Date(state.timestamp as number).toISOString().slice(0, 19).replace('T', ' ')
                    : '—'}
                </span>
                <span className="text-[9px] text-zwn-border">{isExpanded ? '▲' : '▼'}</span>
              </div>
            )}

            {isExpanded && state && (
              <div className="px-3 pb-3" onClick={(e) => e.stopPropagation()}>
                <CodeBlock data={state} maxHeight="200px" />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
