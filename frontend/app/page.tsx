'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { RECENT_ENTITY_IDS } from '@/lib/mock';

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
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setRecent(getRecentEntities());
    inputRef.current?.focus();
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
    <div className="flex flex-col items-center justify-center min-h-[calc(100vh-80px)] px-6">
      <div className="w-full max-w-sm space-y-8">
        {/* Wordmark */}
        <div className="text-center space-y-1">
          <div className="text-[9px] text-zwn-muted tracking-[0.3em]">ZUUP WORLD NETWORK</div>
          <div className="text-2xl text-zwn-teal font-semibold tracking-widest">ZWN</div>
        </div>

        {/* Search */}
        <form onSubmit={handleSubmit} className="space-y-2">
          <div className="text-[9px] text-zwn-muted tracking-widest text-center mb-3">
            search entity →
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
  );
}
