'use client';

/**
 * SplatEnvironment — error boundary wrapper for SplatScene.
 *
 * Handles:
 *  - Missing splat files (404) → silently falls back to nebula-only rendering
 *  - Loading state with a minimal indicator
 *  - Errors that shouldn't crash the entire canvas
 *
 * Usage inside a R3F <Canvas>:
 *   <SplatEnvironment url="/splats/world-demo.ksplat" />
 */

import { useState } from 'react';
import SplatScene from './SplatScene';

interface Props {
  url: string;
  scale?: number;
  position?: [number, number, number];
}

type LoadState = 'loading' | 'loaded' | 'error';

export default function SplatEnvironment({ url, scale, position }: Props) {
  const [state, setState] = useState<LoadState>('loading');

  // On error (file missing, network error, WebGL issue), we simply don't render
  // the splat — the nebula visualization continues normally.
  if (state === 'error') return null;

  return (
    <SplatScene
      url={url}
      scale={scale}
      position={position}
      onLoaded={() => setState('loaded')}
      onError={() => setState('error')}
    />
  );
}
