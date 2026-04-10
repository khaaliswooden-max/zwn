'use client';

import Link from 'next/link';
import { SelectedCluster } from '@/lib/nebula/types';
import { SUBSTRATE_LABELS, SUBSTRATE_KEY_METRIC } from '@/lib/constants';

interface Props {
  selected: SelectedCluster | null;
  onClose: () => void;
}

export default function NebulaHUD({ selected, onClose }: Props) {
  if (!selected) return null;

  const substrateLabel =
    SUBSTRATE_LABELS[selected.nodeType] ?? selected.nodeType.toUpperCase();

  const keyMetric = selected.metrics
    ? SUBSTRATE_KEY_METRIC(selected.nodeType, selected.metrics)
    : null;

  return (
    <div className="absolute top-4 right-4 w-56 border border-zwn-border bg-zwn-surface/90 backdrop-blur rounded p-4 text-[11px] space-y-2 z-10">
      <button
        onClick={onClose}
        className="absolute top-2 right-3 text-zwn-muted hover:text-zwn-text text-[10px]"
      >
        x
      </button>

      <div className="text-zwn-text font-medium truncate pr-4">
        {selected.nodeId}
      </div>

      <div className="text-[9px] text-zwn-muted tracking-widest">
        {substrateLabel}
      </div>

      {keyMetric && (
        <div className="text-[10px] text-zwn-text/70 font-mono">
          {keyMetric}
        </div>
      )}

      {selected.nodeType === 'WorldActor' && (
        <Link
          href={`/entities/${encodeURIComponent(selected.nodeId)}`}
          className="block text-[10px] text-zwn-teal hover:opacity-80 transition-opacity mt-2"
        >
          view entity &rarr;
        </Link>
      )}

      {selected.entityId && selected.nodeType !== 'WorldActor' && (
        <Link
          href={`/entities/${encodeURIComponent(selected.entityId)}`}
          className="block text-[10px] text-zwn-teal hover:opacity-80 transition-opacity mt-2"
        >
          view parent entity &rarr;
        </Link>
      )}
    </div>
  );
}
