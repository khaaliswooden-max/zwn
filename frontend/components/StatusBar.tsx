'use client';

import { useEffect, useState } from 'react';
import { PROGRAM_ID } from '@/lib/constants';

const BASE_SLOT = 320_000_000;
const BASE_TPS = 2_740;

export default function StatusBar() {
  const [slot, setSlot] = useState(BASE_SLOT);
  const [tps, setTps] = useState(BASE_TPS);

  useEffect(() => {
    const id = setInterval(() => {
      setSlot((s) => s + 1);
      setTps(Math.floor(2600 + Math.random() * 400));
    }, 400);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 flex items-center gap-6 px-6 h-9 border-t border-zwn-border bg-zwn-bg text-[10px] text-zwn-muted tracking-widest">
      {/* Pulsing live dot */}
      <span className="flex items-center gap-1.5">
        <span className="relative flex h-1.5 w-1.5">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-zwn-teal opacity-75" />
          <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-zwn-teal" />
        </span>
        DEVNET
      </span>

      <span>
        slot <span className="text-zwn-text">{slot.toLocaleString()}</span>
      </span>

      <span>
        <span className="text-zwn-text">{tps.toLocaleString()}</span> TPS
      </span>

      <span className="hidden sm:inline truncate max-w-[260px]">
        {PROGRAM_ID}
      </span>
    </div>
  );
}
