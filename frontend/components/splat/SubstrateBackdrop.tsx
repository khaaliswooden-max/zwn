'use client';

/**
 * SubstrateBackdrop — ambient 3DGS backdrop for the /substrates grid.
 *
 * One shared R3F canvas behind the card grid. The URL swaps as the user
 * hovers cards, so we only pay for a single WebGL context. If the .ksplat
 * for the active substrate doesn't exist, SplatEnvironment silently 404s
 * and the backdrop collapses to black — the grid still renders normally.
 *
 * Baked offline by splat-pipeline/batch_substrates.sh.
 */

import { Suspense, useRef } from 'react';
import dynamic from 'next/dynamic';
import { useFrame } from '@react-three/fiber';
import type { PerspectiveCamera } from 'three';

const Canvas = dynamic(() => import('@react-three/fiber').then((m) => m.Canvas), { ssr: false });
const SplatEnvironment = dynamic(() => import('./SplatEnvironment'), { ssr: false });

interface Props {
  splatUrl: string;
}

function AutoRotateCamera() {
  const camRef = useRef<PerspectiveCamera | null>(null);
  useFrame(({ camera, clock }) => {
    // Slow orbital drift — enough motion to feel alive without drawing the eye
    // away from the grid content sitting on top of the canvas.
    const t = clock.getElapsedTime() * 0.08;
    const r = 3.2;
    camera.position.x = Math.sin(t) * r;
    camera.position.z = Math.cos(t) * r;
    camera.position.y = 0.3;
    camera.lookAt(0, 0, 0);
    camRef.current = camera as PerspectiveCamera;
  });
  return null;
}

export default function SubstrateBackdrop({ splatUrl }: Props) {
  return (
    <div
      aria-hidden
      className="fixed inset-0 pointer-events-none opacity-25 transition-opacity duration-700"
    >
      <Canvas
        camera={{ position: [0, 0.3, 3.2], fov: 50 }}
        gl={{ powerPreference: 'low-power', antialias: false }}
        dpr={[1, 1.5]}
      >
        <ambientLight intensity={0.4} />
        <Suspense fallback={null}>
          <SplatEnvironment url={splatUrl} />
        </Suspense>
        <AutoRotateCamera />
      </Canvas>
    </div>
  );
}
