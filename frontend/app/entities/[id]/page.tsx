'use client';

import { useEffect, useState, use } from 'react';
import Link from 'next/link';
import { getWorldState, getCausalChain } from '@/lib/api';
import { getMockWorldState, MOCK_CAUSAL_CHAIN } from '@/lib/mock';
import EntityCard from '@/components/EntityCard';
import SubstrateGrid from '@/components/SubstrateGrid';
import CausalChain from '@/components/CausalChain';

interface WorldState {
  actor?: { id: string; created_at?: number; last_seen?: number };
  compliance?: Record<string, unknown> | null;
  procurement?: Record<string, unknown> | null;
  biological?: Record<string, unknown> | null;
  historical?: Record<string, unknown> | null;
  migration?: Record<string, unknown> | null;
  compute?: Record<string, unknown> | null;
  risk?: {
    riskLevel: string;
    complianceStatus?: string;
    complianceScore?: number;
    fitiq?: number | null;
    availability?: number | null;
    anomalyFlag?: boolean;
  };
}

interface CausalLink {
  event: Record<string, unknown>;
  effect: Record<string, unknown>;
}

function addRecent(id: string) {
  try {
    const stored = localStorage.getItem('zwn_recent_entities');
    const existing: string[] = stored ? JSON.parse(stored) : [];
    const updated = [id, ...existing.filter((e) => e !== id)].slice(0, 5);
    localStorage.setItem('zwn_recent_entities', JSON.stringify(updated));
  } catch { /* ignore */ }
}

export default function EntityPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const entityId = decodeURIComponent(id);

  const [worldState, setWorldState] = useState<WorldState | null>(null);
  const [causalChain, setCausalChain] = useState<CausalLink[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    addRecent(entityId);

    void (async () => {
      try {
        const ws = await getWorldState(entityId);
        // Merge mock risk since enterprise API may not return it inline
        const mockData = getMockWorldState(entityId);
        setWorldState({
          ...(ws as WorldState),
          risk: (ws as WorldState).risk ?? mockData.risk,
        });
      } catch {
        setWorldState(getMockWorldState(entityId) as unknown as WorldState);
      }

      // Load causal chain from most recent compliance event if available
      setCausalChain(MOCK_CAUSAL_CHAIN as CausalLink[]);
      try {
        const chain = await getCausalChain('evt-001');
        if (Array.isArray(chain) && chain.length > 0) {
          setCausalChain(chain as CausalLink[]);
        }
      } catch { /* keep mock */ }

      setLoading(false);
    })();
  }, [entityId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[calc(100vh-80px)] text-[11px] text-zwn-muted tracking-widest">
        loading...
      </div>
    );
  }

  if (!worldState) return null;

  const risk = worldState.risk ?? { riskLevel: 'LOW' };
  const actor = worldState.actor ?? { id: entityId };

  return (
    <div className="max-w-2xl mx-auto px-6 py-8 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link
          href="/"
          className="text-[10px] text-zwn-muted hover:text-zwn-text tracking-widest transition-colors"
        >
          ← back
        </Link>
        <div className="flex-1 min-w-0">
          <EntityCard
            entityId={entityId}
            risk={risk}
            lastSeen={actor.last_seen}
          />
        </div>
      </div>

      {/* Substrate grid */}
      <div>
        <div className="text-[9px] text-zwn-muted tracking-widest mb-2">SUBSTRATES</div>
        <SubstrateGrid worldState={worldState as Record<string, unknown>} />
      </div>

      {/* Causal chain */}
      <CausalChain chain={causalChain} />
    </div>
  );
}
