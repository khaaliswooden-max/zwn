'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { ZWM_API_BASE } from '@/lib/constants';
import DemoBadge from '@/components/DemoBadge';
import EntitySearchPanel from '@/components/EntitySearchPanel';

const WorldCanvas = dynamic(() => import('@/components/WorldCanvas'), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full flex items-center justify-center text-zwn-muted text-[11px] tracking-widest bg-zwn-bg">
      loading world model...
    </div>
  ),
});

export default function HomePage() {
  const router = useRouter();
  const [backendUp, setBackendUp] = useState<boolean | null>(null);

  useEffect(() => {
    fetch(`${ZWM_API_BASE}/health`, { method: 'GET' })
      .then((r) => setBackendUp(r.ok))
      .catch(() => setBackendUp(false));
  }, []);

  return (
    <div className="flex flex-col">
      {/* Hero: World Canvas */}
      <div className="w-full" style={{ height: '60vh' }}>
        <WorldCanvas height={undefined} />
      </div>

      {/* Tagline */}
      <div className="text-center px-6 py-10 space-y-3">
        <h1 className="text-[28px] font-bold text-zwn-text" style={{ fontFamily: "'IBM Plex Sans', sans-serif" }}>
          The institutional world model.
        </h1>
        <p className="text-[22px] text-zwn-muted font-mono">
          Nine substrates. One causal graph. Live on Solana.
        </p>
        <Link
          href="/build"
          className="inline-block text-[22px] font-bold font-mono hover:opacity-80 transition-opacity"
          style={{ color: '#1A1A2E' }}
        >
          <span className="text-zwn-teal">Access the ZWM &rarr;</span>
        </Link>
      </div>

      {/* Search + Recent */}
      <div className="flex flex-col items-center px-6 pb-16">
        <div className="w-full max-w-sm space-y-8">
          {backendUp === false && (
            <div className="flex justify-center">
              <DemoBadge />
            </div>
          )}
          <EntitySearchPanel
            onSearch={(id) => router.push(`/entities/${encodeURIComponent(id)}`)}
          />
        </div>
      </div>
    </div>
  );
}
