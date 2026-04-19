'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';

const SubstrateBackdrop = dynamic(() => import('@/components/splat/SubstrateBackdrop'), {
  ssr: false,
});

// Platform → splat scene. Each scene is baked offline by
// splat-pipeline/batch_substrates.sh into /splats/<scene>.ksplat. If the
// file is missing, SplatEnvironment silently 404s and the grid is unchanged.
const PLATFORM_SPLAT: Record<string, string> = {
  CIVIUM: '/splats/compliance-domain.ksplat',
  AUREON: '/splats/procurement-lattice.ksplat',
  QAL: '/splats/causal-flow.ksplat',
  SYMBION: '/splats/biological-field.ksplat',
  RELIAN: '/splats/causal-flow.ksplat',
  PODX: '/splats/world-nebula.ksplat',
  VEYRA: '/splats/world-nebula.ksplat',
  ZUSDC: '/splats/world-nebula.ksplat',
  'ZUUP HQ': '/splats/world-nebula.ksplat',
};

const DEFAULT_SPLAT = '/splats/world-nebula.ksplat';

const SUBSTRATES = [
  {
    superpower: 'Compliance Intelligence',
    platform: 'CIVIUM',
    benchmark: '100% W3C VC 2.0 + EPCIS 2.0',
    capability:
      'Real-time halal, ESG, and ITAR compliance verification with on-chain attestation.',
    status: 'ACTIVE',
    color: '#7F77DD',
  },
  {
    superpower: 'Procurement Optimization',
    platform: 'AUREON',
    benchmark: 'NDCG@20 >= 0.85 · FitIQ',
    capability:
      'AI-driven supplier matching with FitIQ scoring and universal procurement discovery.',
    status: 'ACTIVE',
    color: '#7F77DD',
  },
  {
    superpower: 'Historical Reconstruction',
    platform: 'QAL',
    benchmark: 'QAWM Fidelity > 0.75',
    capability:
      'Temporal risk archaeology — reconstructing entity histories for confidence-scored risk priors.',
    status: 'DEVNET',
    color: '#EF9F27',
  },
  {
    superpower: 'Biological Awareness',
    platform: 'SYMBION',
    benchmark: '92.5% sensitivity · 94.3% specificity',
    capability:
      'Non-invasive neurochemical sensing with real-time anomaly detection at clinical accuracy.',
    status: 'DEVNET',
    color: '#EF9F27',
  },
  {
    superpower: 'Migration Intelligence',
    platform: 'RELIAN',
    benchmark: 'Semantic preservation >= 0.95',
    capability:
      'Automated codebase migration with semantic equivalence guarantees and on-chain attestation.',
    status: 'DEVNET',
    color: '#D85A30',
  },
  {
    superpower: 'Sovereign Compute',
    platform: 'PODX',
    benchmark: 'XdoP 100 · WCBI 100 · 99.99% uptime',
    capability:
      'DDIL-tolerant edge compute orchestration with sovereign resource allocation.',
    status: 'DEVNET',
    color: '#D85A30',
  },
  {
    superpower: 'Reasoning Engine',
    platform: 'VEYRA',
    benchmark: 'V-Score > 75 production · > 90 superhuman',
    capability:
      'World-model-aware AI reasoning with full causal context injection from the ZWM graph.',
    status: 'DEVNET',
    color: '#1D9E75',
  },
  {
    superpower: 'Settlement Layer',
    platform: 'ZUSDC',
    benchmark: '1:1 USDC backing · atomic mint/burn',
    capability:
      'Fully collateralized cross-platform settlement with real-time fee engine and hold mechanics.',
    status: 'DEVNET',
    color: '#1D9E75',
  },
  {
    superpower: 'Trust Anchor',
    platform: 'ZUUP HQ',
    benchmark: '100% SHA256 content-addressed',
    capability:
      'On-chain attestation registry — the root of trust for all cross-substrate state claims.',
    status: 'DEVNET',
    color: '#888780',
  },
];

export default function SubstratesPage() {
  const [activeSplat, setActiveSplat] = useState<string>(DEFAULT_SPLAT);

  return (
    <div className="relative min-h-[60vh]">
      <SubstrateBackdrop splatUrl={activeSplat} />

      <div className="relative max-w-4xl mx-auto px-6 py-12">
      <div className="text-center mb-12">
        <div className="text-[9px] text-zwn-muted tracking-[0.3em] mb-2">
          NINE SUBSTRATES
        </div>
        <h1 className="text-2xl text-zwn-text font-semibold tracking-wide">
          The World Model Stack
        </h1>
        <p className="text-[13px] text-zwn-muted mt-3 max-w-lg mx-auto">
          Each substrate is an independent Solana-deployed platform. Together,
          they form a single causally-coherent world model.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {SUBSTRATES.map((s) => (
          <div
            key={s.platform}
            onMouseEnter={() => setActiveSplat(PLATFORM_SPLAT[s.platform] ?? DEFAULT_SPLAT)}
            onMouseLeave={() => setActiveSplat(DEFAULT_SPLAT)}
            onFocus={() => setActiveSplat(PLATFORM_SPLAT[s.platform] ?? DEFAULT_SPLAT)}
            tabIndex={0}
            className="border border-zwn-border rounded bg-zwn-surface/90 backdrop-blur-sm p-4 space-y-3 hover:border-opacity-60 transition-colors"
          >
            <div className="flex items-center justify-between">
              <span
                className="text-[9px] tracking-widest font-semibold"
                style={{ color: s.color }}
              >
                {s.superpower.toUpperCase()}
              </span>
              <span
                className={`text-[8px] tracking-widest px-1.5 py-0.5 rounded ${
                  s.status === 'ACTIVE'
                    ? 'bg-zwn-teal/10 text-zwn-teal border border-zwn-teal/20'
                    : 'bg-zwn-muted/10 text-zwn-muted border border-zwn-border'
                }`}
              >
                {s.status}
              </span>
            </div>

            <div className="text-[11px] text-zwn-muted font-mono">
              {s.platform}
            </div>

            <div className="text-[10px] text-zwn-text/80 leading-relaxed">
              {s.capability}
            </div>

            <div className="text-[9px] text-zwn-muted/60 font-mono border-t border-zwn-border pt-2">
              {s.benchmark}
            </div>
          </div>
        ))}
      </div>
      </div>
    </div>
  );
}
