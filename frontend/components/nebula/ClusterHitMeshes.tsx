'use client';

import { useCallback } from 'react';
import { ThreeEvent } from '@react-three/fiber';
import { ClusterDescriptor, SelectedCluster } from '@/lib/nebula/types';

interface Props {
  clusters: ClusterDescriptor[];
  onSelect: (cluster: SelectedCluster | null) => void;
  onDoubleClick: (center: [number, number, number]) => void;
}

export default function ClusterHitMeshes({ clusters, onSelect, onDoubleClick }: Props) {
  const handleClick = useCallback(
    (e: ThreeEvent<MouseEvent>, cluster: ClusterDescriptor) => {
      e.stopPropagation();
      onSelect({
        nodeId: cluster.nodeId,
        nodeType: cluster.nodeType,
        label: cluster.label,
        entityId: cluster.entityId,
        metrics: cluster.metrics,
      });
    },
    [onSelect],
  );

  const handleDoubleClick = useCallback(
    (e: ThreeEvent<MouseEvent>, cluster: ClusterDescriptor) => {
      e.stopPropagation();
      onDoubleClick(cluster.center);
    },
    [onDoubleClick],
  );

  return (
    <group>
      {clusters.map((cluster) => (
        <mesh
          key={cluster.nodeId}
          position={cluster.center}
          onClick={(e) => handleClick(e, cluster)}
          onDoubleClick={(e) => handleDoubleClick(e, cluster)}
        >
          <sphereGeometry args={[0.9, 8, 8]} />
          <meshBasicMaterial visible={false} />
        </mesh>
      ))}
    </group>
  );
}
