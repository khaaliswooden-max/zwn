'use client';

import { useMemo } from 'react';
import * as THREE from 'three';
import { ClusterDescriptor } from '@/lib/nebula/types';

interface EdgeDef {
  source: string;
  target: string;
  type: string;
}

interface Props {
  edges: EdgeDef[];
  clusters: ClusterDescriptor[];
}

export default function EdgeLines({ edges, clusters }: Props) {
  const centerMap = useMemo(() => {
    const map = new Map<string, [number, number, number]>();
    for (const c of clusters) {
      map.set(c.nodeId, c.center);
    }
    return map;
  }, [clusters]);

  const lineSegments = useMemo(() => {
    const hasState: { points: Float32Array }[] = [];
    const causal: { points: Float32Array }[] = [];

    for (const edge of edges) {
      const src = centerMap.get(edge.source);
      const tgt = centerMap.get(edge.target);
      if (!src || !tgt) continue;

      const pts = new Float32Array([
        src[0], src[1], src[2],
        tgt[0], tgt[1], tgt[2],
      ]);

      if (edge.type === 'CAUSED_BY' || edge.type === 'EMITTED') {
        causal.push({ points: pts });
      } else {
        hasState.push({ points: pts });
      }
    }

    return { hasState, causal };
  }, [edges, centerMap]);

  return (
    <group>
      {/* HAS_STATE edges: white, subtle */}
      {lineSegments.hasState.map((seg, i) => {
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(seg.points, 3));
        return (
          <lineSegments key={`hs-${i}`} geometry={geo}>
            <lineBasicMaterial
              color="#ffffff"
              transparent
              opacity={0.12}
              linewidth={1}
            />
          </lineSegments>
        );
      })}
      {/* Causal edges: coral, prominent */}
      {lineSegments.causal.map((seg, i) => {
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(seg.points, 3));
        return (
          <lineSegments key={`ca-${i}`} geometry={geo}>
            <lineBasicMaterial
              color="#D85A30"
              transparent
              opacity={0.5}
              linewidth={1}
            />
          </lineSegments>
        );
      })}
    </group>
  );
}
