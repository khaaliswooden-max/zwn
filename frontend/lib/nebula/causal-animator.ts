import { CausalAnimation, AnimPhase, GaussianParams } from './types';

const PHASE_DURATIONS: Record<AnimPhase, number> = {
  idle: Infinity,
  emit: 500,
  transit: 1500,
  absorb: 500,
  settle: 1000,
};

const PHASE_ORDER: AnimPhase[] = ['emit', 'transit', 'absorb', 'settle', 'idle'];

/** Cubic Bezier interpolation. */
function cubicBezier(
  t: number,
  p0: [number, number, number],
  p1: [number, number, number],
  p2: [number, number, number],
  p3: [number, number, number],
): [number, number, number] {
  const u = 1 - t;
  return [
    u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0],
    u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1],
    u * u * u * p0[2] + 3 * u * u * t * p1[2] + 3 * u * t * t * p2[2] + t * t * t * p3[2],
  ];
}

function lerp3(
  a: [number, number, number],
  b: [number, number, number],
  t: number,
): [number, number, number] {
  return [
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
    a[2] + (b[2] - a[2]) * t,
  ];
}

/** Create a new causal animation between two cluster centers. */
export function createCausalAnimation(
  id: string,
  sourceCenter: [number, number, number],
  targetCenter: [number, number, number],
  sourceColor: [number, number, number],
): CausalAnimation {
  const mid = lerp3(sourceCenter, targetCenter, 0.5);
  const liftY = 1.5;

  const transitGaussians: GaussianParams[] = [];
  for (let i = 0; i < 5; i++) {
    transitGaussians.push({
      position: [...sourceCenter] as [number, number, number],
      scale: [0.15, 0.15, 0.15],
      color: [...sourceColor] as [number, number, number],
      opacity: 0.9,
      intensity: 1.5,
    });
  }

  return {
    id,
    phase: 'emit',
    progress: 0,
    sourceClusterId: '',
    targetClusterId: '',
    transitGaussians,
    bezierPath: [
      sourceCenter,
      [mid[0], mid[1] + liftY, mid[2]],
      [mid[0], mid[1] + liftY * 0.8, mid[2]],
      targetCenter,
    ],
    startTime: performance.now(),
  };
}

/** Advance a causal animation by delta time (ms). Returns updated animation or null if complete. */
export function advanceCausalAnimation(
  anim: CausalAnimation,
  deltaMs: number,
): CausalAnimation | null {
  const phaseIdx = PHASE_ORDER.indexOf(anim.phase);
  if (phaseIdx < 0 || anim.phase === 'idle') return null;

  const duration = PHASE_DURATIONS[anim.phase];
  const newProgress = anim.progress + deltaMs / duration;

  if (newProgress >= 1) {
    const nextPhaseIdx = phaseIdx + 1;
    if (nextPhaseIdx >= PHASE_ORDER.length || PHASE_ORDER[nextPhaseIdx] === 'idle') {
      return null;
    }
    return { ...anim, phase: PHASE_ORDER[nextPhaseIdx], progress: 0 };
  }

  // Update transit Gaussian positions during transit phase
  if (anim.phase === 'transit') {
    const updated = anim.transitGaussians.map((g, i) => {
      const tOffset = (i / anim.transitGaussians.length) * 0.15;
      const t = Math.max(0, Math.min(1, newProgress - tOffset));
      const pos = cubicBezier(t, ...anim.bezierPath);
      return {
        ...g,
        position: pos,
        opacity: 0.6 + 0.4 * Math.sin(newProgress * Math.PI),
        scale: [
          0.15 + 0.08 * Math.sin(newProgress * Math.PI * 3 + i),
          0.15 + 0.08 * Math.sin(newProgress * Math.PI * 3 + i),
          0.15 + 0.08 * Math.sin(newProgress * Math.PI * 3 + i),
        ] as [number, number, number],
      };
    });
    return { ...anim, progress: newProgress, transitGaussians: updated };
  }

  return { ...anim, progress: newProgress };
}

/** Get the emit flash intensity for the source cluster (0-1). */
export function getEmitFlash(anim: CausalAnimation): number {
  if (anim.phase === 'emit') return 1 - anim.progress;
  return 0;
}

/** Get the absorb flash intensity for the target cluster (0-1). */
export function getAbsorbFlash(anim: CausalAnimation): number {
  if (anim.phase === 'absorb') return 1 - anim.progress;
  return 0;
}
