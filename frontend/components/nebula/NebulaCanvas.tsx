'use client';

import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import GaussianSplatRenderer from './GaussianSplatRenderer';
import ClusterHitMeshes from './ClusterHitMeshes';
import EdgeLines from './EdgeLines';
import NebulaHUD from './NebulaHUD';
import { buildClusters, getEdges } from '@/lib/nebula/data-mapper';
import {
  createCausalAnimation,
  advanceCausalAnimation,
} from '@/lib/nebula/causal-animator';
import { SelectedCluster, CausalAnimation } from '@/lib/nebula/types';
import { hexToRgb } from '@/lib/nebula/gaussian-math';
import { SUBSTRATE_COLORS } from '@/lib/constants';

// ── Camera focus animation helper ────────────────────────────────────────────

function CameraAnimator({
  target,
  onDone,
}: {
  target: [number, number, number] | null;
  onDone: () => void;
}) {
  const progress = useRef(0);
  const startPos = useRef(new THREE.Vector3());
  const started = useRef(false);

  useFrame(({ camera }) => {
    if (!target) {
      started.current = false;
      progress.current = 0;
      return;
    }
    if (!started.current) {
      startPos.current.copy(camera.position);
      started.current = true;
      progress.current = 0;
    }

    progress.current = Math.min(1, progress.current + 0.02);
    const t = 1 - Math.pow(1 - progress.current, 3); // ease-out cubic

    const targetVec = new THREE.Vector3(...target);
    const dir = targetVec.clone().sub(startPos.current).normalize();
    const endPos = targetVec.clone().sub(dir.multiplyScalar(4));

    camera.position.lerpVectors(startPos.current, endPos, t);
    camera.lookAt(targetVec);

    if (progress.current >= 1) {
      started.current = false;
      onDone();
    }
  });

  return null;
}

// ── Time tracker (runs inside Canvas) ────────────────────────────────────────

function TimeTracker({ onTime }: { onTime: (t: number) => void }) {
  const elapsed = useRef(0);
  useFrame((_, delta) => {
    elapsed.current += delta;
    onTime(elapsed.current);
  });
  return null;
}

// ── Causal animation manager ─────────────────────────────────────────────────

function CausalAnimManager({
  animations,
  onUpdate,
}: {
  animations: CausalAnimation[];
  onUpdate: (updated: CausalAnimation[]) => void;
}) {
  const prevTime = useRef(performance.now());

  useFrame(() => {
    const now = performance.now();
    const delta = now - prevTime.current;
    prevTime.current = now;

    if (animations.length === 0) return;

    const next: CausalAnimation[] = [];
    for (const anim of animations) {
      const updated = advanceCausalAnimation(anim, delta);
      if (updated) next.push(updated);
    }
    if (next.length !== animations.length || next.some((a, i) => a.phase !== animations[i].phase || a.progress !== animations[i].progress)) {
      onUpdate(next);
    }
  });

  return null;
}

// ── Main component ───────────────────────────────────────────────────────────

interface Props {
  height?: number;
}

export default function NebulaCanvas({ height }: Props) {
  const [selected, setSelected] = useState<SelectedCluster | null>(null);
  const [focusTarget, setFocusTarget] = useState<[number, number, number] | null>(null);
  const [time, setTime] = useState(0);
  const [causalAnims, setCausalAnims] = useState<CausalAnimation[]>([]);

  const clusters = useMemo(() => buildClusters(), []);
  const edges = useMemo(() => getEdges(), []);

  const handleSelect = useCallback((s: SelectedCluster | null) => {
    setSelected(s);
  }, []);

  const handleDoubleClick = useCallback((center: [number, number, number]) => {
    setFocusTarget(center);
  }, []);

  const handleFocusDone = useCallback(() => {
    setFocusTarget(null);
  }, []);

  const handleBackgroundClick = useCallback(() => {
    setSelected(null);
  }, []);

  // Demo: trigger a causal animation on keypress 'c'
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'c' || e.key === 'C') {
        // Animate from first ComplianceState to first ProcurementState
        const source = clusters.find((c) => c.nodeType === 'ComplianceState');
        const target = clusters.find((c) => c.nodeType === 'ProcurementState');
        if (source && target) {
          const sourceColor = hexToRgb(
            SUBSTRATE_COLORS[source.nodeType] ?? '#888780',
          );
          const anim = createCausalAnimation(
            `causal-${Date.now()}`,
            source.center,
            target.center,
            sourceColor,
          );
          setCausalAnims((prev) => [...prev, anim]);
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [clusters]);

  return (
    <div className="relative w-full h-full bg-zwn-bg">
      <Canvas
        style={{ height: height ?? '100%' }}
        camera={{ position: [0, 3, 12], fov: 50, near: 0.1, far: 200 }}
        gl={{
          antialias: true,
          alpha: false,
          powerPreference: 'high-performance',
        }}
        onPointerMissed={handleBackgroundClick}
      >
        <color attach="background" args={['#0a0a0a']} />

        <TimeTracker onTime={setTime} />
        <CameraAnimator target={focusTarget} onDone={handleFocusDone} />
        <CausalAnimManager
          animations={causalAnims}
          onUpdate={setCausalAnims}
        />

        <GaussianSplatRenderer
          clusters={clusters}
          causalAnimations={causalAnims}
          selectedClusterId={selected?.nodeId ?? null}
          time={time}
        />

        <EdgeLines edges={edges} clusters={clusters} />

        <ClusterHitMeshes
          clusters={clusters}
          onSelect={handleSelect}
          onDoubleClick={handleDoubleClick}
        />

        <OrbitControls
          enableDamping
          dampingFactor={0.08}
          minDistance={2}
          maxDistance={50}
          maxPolarAngle={Math.PI * 0.94}
          minPolarAngle={Math.PI * 0.06}
          autoRotate
          autoRotateSpeed={0.3}
        />

        <ambientLight intensity={0.15} />
      </Canvas>

      <NebulaHUD selected={selected} onClose={() => setSelected(null)} />

      {/* Keyboard hint */}
      <div className="absolute bottom-2 left-4 text-[9px] text-zwn-muted/50 tracking-widest">
        press C to trigger causal flow
      </div>
    </div>
  );
}
