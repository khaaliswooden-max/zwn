/**
 * In-memory Neo4j driver mock for green-path e2e testing.
 *
 * Implements just enough of the neo4j-driver API surface to run
 * compliance-writer, procurement-writer, and the validation MATCH query
 * without a real Neo4j instance.
 *
 * Node identity: each node is keyed by its `id` property (a UUID or entityId).
 * Relationships are stored as a flat array with startId / endId references.
 */

interface MockNode {
  internalId: string;
  labels: string[];
  properties: Record<string, unknown>;
}

interface MockRel {
  type: string;
  startId: string;
  endId: string;
  properties: Record<string, unknown>;
}

class MockGraph {
  readonly nodes: Map<string, MockNode> = new Map();   // internalId → node
  private byLabelId: Map<string, MockNode> = new Map(); // "Label:id" → node
  readonly rels: MockRel[] = [];

  mergeNode(
    label: string,
    idValue: string,
    createProps: Record<string, unknown>,
    setProps: Record<string, unknown> = {}
  ): MockNode {
    const key = `${label}:${idValue}`;
    let node = this.byLabelId.get(key);
    if (!node) {
      node = { internalId: idValue, labels: [label], properties: { id: idValue, ...createProps } };
      this.nodes.set(idValue, node);
      this.byLabelId.set(key, node);
    }
    Object.assign(node.properties, setProps);
    return node;
  }

  createNode(label: string, props: Record<string, unknown>): MockNode {
    const idValue = props['id'] as string;
    const node: MockNode = { internalId: idValue, labels: [label], properties: props };
    this.nodes.set(idValue, node);
    this.byLabelId.set(`${label}:${idValue}`, node);
    return node;
  }

  createRel(type: string, startId: string, endId: string, props: Record<string, unknown> = {}): void {
    this.rels.push({ type, startId, endId, properties: props });
  }

  findRelsFrom(startId: string, type: string): MockRel[] {
    return this.rels.filter(r => r.startId === startId && r.type === type);
  }

  findRelsTo(endId: string, type: string): MockRel[] {
    return this.rels.filter(r => r.endId === endId && r.type === type);
  }
}

// ── Cypher query router ────────────────────────────────────────────────────────

function routeQuery(
  graph: MockGraph,
  query: string,
  params: Record<string, unknown>
): { records: Array<{ get(key: string): unknown }> } {
  const q = query.trim();

  // DDL (constraints / indexes) — no-op
  if (q.startsWith('CREATE CONSTRAINT') || q.startsWith('CREATE INDEX')) {
    return { records: [] };
  }

  // MERGE WorldActor
  if (q.startsWith('MERGE (a:WorldActor')) {
    const entityId = params['entityId'] as string;
    const now = params['now'] as number;
    graph.mergeNode('WorldActor', entityId, { created_at: now }, { last_seen: now });
    return { records: [] };
  }

  // CREATE ComplianceState
  if (q.startsWith('CREATE (s:ComplianceState')) {
    graph.createNode('ComplianceState', {
      id: params['stateId'],
      entity_id: params['entityId'],
      status: params['status'],
      score: params['score'],
      domain: params['domain'],
      evidence_hash: params['evidenceHash'],
      timestamp: params['timestamp'],
      solana_slot: params['solanaSlot'],
      tx_signature: params['txSignature'],
    });
    return { records: [] };
  }

  // CREATE ProcurementState
  if (q.startsWith('CREATE (s:ProcurementState')) {
    graph.createNode('ProcurementState', {
      id: params['stateId'],
      entity_id: params['entityId'],
      fitiq: params['fitiq'],
      upd: params['upd'],
      opportunity_count: params['opportunityCount'],
      timestamp: params['timestamp'],
      solana_slot: params['solanaSlot'],
      tx_signature: params['txSignature'],
    });
    return { records: [] };
  }

  // CREATE SubstrateEvent (type and source are embedded string literals)
  if (q.startsWith('CREATE (e:SubstrateEvent')) {
    const typeMatch = q.match(/type:\s*'([^']+)'/);
    const sourceMatch = q.match(/source:\s*'([^']+)'/);
    graph.createNode('SubstrateEvent', {
      id: params['eventId'],
      type: typeMatch?.[1] ?? 'UNKNOWN',
      source: sourceMatch?.[1] ?? 'unknown',
      entity_id: params['entityId'],
      payload_hash: params['payloadHash'],
      solana_slot: params['solanaSlot'],
      timestamp: params['timestamp'],
    });
    return { records: [] };
  }

  // SUPERSEDES — no-op (no prior state exists in green-path run)
  if (q.includes('SUPERSEDES')) {
    return { records: [] };
  }

  // CREATE HAS_STATE (World Actor → state node)
  if (q.includes('CREATE (a)-[:HAS_STATE')) {
    const sourceMatch = q.match(/source:\s*'([^']+)'/);
    graph.createRel('HAS_STATE', params['entityId'] as string, params['stateId'] as string, {
      since: params['timestamp'],
      source: sourceMatch?.[1] ?? 'unknown',
    });
    return { records: [] };
  }

  // CREATE EMITTED (state → SubstrateEvent)
  if (q.includes('CREATE (s)-[:EMITTED]->(e)')) {
    graph.createRel('EMITTED', params['stateId'] as string, params['eventId'] as string);
    return { records: [] };
  }

  // CREATE CAUSED_BY (ProcurementState → trigger SubstrateEvent)
  if (q.includes('CREATE (s)-[:CAUSED_BY')) {
    graph.createRel('CAUSED_BY', params['stateId'] as string, params['causedByEventId'] as string, {
      lag_ms: params['lagMs'],
      rule_id: 'COMPLIANCE_STATE_CHANGE->RECALCULATE_FIT_IQ',
    });
    return { records: [] };
  }

  // VALIDATION QUERY: the Step-7 causal-chain read
  if (q.includes('RETURN a, cs, se, ps')) {
    return buildValidationResult(graph, params['entityId'] as string, params['eventId'] as string);
  }

  // Catch-all (MATCH queries that find nothing relevant, etc.)
  return { records: [] };
}

