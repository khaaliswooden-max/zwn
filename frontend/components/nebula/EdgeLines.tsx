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
  const { hasStateGeo, causalGeo } = useMemo(() => {
    const centerMap = new Map<string, [number, number, number]>();
    for (const c of clusters) {
      centerMap.set(c.nodeId, c.center);
    }

    const hasStatePoints: number[] = [];
    const causalPoints: number[] = [];

    for (const edge of edges) {
      const src = centerMap.get(edge.source);
      const tgt = centerMap.get(edge.target);
      if (!src || !tgt) continue;

      const arr = edge.type === 'CAUSED_BY' || edge.type === 'EMITTED'
        ? causalPoints
        : hasStatePoints;

      arr.push(src[0], src[1], src[2], tgt[0], tgt[1], tgt[2]);
    }

    const hsGeo = new THREE.BufferGeometry();
    if (hasStatePoints.length > 0) {
      hsGeo.setAttribute(
        'position',
        new THREE.Float32BufferAttribute(hasStatePoints, 3),
      );
    }

    const cGeo = new THREE.BufferGeometry();
    if (causalPoints.length > 0) {
      cGeo.setAttribute(
        'position',
        new THREE.Float32BufferAttribute(causalPoints, 3),
      );
    }

    return { hasStateGeo: hsGeo, causalGeo: cGeo };
  }, [edges, clusters]);

  return (
    <group>
      {hasStateGeo.attributes.position && (
        <lineSegments geometry={hasStateGeo}>
          <lineBasicMaterial color="#ffffff" transparent opacity={0.12} />
        </lineSegments>
      )}
      {causalGeo.attributes.position && (
        <lineSegments geometry={causalGeo}>
          <lineBasicMaterial color="#D85A30" transparent opacity={0.5} />
        </lineSegments>
      )}
    </group>
  );
}
