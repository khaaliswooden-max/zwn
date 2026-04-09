'use client';

import { useState } from 'react';
import CodeBlock from './CodeBlock';

interface CausalLink {
  event: Record<string, unknown>;
  effect: Record<string, unknown>;
}

interface Props {
  chain: CausalLink[];
}

export default function CausalChain({ chain }: Props) {
  const [open, setOpen] = useState(false);
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);

  if (chain.length === 0) return null;

  return (
    <div className="mt-4">
      <button
        onClick={() => setOpen(!open)}
        className="text-[10px] text-zwn-muted hover:text-zwn-text tracking-widest transition-colors"
      >
        {open ? '▲' : '▼'} causal chain ({chain.length} event{chain.length !== 1 ? 's' : ''})
      </button>

      {open && (
        <div className="mt-3 border-l border-zwn-border pl-4 space-y-3">
          {chain.map((link, i) => (
            <div key={i} className="text-[11px]">
              {/* Event */}
              <div
                className="flex items-start gap-2 cursor-pointer"
                onClick={() => setExpandedIdx(expandedIdx === i ? null : i)}
              >
                <span className="text-zwn-coral mt-0.5 text-[9px]">EVT</span>
                <div className="flex-1 min-w-0">
                  <span className="text-zwn-coral">
                    {String(link.event.type ?? '—')}
                  </span>
                  <span className="text-zwn-muted ml-2">
                    {String(link.event.source ?? '—')}
                  </span>
                  <span className="text-zwn-border ml-2 text-[9px]">
                    slot {String(link.event.solana_slot ?? '—')}
                  </span>
                </div>
              </div>

              {/* Arrow */}
              <div className="ml-8 my-1 text-zwn-border text-[9px]">│</div>

              {/* Effect */}
              <div className="flex items-start gap-2 ml-0">
                <span className="text-zwn-purple mt-0.5 text-[9px]">EFF</span>
                <div className="flex-1 min-w-0 text-zwn-muted truncate">
                  {String(link.effect.substrate ?? Object.keys(link.effect)[0] ?? '—')}
                  <span className="ml-2 text-zwn-border text-[9px]">
                    {String(link.effect.id ?? '')}
                  </span>
                </div>
              </div>

              {/* Expanded JSON */}
              {expandedIdx === i && (
                <div className="mt-2 ml-8 space-y-2">
                  <CodeBlock data={link.event} maxHeight="120px" />
                  <CodeBlock data={link.effect} maxHeight="120px" />
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