function wrapNode(node: MockNode): { properties: Record<string, unknown>; labels: string[] } {
  return { properties: node.properties, labels: node.labels };
}

function buildValidationResult(
  graph: MockGraph,
  entityId: string,
  substrateEventId: string
): { records: Array<{ get(key: string): unknown }> } {
  // WorldActor
  const actor = graph.nodes.get(entityId);
  if (!actor) return { records: [] };

  // ComplianceState via HAS_STATE
  const hasStateRels = graph.findRelsFrom(entityId, 'HAS_STATE');
  const csNode = hasStateRels
    .map(r => graph.nodes.get(r.endId))
    .find(n => n?.labels.includes('ComplianceState'));
  if (!csNode) return { records: [] };

  // SubstrateEvent via EMITTED with matching id
  const emittedRels = graph.findRelsFrom(csNode.internalId, 'EMITTED');
  const seNode = emittedRels
    .map(r => graph.nodes.get(r.endId))
    .find(n => n?.properties['id'] === substrateEventId && n?.labels.includes('SubstrateEvent'));
  if (!seNode) return { records: [] };

  // OPTIONAL: ProcurementState via CAUSED_BY
  const causedByRels = graph.findRelsTo(seNode.internalId, 'CAUSED_BY');
  const psNode = causedByRels
    .map(r => graph.nodes.get(r.startId))
    .find(n => n?.labels.includes('ProcurementState')) ?? null;

  const record = {
    get(key: string): unknown {
      switch (key) {
        case 'a':  return wrapNode(actor);
        case 'cs': return wrapNode(csNode);
        case 'se': return wrapNode(seNode);
        case 'ps': return psNode ? wrapNode(psNode) : null;
        default:   return null;
      }
    },
  };
  return { records: [record] };
}

// ── Mock session / transaction ─────────────────────────────────────────────────

class MockTransaction {
  constructor(private readonly graph: MockGraph) {}

  async run(query: string, params?: Record<string, unknown>): Promise<unknown> {
    return routeQuery(this.graph, query, params ?? {});
  }
}

class MockSession {
  constructor(private readonly graph: MockGraph) {}

  async executeWrite<T>(callback: (tx: MockTransaction) => Promise<T>): Promise<T> {
    return callback(new MockTransaction(this.graph));
  }

  async run(
    query: string,
    params?: Record<string, unknown>
  ): Promise<{ records: Array<{ get(key: string): unknown }> }> {
    return routeQuery(this.graph, query, params ?? {});
  }

  async close(): Promise<void> {}
}

// ── Public API ─────────────────────────────────────────────────────────────────

export class MockNeo4jDriver {
  private readonly graph = new MockGraph();

  session(): MockSession {
    return new MockSession(this.graph);
  }

  async close(): Promise<void> {}
}

export function createMockDriver(): MockNeo4jDriver {
  return new MockNeo4jDriver();
}
