'use client';

import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import dynamic from 'next/dynamic';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import GaussianSplatRenderer, { ANOMALY_FLASH_DURATION_MS } from './GaussianSplatRenderer';
import ClusterHitMeshes from './ClusterHitMeshes';
import EdgeLines from './EdgeLines';
import NebulaHUD from './NebulaHUD';
import SplatEnvironment from '@/components/splat/SplatEnvironment';

// PostFX pulls in @react-three/postprocessing + postprocessing (~80KB gz). Split
// into its own chunk so the main nebula bundle stays lean; WebGL1 devices skip
// it entirely via the supportsVolumetric() gate below.
const PostFX = dynamic(() => import('./PostFX'), { ssr: false, loading: () => null });
import { buildClusters, getEdges } from '@/lib/nebula/data-mapper';
import {
  createCausalAnimation,
  advanceCausalAnimation,
} from '@/lib/nebula/causal-animator';
import { SelectedCluster, CausalAnimation } from '@/lib/nebula/types';
import { hexToRgb } from '@/lib/nebula/gaussian-math';
import { SUBSTRATE_COLORS } from '@/lib/constants';
import { supportsVolumetric } from '@/lib/nebula/capabilities';
import { useAutoplay } from '@/lib/nebula/use-autoplay';
import { useZwmStream, ZwmStreamEvent } from '@/lib/zwm-stream';

// Platform → nodeType used for cluster lookup. Matches ZWM graph schema.
const PLATFORM_NODE_TYPE: Record<string, string> = {
  civium: 'ComplianceState',
  aureon: 'ProcurementState',
  symbion: 'BiologicalState',
  qal: 'HistoricalRecon',
  relian: 'MigrationState',
  podx: 'ComputeState',
  zusdc: 'SubstrateEvent',
  veyra: 'SubstrateEvent',
  zuup_hq: 'SubstrateEvent',
};

// ── OrbitControls (inline to avoid @react-three/drei dependency weight) ──────

// Singleton promise — the JS module cache already dedupes, but caching the
// promise avoids a per-mount allocation and microtask on route changes.
let orbitControlsModule: Promise<typeof import('three/examples/jsm/controls/OrbitControls.js')> | null = null;
function loadOrbitControls() {
  if (!orbitControlsModule) {
    orbitControlsModule = import('three/examples/jsm/controls/OrbitControls.js');
  }
  return orbitControlsModule;
}

