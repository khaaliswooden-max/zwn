'use client';

import { useEffect, useState, useCallback } from 'react';
import dynamic from 'next/dynamic';

const WorldCanvas = dynamic(() => import('@/components/WorldCanvas'), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full flex items-center justify-center text-zwn-muted text-[11px] tracking-widest bg-zwn-bg">
      initializing world model...
    </div>
  ),
});

const LTX_SERVICE_BASE =
  process.env.NEXT_PUBLIC_LTX_SERVICE_URL ?? 'http://localhost:8100';

const DEMO_SPLAT_URL = '/splats/world-demo.ksplat';

type GenerateStatus = 'idle' | 'queued' | 'running' | 'done' | 'error';

interface GenerateState {
  status: GenerateStatus;
  jobId: string | null;
  error: string | null;
  activeSplatUrl: string;
}

export default function WorldPage() {
  const [canvasHeight, setCanvasHeight] = useState(600);
  const [gen, setGen] = useState<GenerateState>({
    status: 'idle',
    jobId: null,
    error: null,
    activeSplatUrl: DEMO_SPLAT_URL,
  });
  const [panelOpen, setPanelOpen] = useState(false);
  const [selectedScene, setSelectedScene] = useState('world-nebula');

  useEffect(() => {
    const calc = () => setCanvasHeight(window.innerHeight - 44 - 36);
    calc();
    window.addEventListener('resize', calc);
    return () => window.removeEventListener('resize', calc);
  }, []);

  // Poll job status until done or error
  useEffect(() => {
    if (!gen.jobId || (gen.status !== 'queued' && gen.status !== 'running')) {
      return;
    }
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`${LTX_SERVICE_BASE}/status/${gen.jobId}`);
        if (!res.ok) return;
        const data = await res.json();
        if (data.status === 'done') {
          clearInterval(interval);
          // The video is on the server; point to the pipeline output splat
          // (assumes splat-pipeline ran and placed the file in public/splats/)
          const splatName = gen.jobId!.split('-').slice(0, -1).join('-');
          setGen((prev) => ({
            ...prev,
            status: 'done',
            activeSplatUrl: `/splats/${splatName}.ksplat`,
          }));
        } else if (data.status === 'error') {
          clearInterval(interval);
          setGen((prev) => ({ ...prev, status: 'error', error: data.error ?? 'Generation failed' }));
        } else {
          setGen((prev) => ({ ...prev, status: data.status }));
        }
      } catch {
        // network error — keep polling
      }
    }, 4000);
    return () => clearInterval(interval);
  }, [gen.jobId, gen.status]);

  const handleGenerate = useCallback(async () => {
    setGen((prev) => ({ ...prev, status: 'queued', jobId: null, error: null }));
    try {
      const res = await fetch(`${LTX_SERVICE_BASE}/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scene: selectedScene }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: res.statusText }));
        throw new Error(err.detail ?? 'Service error');
      }
      const data = await res.json();
      setGen((prev) => ({ ...prev, status: 'queued', jobId: data.job_id }));
      setPanelOpen(false);
    } catch (err) {
      setGen((prev) => ({
        ...prev,
        status: 'error',
        error: err instanceof Error ? err.message : 'Unknown error',
      }));
    }
  }, [selectedScene]);

  const isGenerating = gen.status === 'queued' || gen.status === 'running';

  const SCENES = [
    { id: 'world-nebula', label: 'World Nebula', desc: 'Deep space teal nebula · ZWM default environment' },
    { id: 'compliance-domain', label: 'Compliance Domain', desc: 'Green crystalline lattice · Civium substrate' },
    { id: 'causal-flow', label: 'Causal Flow', desc: 'Energy streams between nodes · cross-substrate' },
    { id: 'procurement-lattice', label: 'Procurement Lattice', desc: 'Purple-amber network · Aureon substrate' },
    { id: 'biological-field', label: 'Biological Field', desc: 'Amber waveforms · Symbion substrate' },
  ];

  return (
    <div className="relative w-full" style={{ height: canvasHeight }}>
      {/* ── 3DGS + Nebula canvas (fills entire viewport) ──────────────────── */}
      <WorldCanvas height={canvasHeight} splatUrl={gen.activeSplatUrl} />

      {/* ── World page overlays ────────────────────────────────────────────── */}

      {/* Top-left: page identity */}
      <div className="absolute top-4 left-4 z-10 flex items-center gap-2">
        <span className="text-[9px] tracking-widest text-zwn-muted/60 uppercase">
          ZWM · World Model
        </span>
        {gen.activeSplatUrl !== DEMO_SPLAT_URL && (
          <span className="text-[8px] px-1.5 py-0.5 rounded bg-zwn-teal/10 text-zwn-teal/70 border border-zwn-teal/15 tracking-widest">
            LTX-GENERATED
          </span>
        )}
        {gen.activeSplatUrl === DEMO_SPLAT_URL && (
          <span className="text-[8px] px-1.5 py-0.5 rounded bg-zwn-amber/10 text-zwn-amber/70 border border-zwn-amber/15 tracking-widest">
            DEMO SCENE
          </span>
        )}
      </div>

      {/* Top-right: generate button */}
      <div className="absolute top-4 right-4 z-10">
        {isGenerating ? (
          <div className="flex items-center gap-2 px-3 py-1.5 rounded bg-zwn-surface/80 border border-zwn-border text-[10px] text-zwn-muted tracking-widest">
            <span className="w-1.5 h-1.5 rounded-full bg-zwn-teal animate-pulse" />
            {gen.status === 'queued' ? 'generating video...' : 'training 3DGS...'}
          </div>
        ) : (
          <button
            onClick={() => setPanelOpen((v) => !v)}
            className="px-3 py-1.5 rounded bg-zwn-surface/80 border border-zwn-border text-[10px] text-zwn-muted tracking-widest hover:text-zwn-teal hover:border-zwn-teal/30 transition-colors"
          >
            {panelOpen ? 'close ✕' : 'generate world ↗'}
          </button>
        )}
      </div>

      {/* Generate panel */}
      {panelOpen && !isGenerating && (
        <div className="absolute top-12 right-4 z-20 w-72 bg-zwn-surface/95 border border-zwn-border rounded-lg p-4 space-y-4 backdrop-blur-sm">
          <div className="text-[9px] text-zwn-muted/60 tracking-widest uppercase">
            LTX-Video 2.3 · fal.ai
          </div>
          <div className="space-y-1.5">
            {SCENES.map((s) => (
              <button
                key={s.id}
                onClick={() => setSelectedScene(s.id)}
                className={`w-full text-left px-3 py-2 rounded border text-[11px] transition-colors ${
                  selectedScene === s.id
                    ? 'border-zwn-teal/40 bg-zwn-teal/5 text-zwn-teal'
                    : 'border-zwn-border/50 text-zwn-muted hover:border-zwn-border hover:text-zwn-text'
                }`}
              >
                <div className="font-medium">{s.label}</div>
                <div className="text-[9px] mt-0.5 opacity-60">{s.desc}</div>
              </button>
            ))}
          </div>
          <button
            onClick={handleGenerate}
            className="w-full px-3 py-2 rounded bg-zwn-teal/10 border border-zwn-teal/30 text-zwn-teal text-[11px] tracking-widest hover:bg-zwn-teal/15 transition-colors"
          >
            generate → 3DGS
          </button>
          <p className="text-[8px] text-zwn-muted/40 leading-relaxed">
            Generates a 10-second LTX-Video 2.3 scene via fal.ai, then trains a 3D Gaussian Splat model.
            Pipeline takes 10-20 min. Requires ltx-service running on port 8100.
          </p>
        </div>
      )}

      {/* Error toast */}
      {gen.status === 'error' && gen.error && (
        <div className="absolute bottom-10 left-1/2 -translate-x-1/2 z-20 px-4 py-2 rounded bg-red-950/80 border border-red-800/40 text-[10px] text-red-400 tracking-wide max-w-sm text-center">
          {gen.error}
          <button
            onClick={() => setGen((prev) => ({ ...prev, status: 'idle', error: null }))}
            className="ml-3 text-red-500/60 hover:text-red-400"
          >
            ✕
          </button>
        </div>
      )}

      {/* Bottom status */}
      <div className="absolute bottom-2 left-4 z-10 flex items-center gap-4 text-[9px] text-zwn-muted/40 tracking-widest">
        <span>3DGS · causal graph · live</span>
        <span className="hidden sm:inline">double-click cluster to focus · press C for causal demo</span>
      </div>
    </div>
  );
}
