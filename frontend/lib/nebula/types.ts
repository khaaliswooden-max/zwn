export interface GaussianParams {
  position: [number, number, number];
  scale: [number, number, number];
  color: [number, number, number];
  opacity: number;
  intensity: number;
}

export interface ClusterDescriptor {
  nodeId: string;
  nodeType: string;
  label: string;
  center: [number, number, number];
  gaussians: GaussianParams[];
  pulseRate: number;
  riskLevel: string;
  entityId?: string;
  metrics?: Record<string, unknown>;
}

export type AnimPhase = 'idle' | 'emit' | 'transit' | 'absorb' | 'settle';

export interface CausalAnimation {
  id: string;
  phase: AnimPhase;
  progress: number;
  sourceClusterId: string;
  targetClusterId: string;
  transitGaussians: GaussianParams[];
  bezierPath: [[number, number, number], [number, number, number], [number, number, number], [number, number, number]];
  startTime: number;
}

export interface SelectedCluster {
  nodeId: string;
  nodeType: string;
  label: string;
  entityId?: string;
  metrics?: Record<string, unknown>;
}
