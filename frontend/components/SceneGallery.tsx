'use client';

/**
 * SceneGallery — visual picker for LTX-Video scenes.
 *
 * Pulls the scene list + metadata from ltx-service (with a local fallback so
 * the gallery renders even when the service is offline), fetches the cached
 * first-frame preview for each scene, and hands selection back to the parent.
 *
 * Silent fallback: if ltx-service is unreachable, we render the hardcoded
 * scene list with no previews — the only thing lost is the real thumbnail.
 */

import { useEffect, useState } from 'react';

export interface Scene {
  id: string;
  label: string;
  description: string;
  color: string;
  duration?: number;
  estimatedSeconds?: number;
}

const DEFAULT_SCENES: Scene[] = [
  { id: 'world-nebula', label: 'World Nebula', description: 'Deep space teal nebula · ZWM default environment', color: '#1D9E75' },
  { id: 'compliance-domain', label: 'Compliance Domain', description: 'Green crystalline lattice · Civium substrate', color: '#7F77DD' },
  { id: 'causal-flow', label: 'Causal Flow', description: 'Energy streams between nodes · cross-substrate', color: '#D85A30' },
  { id: 'procurement-lattice', label: 'Procurement Lattice', description: 'Purple-amber network · Aureon substrate', color: '#7F77DD' },
  { id: 'biological-field', label: 'Biological Field', description: 'Amber waveforms · Symbion substrate', color: '#EF9F27' },
];

interface Props {
  selected: string;
  onSelect: (sceneId: string) => void;
  ltxBase?: string;
}

export default function SceneGallery({ selected, onSelect, ltxBase }: Props) {
  const base = ltxBase ?? process.env.NEXT_PUBLIC_LTX_SERVICE_URL ?? 'http://localhost:8100';
  const [scenes, setScenes] = useState<Scene[]>(DEFAULT_SCENES);
  const [previewOk, setPreviewOk] = useState<Record<string, boolean>>({});

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const res = await fetch(`${base}/scenes`);
        if (!res.ok || cancelled) return;
        const data = await res.json();
        if (!Array.isArray(data?.scenes)) return;
        const merged: Scene[] = data.scenes.map((s: { name: string; estimated_seconds?: number; duration?: number }) => {
          const fallback = DEFAULT_SCENES.find((d) => d.id === s.name);
          return {
            id: s.name,
            label: fallback?.label ?? s.name,
            description: fallback?.description ?? '',
            color: fallback?.color ?? '#888880',
            duration: s.duration,
            estimatedSeconds: s.estimated_seconds,
          };
        });
        if (!cancelled && merged.length > 0) setScenes(merged);
      } catch {
        // ltx-service offline — keep defaults
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [base]);

  return (
    <div className="space-y-1.5">
      {scenes.map((s) => {
        const active = selected === s.id;
        return (
          <button
            key={s.id}
            type="button"
            onClick={() => onSelect(s.id)}
            className={`group w-full text-left rounded border transition-colors overflow-hidden ${
              active
                ? 'border-zwn-teal/40 bg-zwn-teal/5'
                : 'border-zwn-border/50 hover:border-zwn-border'
            }`}
          >
            <div className="flex gap-3 items-stretch">
              {/* Preview tile — image if cached, else color block */}
              <div
                className="relative w-16 h-12 shrink-0 rounded-l overflow-hidden"
                style={{ backgroundColor: s.color, opacity: active ? 0.9 : 0.35 }}
              >
                {previewOk[s.id] !== false && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={`${base}/preview/${encodeURIComponent(s.id)}`}
                    alt=""
                    className="absolute inset-0 w-full h-full object-cover"
                    loading="lazy"
                    onError={() => setPreviewOk((prev) => ({ ...prev, [s.id]: false }))}
                    onLoad={() => setPreviewOk((prev) => ({ ...prev, [s.id]: true }))}
                  />
                )}
              </div>

              {/* Metadata */}
              <div className="flex-1 min-w-0 py-1.5 pr-2">
                <div className={`text-[11px] font-medium ${active ? 'text-zwn-teal' : 'text-zwn-text/85'}`}>
                  {s.label}
                </div>
                <div className="text-[9px] mt-0.5 text-zwn-muted/70 truncate">{s.description}</div>
                {typeof s.estimatedSeconds === 'number' && (
                  <div className="text-[8px] mt-0.5 text-zwn-muted/50 font-mono">
                    ~{s.estimatedSeconds}s · {s.duration ?? 8}s output
                  </div>
                )}
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}
