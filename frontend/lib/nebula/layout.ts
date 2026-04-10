interface LayoutNode {
  id: string;
  type: string;
  parentId?: string;
}

interface LayoutLink {
  source: string;
  target: string;
  type: string;
}

const PLATFORM_ANGLES: Record<string, number> = {
  civium: 0,
  aureon: 40,
  qal: 80,
  symbion: 120,
  relian: 160,
  podx: 200,
  veyra: 240,
  zusdc: 280,
  zuup_hq: 320,
};

const SUBSTRATE_PLATFORM: Record<string, string> = {
  ComplianceState: 'civium',
  ProcurementState: 'aureon',
  BiologicalState: 'symbion',
  HistoricalRecon: 'qal',
  MigrationState: 'relian',
  ComputeState: 'podx',
};

const RISK_ALTITUDE: Record<string, number> = {
  LOW: 2,
  MEDIUM: 0.5,
  HIGH: -1,
  CRITICAL: -2.5,
};

function degToRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

/** Compute 3D positions for all graph nodes using semantic spatial mapping. */
export function computeLayout(
  nodes: LayoutNode[],
  links: LayoutLink[],
  riskMap: Record<string, string>,
): Map<string, [number, number, number]> {
  const positions = new Map<string, [number, number, number]>();
  const parentRadius = 3;
  const childRadius = 5.5;

  // Build parent lookup from HAS_STATE edges
  const childToParent = new Map<string, string>();
  for (const link of links) {
    if (link.type === 'HAS_STATE') {
      childToParent.set(link.target, link.source);
    }
  }

  // Place WorldActor nodes in a ring
  const actors = nodes.filter((n) => n.type === 'WorldActor');
  const actorAngleStep = (2 * Math.PI) / Math.max(actors.length, 1);
  actors.forEach((actor, i) => {
    const angle = actorAngleStep * i;
    const risk = riskMap[actor.id] ?? 'LOW';
    const y = RISK_ALTITUDE[risk] ?? 0;
    positions.set(actor.id, [
      parentRadius * Math.cos(angle),
      y,
      parentRadius * Math.sin(angle),
    ]);
  });

  // Place state nodes orbiting their parent toward their platform angle
  const stateNodes = nodes.filter((n) => n.type !== 'WorldActor' && n.type !== 'SubstrateEvent');
  for (const node of stateNodes) {
    const parentId = childToParent.get(node.id);
    const parentPos = parentId ? positions.get(parentId) : undefined;
    const base: [number, number, number] = parentPos ?? [0, 0, 0];

    const platform = SUBSTRATE_PLATFORM[node.type];
    const angleDeg = platform ? (PLATFORM_ANGLES[platform] ?? 0) : Math.random() * 360;
    const angle = degToRad(angleDeg);
    const offset = 1.8 + Math.random() * 0.5;

    positions.set(node.id, [
      base[0] + offset * Math.cos(angle),
      base[1] + (Math.random() - 0.5) * 0.6,
      base[2] + offset * Math.sin(angle),
    ]);
  }

  // Place SubstrateEvent nodes along CAUSED_BY / EMITTED edges
  const events = nodes.filter((n) => n.type === 'SubstrateEvent');
  for (const evt of events) {
    const connectedLinks = links.filter(
      (l) => l.source === evt.id || l.target === evt.id,
    );
    let avgX = 0, avgY = 0, avgZ = 0, count = 0;
    for (const link of connectedLinks) {
      const otherId = link.source === evt.id ? link.target : link.source;
      const otherPos = positions.get(otherId);
      if (otherPos) {
        avgX += otherPos[0];
        avgY += otherPos[1];
        avgZ += otherPos[2];
        count++;
      }
    }
    if (count > 0) {
      positions.set(evt.id, [
        avgX / count + (Math.random() - 0.5) * 0.4,
        avgY / count + 0.3,
        avgZ / count + (Math.random() - 0.5) * 0.4,
      ]);
    } else {
      positions.set(evt.id, [
        (Math.random() - 0.5) * childRadius,
        0,
        (Math.random() - 0.5) * childRadius,
      ]);
    }
  }

  // Spring relaxation pass to resolve overlaps
  const posArr = Array.from(positions.entries());
  for (let iter = 0; iter < 30; iter++) {
    for (let i = 0; i < posArr.length; i++) {
      for (let j = i + 1; j < posArr.length; j++) {
        const [, pi] = posArr[i];
        const [, pj] = posArr[j];
        const dx = pi[0] - pj[0];
        const dy = pi[1] - pj[1];
        const dz = pi[2] - pj[2];
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
        const minDist = 1.6;
        if (dist < minDist && dist > 0.001) {
          const force = (minDist - dist) * 0.15 / dist;
          pi[0] += dx * force;
          pi[1] += dy * force;
          pi[2] += dz * force;
          pj[0] -= dx * force;
          pj[1] -= dy * force;
          pj[2] -= dz * force;
        }
      }
    }
  }

  return positions;
}
