'use client';

/**
 * SplatScene — integrates a real 3D Gaussian Splat scene into the existing R3F canvas.
 *
 * Uses @mkkellogg/gaussian-splats-3d's DropInViewer, which extends THREE.Group and
 * hooks into the Three.js render loop automatically via onBeforeRender. This means:
 *  - No separate WebGL context or canvas
 *  - The splat renders as part of the existing R3F scene with correct depth
 *  - OrbitControls from NebulaCanvas drive both the splat environment and the nebula
 *
 * The library is dynamically imported to avoid SSR issues (it accesses browser globals).
 */

import { useEffect, useRef } from 'react';
import { useThree } from '@react-three/fiber';
import type { DropInViewer } from '@mkkellogg/gaussian-splats-3d';

interface Props {
  /** Path to .ksplat, .splat, or .ply file (e.g. "/splats/world-demo.ksplat") */
  url: string;
  /** Scale of the splat scene in world units (default 1.0) */
  scale?: number;
  /** Position offset [x, y, z] (default [0, 0, 0]) */
  position?: [number, number, number];
  /** Called when the splat has finished loading */
  onLoaded?: () => void;
  /** Called if loading fails */
  onError?: (err: Error) => void;
}

export default function SplatScene({
  url,
  scale = 1.0,
  position = [0, 0, 0],
  onLoaded,
  onError,
}: Props) {
  const { scene } = useThree();
  const dropInRef = useRef<DropInViewer | null>(null);

  useEffect(() => {
    let cancelled = false;
    let visibilityHandler: (() => void) | null = null;
    let idleHandle: number | null = null;

    async function load() {
      try {
        // Dynamic import ensures this only runs in the browser (no SSR issues)
        const { DropInViewer } = await import('@mkkellogg/gaussian-splats-3d');

        if (cancelled) return;

        const dropIn = new DropInViewer({
          sharedMemoryForWorkers: false, // Avoids SharedArrayBuffer CORS requirements
          splatAlphaRemovalThreshold: 5, // Remove near-transparent splats for performance
        });

        dropIn.position.set(...position);
        dropIn.scale.setScalar(scale);

        scene.add(dropIn);
        dropInRef.current = dropIn;

        await dropIn.addSplatScene(url, {
          splatAlphaRemovalThreshold: 5,
          showLoadingUI: false,
        });

        if (!cancelled) {
          onLoaded?.();
        }
      } catch (err) {
        if (!cancelled) {
          console.warn('[SplatScene] Failed to load splat:', url, err);
          onError?.(err instanceof Error ? err : new Error(String(err)));
        }
      }
    }

    // Defer the multi-MB .ksplat fetch until after first paint and only when
    // the tab is actually visible — keeps LCP and TTI off the critical path.
    const scheduleLoad = () => {
      if (cancelled) return;
      const w = window as Window & {
        requestIdleCallback?: (cb: () => void, opts?: { timeout?: number }) => number;
      };
      if (w.requestIdleCallback) {
        idleHandle = w.requestIdleCallback(() => {
          if (!cancelled) void load();
        }, { timeout: 2000 });
      } else {
        idleHandle = window.setTimeout(() => {
          if (!cancelled) void load();
        }, 500);
      }
    };

    if (typeof document !== 'undefined' && document.visibilityState !== 'visible') {
      visibilityHandler = () => {
        if (document.visibilityState === 'visible' && visibilityHandler) {
          document.removeEventListener('visibilitychange', visibilityHandler);
          visibilityHandler = null;
          scheduleLoad();
        }
      };
      document.addEventListener('visibilitychange', visibilityHandler);
    } else {
      scheduleLoad();
    }

    return () => {
      cancelled = true;
      if (visibilityHandler) {
        document.removeEventListener('visibilitychange', visibilityHandler);
      }
      if (idleHandle !== null) {
        const w = window as Window & { cancelIdleCallback?: (h: number) => void };
        if (w.cancelIdleCallback) w.cancelIdleCallback(idleHandle);
        else window.clearTimeout(idleHandle);
      }
      const dropIn = dropInRef.current;
      if (dropIn) {
        scene.remove(dropIn);
        try {
          dropIn.viewer.dispose();
        } catch {
          // dispose may throw if called before init completes
        }
        dropInRef.current = null;
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, scale, position[0], position[1], position[2]]);

  return null; // Pure imperative Three.js — no R3F JSX elements
}
