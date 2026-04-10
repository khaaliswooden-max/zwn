'use client';

import { useEffect, useState, useRef } from 'react';
import { Connection } from '@solana/web3.js';
import { PROGRAM_ID } from '@/lib/constants';

const SOLANA_RPC =
  process.env.NEXT_PUBLIC_SOLANA_RPC ?? 'https://api.devnet.solana.com';
const POLL_INTERVAL_MS = 4_000;

export default function StatusBar() {
  const [slot, setSlot] = useState<number | null>(null);
  const [tps, setTps] = useState<number | null>(null);
  const [stale, setStale] = useState(false);
  const connRef = useRef<Connection | null>(null);

  useEffect(() => {
    const conn = new Connection(SOLANA_RPC);
    connRef.current = conn;

    let mounted = true;
    let consecutiveFailures = 0;

    async function poll() {
      if (!mounted) return;
      try {
        const [currentSlot, perfSamples] = await Promise.all([
          conn.getSlot(),
          conn.getRecentPerformanceSamples(1),
        ]);
        if (!mounted) return;
        setSlot(currentSlot);
        if (perfSamples.length > 0) {
          const s = perfSamples[0];
          setTps(Math.round(s.numTransactions / s.samplePeriodSecs));
        }
        setStale(false);
        consecutiveFailures = 0;
      } catch {
        consecutiveFailures++;
        if (consecutiveFailures >= 3) setStale(true);
      }
    }

    poll();
    const id = setInterval(poll, POLL_INTERVAL_MS);
    return () => {
      mounted = false;
      clearInterval(id);
    };
  }, []);

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 flex items-center gap-6 px-6 h-9 border-t border-zwn-border bg-zwn-bg text-[10px] text-zwn-muted tracking-widest">
      {/* Pulsing live dot */}
      <span className="flex items-center gap-1.5">
        <span className="relative flex h-1.5 w-1.5">
          <span
            className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${
              stale ? 'bg-zwn-amber' : 'bg-zwn-teal'
            }`}
          />
          <span
            className={`relative inline-flex rounded-full h-1.5 w-1.5 ${
              stale ? 'bg-zwn-amber' : 'bg-zwn-teal'
            }`}
          />
        </span>
        {stale ? 'STALE' : 'DEVNET'}
      </span>

      <span>
        slot{' '}
        <span className="text-zwn-text">
          {slot !== null ? slot.toLocaleString() : '---'}
        </span>
      </span>

      <span>
        <span className="text-zwn-text">
          {tps !== null ? tps.toLocaleString() : '---'}
        </span>{' '}
        TPS
      </span>

      <span className="hidden sm:inline truncate max-w-[260px]">
        {PROGRAM_ID}
      </span>
    </div>
  );
}
