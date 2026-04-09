'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { MOCK_GRAPH_DATA } from '@/lib/mock';
import { SUBSTRATE_LABELS } from '@/lib/constants';
import Link from 'next/link';

// ForceGraph2D is browser-only
const ForceGraph2D = dynamic(() => import('react-force-graph-2d'), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full flex items-center justify-center text-zwn-muted text-[11px] tracking-widest">
      loading graph...
    </div>
  ),
});

interface GraphNode {
  id: string;
  label: string;
  type: string;
  color: string;
  val: number;
  x?: number;
  y?: number;
}

interface GraphLink {
  source: string | GraphNode;
  target: string | GraphNode;
  color: string;
  type: string;
}

interface SelectedNode {
  id: string;
  type: string;
  label: string;
}

interface Props {
  height?: number;
}

export default function WorldCanvas({ height }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dims, setDims] = useState({ w: 800, h: 600 });
  const [selected, setSelected] = useState<SelectedNode | null>(null);

  useEffect(() => {
    const measure = () => {
      if (containerRef.current) {
        setDims({
          w: containerRef.current.offsetWidth,
          h: height ?? containerRef.current.offsetHeight,
        });
      }
    };
    measure();
    const ro = new ResizeObserver(measure);
    if (containerRef.current) ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, [height]);

  const handleNodeClick = useCallback((node: object) => {
    const n = node as GraphNode;
    setSelected({ id: n.id, type: n.type, label: n.label });
  }, []);

  const nodeCanvasObject = useCallback(
    (node: object, ctx: CanvasRenderingContext2D) => {
      const n = node as GraphNode;
      const x = n.x ?? 0;
      const y = n.y ?? 0;
      const r = n.val ?? 4;

      ctx.beginPath();
      ctx.arc(x, y, r, 0, 2 * Math.PI);
      ctx.fillStyle = n.color;
      ctx.fill();

      if (n.type === 'WorldActor') {
        ctx.strokeStyle = `${n.color}80`;
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }

      // Label for WorldActor nodes
      if (n.type === 'WorldActor') {
        ctx.font = '8px IBM Plex Mono, monospace';
        ctx.fillStyle = '#888880';
        ctx.textAlign = 'center';
        ctx.fillText(n.id, x, y + r + 10);
      }
    },
    []
  );

  const linkColor = useCallback((link: object) => {
    return (link as GraphLink).color;
  }, []);

  const linkWidth = useCallback((link: object) => {
    return (link as GraphLink).type === 'CAUSED_BY' ? 1.5 : 0.8;
  }, []);

  return (
    <div ref={containerRef} className="relative w-full h-full bg-zwn-bg">
      <ForceGraph2D
        graphData={MOCK_GRAPH_DATA}
        width={dims.w}
        height={dims.h}
        backgroundColor="#0a0a0a"
        nodeCanvasObject={nodeCanvasObject}
        nodePointerAreaPaint={(node: object, color: string, ctx: CanvasRenderingContext2D) => {
          const n = node as GraphNode;
          ctx.fillStyle = color;
          ctx.beginPath();
          ctx.arc(n.x ?? 0, n.y ?? 0, (n.val ?? 4) + 2, 0, 2 * Math.PI);
          ctx.fill();
        }}
        linkColor={linkColor}
        linkWidth={linkWidth}
        onNodeClick={handleNodeClick}
        onBackgroundClick={() => setSelected(null)}
        cooldownTicks={120}
        d3AlphaDecay={0.02}
        d3VelocityDecay={0.3}
      />

      {/* Side panel */}
      {selected && (
        <div className="absolute top-4 right-4 w-52 border border-zwn-border bg-zwn-surface rounded p-4 text-[11px] space-y-2">
          <button
            onClick={() => setSelected(null)}
            className="absolute top-2 right-3 text-zwn-muted hover:text-zwn-text text-[10px]"
          >
            ✕
          </button>
          <div className="text-zwn-text font-medium truncate pr-4">{selected.id}</div>
          <div className="text-[9px] text-zwn-muted tracking-widest">
            {SUBSTRATE_LABELS[selected.type] ?? selected.type.toUpperCase()}
          </div>
          {selected.type === 'WorldActor' && (
            <Link
              href={`/entities/${encodeURIComponent(selected.id)}`}
              className="block text-[10px] text-zwn-teal hover:opacity-80 transition-opacity"
            >
              view entity →
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
