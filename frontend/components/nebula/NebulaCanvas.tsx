'use client';

import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
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

// ── OrbitControls (inline to avoid @react-three/drei dependency weight) ──────

function SimpleOrbitControls() {
  const { camera, gl } = useThree();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const controlsRef = useRef<any>(null);

  useEffect(() => {
    let controls: InstanceType<typeof THREE.EventDispatcher> | null = null;

    import('three/examples/jsm/controls/OrbitControls.js').then(
      ({ OrbitControls }) => {
        const oc = new OrbitControls(camera, gl.domElement);
        oc.enableDamping = true;
        oc.dampingFactor = 0.08;
        oc.minDistance = 2;
        oc.maxDistance = 50;
        oc.maxPolarAngle = Math.PI * 0.94;
        oc.minPolarAngle = Math.PI * 0.06;
        oc.autoRotate = true;
        oc.autoRotateSpeed = 0.3;
        controlsRef.current = oc;
        controls = oc;
      },
    );

    return () => {
      if (controlsRef.current) {
        controlsRef.current.dispose();
      }
    };
  }, [camera, gl]);

  useFrame(() => {
    if (controlsRef.current) {
      controlsRef.current.update();
    }
  });

  return null;
}

// ── Camera focus animation ───────────────────────────────────────────────────

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
    const t = 1 - Math.pow(1 - progress.current, 3);

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

// ── Causal animation manager ─────────────────────────────────────────────────

function CausalAnimManager({
  animsRef,
  setAnims,
}: {
  animsRef: React.RefObject<CausalAnimation[]>;
  setAnims: (anims: CausalAnimation[]) => void;
}) {
  const prevTime = useRef(performance.now());

  useFrame(() => {
    const now = performance.now();
    const delta = now - prevTime.current;
    prevTime.current = now;

    const animations = animsRef.current;
    if (!animations || animations.length === 0) return;

    const next: CausalAnimation[] = [];
    let changed = false;
    for (const anim of animations) {
      const updated = advanceCausalAnimation(anim, delta);
      if (updated) {
        next.push(updated);
        if (updated.phase !== anim.phase || updated.progress !== anim.progress) {
          changed = true;
        }
      } else {
        changed = true;
      }
    }
    if (changed) {
      setAnims(next);
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
  const [causalAnims, setCausalAnims] = useState<CausalAnimation[]>([]);
  const causalAnimsRef = useRef(causalAnims);
  causalAnimsRef.current = causalAnims;

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

        <CameraAnimator target={focusTarget} onDone={handleFocusDone} />
        <CausalAnimManager
          animsRef={causalAnimsRef}
          setAnims={setCausalAnims}
        />

        <GaussianSplatRenderer
          clusters={clusters}
          causalAnimations={causalAnims}
          selectedClusterId={selected?.nodeId ?? null}
        />

        <EdgeLines edges={edges} clusters={clusters} />

        <ClusterHitMeshes
          clusters={clusters}
          onSelect={handleSelect}
          onDoubleClick={handleDoubleClick}
        />

        <SimpleOrbitControls />

        <ambientLight intensity={0.15} />
      </Canvas>

      <NebulaHUD selected={selected} onClose={() => setSelected(null)} />

      <div className="absolute bottom-2 left-4 flex items-center gap-4 text-[9px] text-zwn-muted/50 tracking-widest">
        <span className="px-1.5 py-0.5 rounded bg-zwn-amber/10 text-zwn-amber/70 border border-zwn-amber/15">
          SEEDED DEMO
        </span>
        <span>press C to trigger causal flow</span>
      </div>
    </div>
  );
}
