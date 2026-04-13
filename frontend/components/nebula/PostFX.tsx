'use client';

import { useMemo } from 'react';
import { useThree } from '@react-three/fiber';
import {
  EffectComposer,
  Bloom,
  DepthOfField,
  ToneMapping,
  ChromaticAberration,
  Vignette,
} from '@react-three/postprocessing';
import { ToneMappingMode } from 'postprocessing';
import * as THREE from 'three';
import { ClusterDescriptor } from '@/lib/nebula/types';

interface Props {
  clusters: ClusterDescriptor[];
  selectedClusterId?: string | null;
}

export default function PostFX({ clusters, selectedClusterId }: Props) {
  const { camera } = useThree();

  const focusDistance = useMemo(() => {
    if (!selectedClusterId) return 0.05;
    const cluster = clusters.find((c) => c.nodeId === selectedClusterId);
    if (!cluster) return 0.05;
    const clusterPos = new THREE.Vector3(...cluster.center);
    const dist = camera.position.distanceTo(clusterPos);
    // Normalize to 0-1 range (near/far)
    return Math.min(dist / 50, 1.0);
  }, [selectedClusterId, clusters, camera]);

  return (
    <EffectComposer multisampling={0}>
      <Bloom
        luminanceThreshold={0.4}
        luminanceSmoothing={0.3}
        intensity={1.5}
        radius={0.8}
        mipmapBlur
      />
      <DepthOfField
        focusDistance={focusDistance}
        focalLength={0.05}
        bokehScale={selectedClusterId ? 3 : 0}
      />
      <ChromaticAberration
        offset={new THREE.Vector2(0.002, 0.002)}
        radialModulation
        modulationOffset={0.5}
      />
      <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
      <Vignette darkness={0.5} offset={0.3} />
    </EffectComposer>
  );
}
