'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import { RECENT_ENTITY_IDS } from '@/lib/mock';
import { ZWM_API_BASE } from '@/lib/constants';
import DemoBadge from '@/components/DemoBadge';

const WorldCanvas = dynamic(() => import('@/components/WorldCanvas'), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full flex items-center justify-center text-zwn-muted text-[11px] tracking-widest bg-zwn-bg">
      loading world model...
    </div>
  ),
});

const STORAGE_KEY = 'zwn_recent_entities';
const MAX_RECENT = 5;

function getRecentEntities(): string[] {
  if (typeof window === 'undefined') return RECENT_ENTITY_IDS;
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? (JSON.parse(stored) as string[]) : RECENT_ENTITY_IDS;
  } catch {
    return RECENT_ENTITY_IDS;
  }
}

function addRecentEntity(id: string): void {
  const existing = getRecentEntities().filter((e) => e !== id);
  const updated = [id, ...existing].slice(0, MAX_RECENT);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
}

export default function HomePage() {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [recent, setRecent] = useState<string[]>([]);
  const [backendUp, setBackendUp] = useState<boolean | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setRecent(getRecentEntities());

    fetch(`${ZWM_API_BASE}/health`, { method: 'GET' })
      .then((r) => setBackendUp(r.ok))
      .catch(() => setBackendUp(false));
  }, []);

  const navigate = (id: string) => {
    if (!id.trim()) return;
    addRecentEntity(id.trim());
    router.push(`/entities/${encodeURIComponent(id.trim())}`);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    navigate(query);
  };

  return (
    <div className="flex flex-col">
      {/* Hero: World Canvas */}
      <div className="w-full" style={{ height: '60vh' }}>
        <WorldCanvas height={undefined} />
      </div>

      {/* Search + Recent */}
      <div className="flex flex-col items-center px-6 pb-16">
        <div className="w-full max-w-sm space-y-8">
          {/* Demo mode indicator */}
          {backendUp === false && (
            <div className="flex justify-center">
              <DemoBadge />
            </div>
          )}

          {/* Search */}
          <form onSubmit={handleSubmit} className="space-y-2">
            <div className="text-[9px] text-zwn-muted tracking-widest text-center mb-3">
              search entity &rarr;
            </div>
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="entity-id"
              autoComplete="off"
              className="w-full bg-zwn-surface border border-zwn-border rounded px-4 py-3 text-[13px] text-zwn-text placeholder-zwn-border outline-none focus:border-zwn-teal transition-colors text-center"
            />
            <button type="submit" className="sr-only">search</button>
          </form>

          {/* Recent */}
          {recent.length > 0 && (
            <div className="space-y-2">
              <div className="text-[9px] text-zwn-border tracking-widest text-center">recent</div>
              <div className="space-y-1">
                {recent.map((id) => (
                  <button
                    key={id}
                    onClick={() => navigate(id)}
                    className="w-full text-left text-[11px] text-zwn-muted hover:text-zwn-text px-3 py-1.5 rounded hover:bg-zwn-surface transition-colors"
                  >
                    {id}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
