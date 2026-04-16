'use client';

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';

const WorldCanvas = dynamic(() => import('@/components/WorldCanvas'), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full flex items-center justify-center text-zwn-muted text-[11px] tracking-widest bg-zwn-bg">
      loading world model...
    </div>
  ),
});

/**
 * Graph page — full-viewport causal graph visualization.
 *
 * When a .ksplat file is present at /splats/graph-env.ksplat (produced by the
 * splat-pipeline), it is rendered as an environmental 3DGS backdrop.
 * Falls back to /splats/world-demo.ksplat, then to nebula-only if neither exists.
 *
 * To generate a custom backdrop:
 *   bash splat-pipeline/video_to_splat.sh <video.mp4> graph-env
 * Then copy the output to frontend/public/splats/graph-env.ksplat
 */
const SPLAT_CANDIDATES = ['/splats/graph-env.ksplat', '/splats/world-demo.ksplat'];

async function findFirstAvailableSplat(candidates: string[]): Promise<string | undefined> {
  for (const url of candidates) {
    try {
      const res = await fetch(url, { method: 'HEAD' });
      if (res.ok) return url;
    } catch {
      // ignore network errors, try next
    }
  }
  return undefined;
}

export default function GraphPage() {
  const [height, setHeight] = useState(600);
  const [splatUrl, setSplatUrl] = useState<string | undefined>(undefined);
  const [splatChecked, setSplatChecked] = useState(false);

  useEffect(() => {
    const calc = () => setHeight(window.innerHeight - 44 - 36);
    calc();
    window.addEventListener('resize', calc);
    return () => window.removeEventListener('resize', calc);
  }, []);

  useEffect(() => {
    findFirstAvailableSplat(SPLAT_CANDIDATES).then((url) => {
      setSplatUrl(url);
      setSplatChecked(true);
    });
  }, []);

  return (
    <div className="relative w-full" style={{ height }}>
      {splatChecked && (
        <WorldCanvas height={height} splatUrl={splatUrl} />
      )}
      {!splatChecked && (
        <div className="w-full h-full flex items-center justify-center text-zwn-muted text-[11px] tracking-widest bg-zwn-bg">
          loading world model...
        </div>
      )}

      {/* Splat status indicator */}
      {splatChecked && splatUrl && (
        <div className="absolute bottom-2 right-4 z-10 text-[8px] text-zwn-muted/30 tracking-widest">
          3DGS · {splatUrl.split('/').pop()}
        </div>
      )}
    </div>
  );
}
