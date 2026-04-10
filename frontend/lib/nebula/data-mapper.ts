import { ClusterDescriptor } from './types';
import { generateSphereCluster, hexToRgb, riskTint } from './gaussian-math';
import { computeLayout } from './layout';
import { MOCK_GRAPH_DATA, MOCK_ENTITIES } from '@/lib/mock';
import { SUBSTRATE_COLORS } from '@/lib/constants';

interface GraphNode {
  id: string;
  type: string;
  label: string;
  color: string;
  val: number;
}

interface GraphLink {
  source: string;
  target: string;
  type: string;
}

interface ClusterConfig {
  count: number;
  scale: number;
  spread: number;
  opacity: number;
  pulseRate: number;
}

function getClusterConfig(
  nodeType: string,
  metrics?: Record<string, unknown>,
): ClusterConfig {
  switch (nodeType) {
    case 'WorldActor':
      return { count: 26, scale: 0.35, spread: 0.8, opacity: 0.8, pulseRate: 0.5 };

    case 'ComplianceState': {
      const score = Number(metrics?.score ?? 50) / 100;
      const isViolation = metrics?.status === 'VIOLATION';
      return {
        count: 16,
        scale: 0.22 + score * 0.15,
        spread: 0.6,
        opacity: 0.3 + score * 0.5,
        pulseRate: isViolation ? 2 : 0.3,
      };
    }
    case 'ProcurementState': {
      const fitiq = Number(metrics?.fitiq ?? 50) / 100;
      return {
        count: 16,
        scale: 0.2 + fitiq * 0.15,
        spread: 0.6,
        opacity: 0.4 + fitiq * 0.4,
        pulseRate: 0.4,
      };
    }
    case 'BiologicalState': {
      const anomaly = metrics?.anomaly_flag === true;
      return {
        count: 12,
        scale: anomaly ? 0.4 : 0.25,
        spread: 0.55,
        opacity: anomaly ? 0.5 : 0.7,
        pulseRate: anomaly ? 1.5 : 0.3,
      };
    }
    case 'HistoricalRecon': {
      const conf = Number(metrics?.confidence ?? 0.5);
      return {
        count: 12,
        scale: 0.2 + conf * 0.15,
        spread: 0.5,
        opacity: 0.3 + conf * 0.5,
        pulseRate: 0.2,
      };
    }
    case 'MigrationState': {
      const pres = Number(metrics?.semantic_preservation ?? 0.5);
      return {
        count: 12,
        scale: 0.2 + pres * 0.15,
        spread: 0.5,
        opacity: 0.4 + pres * 0.4,
        pulseRate: 0.3,
      };
    }
    case 'ComputeState': {
      const avail = Number(metrics?.availability ?? 0.5);
      return {
        count: 12,
        scale: 0.2 + avail * 0.15,
        spread: 0.5,
        opacity: 0.4 + avail * 0.4,
        pulseRate: avail < 0.9 ? 1 : 0.2,
      };
    }
    case 'SubstrateEvent':
      return { count: 5, scale: 0.15, spread: 0.3, opacity: 0.85, pulseRate: 0 };

    default:
      return { count: 8, scale: 0.2, spread: 0.5, opacity: 0.6, pulseRate: 0.3 };
  }
}

function findEntityMetrics(nodeId: string, nodeType: string): Record<string, unknown> | undefined {
  for (const entity of MOCK_ENTITIES) {
    switch (nodeType) {
      case 'ComplianceState':
        if (entity.compliance?.id === nodeId) return entity.compliance as unknown as Record<string, unknown>;
        break;
      case 'ProcurementState':
        if (entity.procurement?.id === nodeId) return entity.procurement as unknown as Record<string, unknown>;
        break;
      case 'BiologicalState':
        if (entity.biological?.id === nodeId) return entity.biological as unknown as Record<string, unknown>;
        break;
      case 'HistoricalRecon':
        if (entity.historical?.id === nodeId) return entity.historical as unknown as Record<string, unknown>;
        break;
      case 'MigrationState':
        if (entity.migration?.project_id === nodeId || entity.migration?.id === nodeId)
          return entity.migration as unknown as Record<string, unknown>;
        break;
      case 'ComputeState':
        if (entity.compute?.id === nodeId) return entity.compute as unknown as Record<string, unknown>;
        break;
    }
  }
  return undefined;
}

function findEntityId(nodeId: string, links: GraphLink[]): string | undefined {
  const parentLink = links.find(
    (l) => l.target === nodeId && l.type === 'HAS_STATE',
  );
  return parentLink?.source;
}

function findRiskForEntity(entityId: string): string {
  const entity = MOCK_ENTITIES.find((e) => e.actor.id === entityId);
  return entity?.risk?.riskLevel ?? 'LOW';
}

/** Convert mock graph data into ClusterDescriptors for the Gaussian renderer. */
export function buildClusters(): ClusterDescriptor[] {
  const nodes = MOCK_GRAPH_DATA.nodes as GraphNode[];
  const links = MOCK_GRAPH_DATA.links as GraphLink[];

  // Build risk map for layout
  const riskMap: Record<string, string> = {};
  for (const entity of MOCK_ENTITIES) {
    riskMap[entity.actor.id] = entity.risk?.riskLevel ?? 'LOW';
  }

  const positions = computeLayout(
    nodes.map((n) => ({ id: n.id, type: n.type })),
    links,
    riskMap,
  );

  return nodes.map((node) => {
    const metrics = findEntityMetrics(node.id, node.type);
    const entityId =
      node.type === 'WorldActor'
        ? node.id
        : findEntityId(node.id, links);
    const risk = entityId ? findRiskForEntity(entityId) : 'LOW';
    const config = getClusterConfig(node.type, metrics);

    const baseColor = hexToRgb(SUBSTRATE_COLORS[node.type] ?? '#888780');
    const tintedColor = riskTint(baseColor, risk);

    const center = positions.get(node.id) ?? [0, 0, 0];

    return {
      nodeId: node.id,
      nodeType: node.type,
      label: node.label,
      center: center as [number, number, number],
      gaussians: generateSphereCluster(
        center as [number, number, number],
        config.count,
        tintedColor,
        config.opacity,
        config.scale,
        config.spread,
      ),
      pulseRate: config.pulseRate,
      riskLevel: risk,
      entityId,
      metrics,
    };
  });
}

/** Get edge data for rendering connections between clusters. */
export function getEdges(): { source: string; target: string; type: string }[] {
  return (MOCK_GRAPH_DATA.links as GraphLink[]).map((l) => ({
    source: l.source,
    target: l.target,
    type: l.type,
  }));
}
