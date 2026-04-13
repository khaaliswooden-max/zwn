import { useEffect, useRef, useCallback } from 'react';
import {
  AUTOPLAY_SCRIPT,
  CYCLE_PAUSE_MS,
  INITIAL_DELAY_MS,
  IDLE_RESUME_MS,
} from './autoplay-script';
import { createCausalAnimation } from './causal-animator';
import { hexToRgb } from './gaussian-math';
import { SUBSTRATE_COLORS } from '@/lib/constants';
import type { ClusterDescriptor, CausalAnimation } from './types';

type AutoplayState = 'waiting' | 'playing' | 'paused';

export function useAutoplay(
  clusters: ClusterDescriptor[],
  addAnimation: (anim: CausalAnimation) => void,
) {
  const state = useRef<AutoplayState>('waiting');
  const stepIndex = useRef(0);
  const timerId = useRef<ReturnType<typeof setTimeout> | null>(null);
  const idleTimerId = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clusterMap = useRef(new Map<string, ClusterDescriptor>());
  useEffect(() => {
    const map = new Map<string, ClusterDescriptor>();
    for (const c of clusters) {
      map.set(c.nodeId, c);
    }
    clusterMap.current = map;
  }, [clusters]);

  // Keep a stable ref to addAnimation so the scheduling closures don't go stale
  const addAnimRef = useRef(addAnimation);
  addAnimRef.current = addAnimation;

  const fireStep = useCallback((index: number) => {
    const step = AUTOPLAY_SCRIPT[index];
    if (!step) return;

    const source = clusterMap.current.get(step.sourceNodeId);
    const target = clusterMap.current.get(step.targetNodeId);
    if (!source || !target) return;

    const sourceColor = hexToRgb(
      SUBSTRATE_COLORS[source.nodeType] ?? '#888780',
    );
    const anim = createCausalAnimation(
      `autoplay-${step.sourceNodeId}-${Date.now()}`,
      source.center,
      target.center,
      sourceColor,
    );
    addAnimRef.current(anim);
  }, []);

  const scheduleNext = useCallback(() => {
    if (state.current === 'paused') return;

    if (stepIndex.current >= AUTOPLAY_SCRIPT.length) {
      stepIndex.current = 0;
      state.current = 'waiting';
      timerId.current = setTimeout(() => {
        if (state.current === 'paused') return;
        state.current = 'playing';
        scheduleNext();
      }, CYCLE_PAUSE_MS);
      return;
    }

    const step = AUTOPLAY_SCRIPT[stepIndex.current];
    const jitter = step.jitterMs
      ? (Math.random() - 0.5) * 2 * step.jitterMs
      : 0;
    const delay = Math.max(0, step.baseDelay + jitter);

    timerId.current = setTimeout(() => {
      if (state.current === 'paused') return;
      fireStep(stepIndex.current);
      stepIndex.current++;
      scheduleNext();
    }, delay);
  }, [fireStep]);

  const pause = useCallback(() => {
    if (state.current === 'paused') return;
    state.current = 'paused';
    if (timerId.current) {
      clearTimeout(timerId.current);
      timerId.current = null;
    }
  }, []);

  const resume = useCallback(() => {
    if (state.current !== 'paused') return;
    state.current = 'playing';
    scheduleNext();
  }, [scheduleNext]);

  const handleInteraction = useCallback(() => {
    pause();
    if (idleTimerId.current) {
      clearTimeout(idleTimerId.current);
    }
    idleTimerId.current = setTimeout(() => {
      resume();
    }, IDLE_RESUME_MS);
  }, [pause, resume]);

  // Start the first cycle after INITIAL_DELAY_MS
  useEffect(() => {
    timerId.current = setTimeout(() => {
      state.current = 'playing';
      scheduleNext();
    }, INITIAL_DELAY_MS);

    return () => {
      if (timerId.current) clearTimeout(timerId.current);
      if (idleTimerId.current) clearTimeout(idleTimerId.current);
    };
  }, [scheduleNext]);

  // Pause on user interaction, resume after idle
  useEffect(() => {
    const events = ['pointerdown', 'pointermove', 'keydown', 'wheel'] as const;
    for (const evt of events) {
      window.addEventListener(evt, handleInteraction, { passive: true });
    }
    return () => {
      for (const evt of events) {
        window.removeEventListener(evt, handleInteraction);
      }
    };
  }, [handleInteraction]);
}
