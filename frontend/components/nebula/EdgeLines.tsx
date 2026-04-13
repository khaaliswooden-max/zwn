'use client';

import { useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { ClusterDescriptor } from '@/lib/nebula/types';

// ── Causal edge glow shader ────────────────────────────────────────────────

const CAUSAL_VERT = /* glsl */ `
void main() {
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const CAUSAL_FRAG = /* glsl */ `
uniform float uTime;
uniform vec3 uColor;

void main() {
  float pulse = 0.4 + 0.2 * sin(uTime * 2.0);
  gl_FragColor = vec4(uColor * 1.5, pulse);
}
`;

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

  const causalMaterial = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: CAUSAL_VERT,
        fragmentShader: CAUSAL_FRAG,
        uniforms: {
          uTime: { value: 0 },
          uColor: { value: new THREE.Color('#D85A30') },
        },
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    [],
  );

  useFrame(({ clock }) => {
    causalMaterial.uniforms.uTime.value = clock.elapsedTime;
  });

  return (
    <group>
      {hasStateGeo.attributes.position && (
        <lineSegments geometry={hasStateGeo}>
          <lineBasicMaterial color="#ffffff" transparent opacity={0.12} />
        </lineSegments>
      )}
      {causalGeo.attributes.position && (
        <lineSegments geometry={causalGeo} material={causalMaterial} />
      )}
    </group>
  );
}