function SimpleOrbitControls() {
  const { camera, gl } = useThree();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const controlsRef = useRef<any>(null);

  useEffect(() => {
    let cancelled = false;

    loadOrbitControls().then(({ OrbitControls }) => {
      if (cancelled) return;
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
    });

    return () => {
      cancelled = true;
      if (controlsRef.current) {
        controlsRef.current.dispose();
        controlsRef.current = null;
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
  /**
   * Optional URL to a .ksplat / .splat / .ply file.
   * When provided, a 3D Gaussian Splat scene is rendered as an environmental
   * backdrop behind the nebula cluster graph.
   * If the file is missing or fails to load, the visualization continues normally.
   */
  splatUrl?: string;
  /** External camera focus target — triggers fly-to animation when set. */
  focusTarget?: [number, number, number] | null;
}

export default function NebulaCanvas({ height, splatUrl, focusTarget: externalFocusTarget }: Props) {
  const [selected, setSelected] = useState<SelectedCluster | null>(null);
  const [focusTarget, setFocusTarget] = useState<[number, number, number] | null>(null);

  useEffect(() => {
    if (externalFocusTarget) setFocusTarget(externalFocusTarget);
  }, [externalFocusTarget]);
  const [causalAnims, setCausalAnims] = useState<CausalAnimation[]>([]);
  const causalAnimsRef = useRef(causalAnims);
  causalAnimsRef.current = causalAnims;

  // Live anomaly flashes — map<clusterNodeId, expiresAtMs>. Mutated directly
  // from stream callbacks and read by the renderer each frame, so keeping it
  // in a ref avoids re-rendering the whole canvas on every flash.
  const anomalyFlashesRef = useRef<Map<string, number>>(new Map());

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

  // Demo: trigger a causal animation on keypress 'c' (desktop) or via the
  // 'zwn:causal-demo' custom event (mobile button — same handler keeps both
  // surfaces in sync without lifting state out of NebulaCanvas).
  useEffect(() => {
    const trigger = () => {
      const source = clusters.find((c) => c.nodeType === 'ComplianceState');
      const target = clusters.find((c) => c.nodeType === 'ProcurementState');
      if (!source || !target) return;
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
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'c' || e.key === 'C') trigger();
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('zwn:causal-demo', trigger);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('zwn:causal-demo', trigger);
    };
  }, [clusters]);

  const addAnimation = useCallback((anim: CausalAnimation) => {
    setCausalAnims((prev) => [...prev, anim]);
  }, []);

  useAutoplay(clusters, addAnimation);

  // Live SSE → nebula reactions. Misses (entity/cluster not found) silently
  // skip; autoplay keeps running so the canvas never goes dead.
  const onStreamEvent = useCallback(
    (evt: ZwmStreamEvent) => {
      if (evt.kind === 'CAUSAL_PROPAGATION') {
        const entityId =
          typeof evt.params?.entityId === 'string' ? evt.params.entityId : undefined;
        if (!entityId) return;

        const srcType = PLATFORM_NODE_TYPE[evt.source];
        const tgtType = PLATFORM_NODE_TYPE[evt.target];
        if (!srcType || !tgtType) return;

        const source = clusters.find(
          (c) => c.nodeType === srcType && c.entityId === entityId,
        );
        const target = clusters.find(
          (c) => c.nodeType === tgtType && c.entityId === entityId,
        );
        if (!source || !target) return;

        const sourceColor = hexToRgb(SUBSTRATE_COLORS[source.nodeType] ?? '#888780');
        addAnimation(
          createCausalAnimation(
            `live-${evt.substrateEventId}-${evt.ruleId}`,
            source.center,
            target.center,
            sourceColor,
          ),
        );
        return;
      }

      if (evt.kind === 'ANOMALY_SCORE' && evt.isAnomaly) {
        // Biological anomalies are the only substrate currently wired into
        // nn-service, so map 'biological' → BiologicalState. If more substrate
        // VAEs come online, extend this lookup.
        const nodeType = evt.substrate === 'biological' ? 'BiologicalState' : null;
        if (!nodeType) return;

        const cluster = clusters.find(
          (c) => c.nodeType === nodeType && c.entityId === evt.entityId,
        );
        if (!cluster) return;

        // Flash long enough to register, short enough to clear before the
        // next propagation round on a steady stream. Duration is owned by
        // the renderer (it's also the decay divisor).
        anomalyFlashesRef.current.set(
          cluster.nodeId,
          Date.now() + ANOMALY_FLASH_DURATION_MS,
        );
      }
    },
    [clusters, addAnimation],
  );
  useZwmStream(onStreamEvent);

  return (
    <div className="relative w-full h-full bg-zwn-bg">
      <Canvas
        style={{ height: height ?? '100%' }}
        camera={{ position: [0, 3, 12], fov: 50, near: 0.1, far: 200 }}
        gl={{
          antialias: true,
          alpha: false,
          powerPreference: 'high-performance',
          toneMapping: THREE.NoToneMapping,
        }}
        linear
        flat
        onPointerMissed={handleBackgroundClick}
      >
        <color attach="background" args={['#0a0a0a']} />

        <CameraAnimator target={focusTarget} onDone={handleFocusDone} />
        <CausalAnimManager
          animsRef={causalAnimsRef}
          setAnims={setCausalAnims}
        />

        {/* 3DGS environmental backdrop — renders before nebula nodes for correct layering */}
        {splatUrl && <SplatEnvironment url={splatUrl} />}

        <GaussianSplatRenderer
          clusters={clusters}
          causalAnimations={causalAnims}
          selectedClusterId={selected?.nodeId ?? null}
          anomalyFlashesRef={anomalyFlashesRef}
        />

        <EdgeLines edges={edges} clusters={clusters} />

        <ClusterHitMeshes
          clusters={clusters}
          onSelect={handleSelect}
          onDoubleClick={handleDoubleClick}
        />

        <SimpleOrbitControls />

        <ambientLight intensity={0.15} />

        {supportsVolumetric() && (
          <PostFX
            clusters={clusters}
            selectedClusterId={selected?.nodeId ?? null}
          />
        )}
      </Canvas>

      <NebulaHUD selected={selected} onClose={() => setSelected(null)} />

      <div className="absolute bottom-2 left-4 flex items-center gap-4 text-[9px] text-zwn-muted/50 tracking-widest">
        <span className="px-1.5 py-0.5 rounded bg-zwn-amber/10 text-zwn-amber/70 border border-zwn-amber/15">
          SEEDED DEMO
        </span>
        <span>causal flow · auto</span>
      </div>
    </div>
  );
}
