import { ApolloServer } from '@apollo/server';
import { startStandaloneServer } from '@apollo/server/standalone';
import { Driver } from 'neo4j-driver';

const typeDefs = `#graphql
  type WorldActor {
    id: String!
    created_at: Float
    last_seen: Float
    states: [StateNode]
  }

  union StateNode = ComplianceState | ProcurementState | BiologicalState | HistoricalRecon | MigrationState | ComputeState

  type ComplianceState {
    id: String!
    entity_id: String!
    status: String!
    score: Int
    domain: String
    timestamp: Float
    solana_slot: Int
    tx_signature: String
  }

  type ProcurementState {
    id: String!
    entity_id: String!
    fitiq: Int
    upd: Int
    timestamp: Float
    solana_slot: Int
    tx_signature: String
  }

  type BiologicalState {
    id: String!
    entity_id: String!
    serotonin: Float
    dopamine: Float
    cortisol: Float
    gaba: Float
    anomaly_flag: Boolean
    timestamp: Float
  }

  type HistoricalRecon {
    id: String!
    entity_id: String!
    domain: String
    confidence: Float
    temporal_depth_years: Int
    timestamp: Float
  }

  type MigrationState {
    id: String!
    project_id: String!
    semantic_preservation: Float
    test_coverage: Float
    timestamp: Float
  }

  type ComputeState {
    id: String!
    entity_id: String!
    xdop_score: Int
    wcbi: Int
    ddil_hours: Float
    tops: Int
    availability: Float
    timestamp: Float
  }

  type SubstrateEvent {
    id: String!
    type: String!
    source: String!
    entity_id: String
    solana_slot: Int
    timestamp: Float
  }

  type CausalLink {
    event: SubstrateEvent
    effect: String
    lag_ms: Float
  }

  type CompositeRisk {
    entityId: String!
    complianceStatus: String
    complianceScore: Int
    fitiq: Int
    availability: Float
    anomalyFlag: Boolean
    riskLevel: String
  }

  # Full current state across all substrates — one node per substrate at most
  # (the current node, i.e. the one with no outgoing SUPERSEDES edge)
  type FullWorldState {
    actor: WorldActor
    compliance: ComplianceState
    procurement: ProcurementState
    biological: BiologicalState
    historical: HistoricalRecon
    migration: MigrationState
    compute: ComputeState
  }

  type Query {
    worldState(entityId: String!): WorldActor
    entitiesByCompliance(status: String!, domain: String): [WorldActor]
    causalChain(substrateEventId: String!): [CausalLink]
    compositeRisk(entityId: String!): CompositeRisk
    fullWorldState(entityId: String!): FullWorldState
  }
`;

function buildResolvers(driver: Driver) {
  return {
    Query: {
      async worldState(_: unknown, { entityId }: { entityId: string }) {
        const session = driver.session();
        try {
          const result = await session.run(
            `MATCH (a:WorldActor {id: $entityId})
             RETURN a`,
            { entityId }
          );
          if (result.records.length === 0) return null;
          return result.records[0].get('a').properties;
        } finally {
          await session.close();
        }
      },

      async entitiesByCompliance(
        _: unknown,
        { status, domain }: { status: string; domain?: string }
      ) {
        const session = driver.session();
        try {
          const domainFilter = domain ? 'AND cs.domain = $domain' : '';
          const result = await session.run(
            `MATCH (a:WorldActor)-[:HAS_STATE]->(cs:ComplianceState)
             WHERE cs.status = $status ${domainFilter}
             AND NOT (cs)-[:SUPERSEDES]->()
             RETURN DISTINCT a`,
            { status, domain }
          );
          return result.records.map((r) => r.get('a').properties);
        } finally {
          await session.close();
        }
      },

      async causalChain(_: unknown, { substrateEventId }: { substrateEventId: string }) {
        const session = driver.session();
        try {
          const result = await session.run(
            `MATCH (e:SubstrateEvent {id: $substrateEventId})<-[:CAUSED_BY]-(effect)
             RETURN e, effect`,
            { substrateEventId }
          );
          return result.records.map((r) => ({
            event: r.get('e').properties,
            effect: r.get('effect').properties,
            lag_ms: null,
          }));
        } finally {
          await session.close();
        }
      },

      async compositeRisk(_: unknown, { entityId }: { entityId: string }) {
        const session = driver.session();
        try {
          const result = await session.run(
            `MATCH (a:WorldActor {id: $entityId})-[:HAS_STATE]->(state)
             WHERE NOT (state)-[:SUPERSEDES]->()
             RETURN labels(state)[0] AS substrate, state`,
            { entityId }
          );

          const risk: Record<string, unknown> = { entityId };
          let riskScore = 0;

          for (const record of result.records) {
            const substrate = record.get('substrate') as string;
            const props = record.get('state').properties as Record<string, unknown>;

            if (substrate === 'ComplianceState') {
              risk['complianceStatus'] = props['status'];
              risk['complianceScore'] = props['score'];
              if (props['status'] === 'VIOLATION') riskScore += 3;
              else if (props['status'] === 'FLAGGED') riskScore += 1;
            } else if (substrate === 'ProcurementState') {
              risk['fitiq'] = props['fitiq'];
              if (Number(props['fitiq']) < 50) riskScore += 2;
            } else if (substrate === 'ComputeState') {
              risk['availability'] = props['availability'];
              if (Number(props['availability']) < 0.9) riskScore += 2;
            } else if (substrate === 'BiologicalState') {
              risk['anomalyFlag'] = props['anomaly_flag'];
              if (props['anomaly_flag']) riskScore += 2;
            }
          }

          risk['riskLevel'] = riskScore >= 5 ? 'CRITICAL' : riskScore >= 3 ? 'HIGH' : riskScore >= 1 ? 'MEDIUM' : 'LOW';
          return risk;
        } finally {
          await session.close();
        }
      },

      async fullWorldState(_: unknown, { entityId }: { entityId: string }) {
        const session = driver.session();
        try {
          // Fetch the actor node
          const actorResult = await session.run(
            `MATCH (a:WorldActor {id: $entityId}) RETURN a`,
            { entityId }
          );
          if (actorResult.records.length === 0) return null;
          const actor = actorResult.records[0].get('a').properties as Record<string, unknown>;

          // Fetch all current state nodes (no outgoing SUPERSEDES edge = current)
          const stateResult = await session.run(
            `MATCH (a:WorldActor {id: $entityId})-[:HAS_STATE]->(state)
             WHERE NOT (state)-[:SUPERSEDES]->()
             RETURN labels(state)[0] AS substrate, state`,
            { entityId }
          );

          const result: Record<string, unknown> = { actor };
          for (const record of stateResult.records) {
            const substrate = record.get('substrate') as string;
            const props = record.get('state').properties as Record<string, unknown>;
            switch (substrate) {
              case 'ComplianceState':  result['compliance']  = props; break;
              case 'ProcurementState': result['procurement'] = props; break;
              case 'BiologicalState':  result['biological']  = props; break;
              case 'HistoricalRecon':  result['historical']  = props; break;
              case 'MigrationState':   result['migration']   = props; break;
              case 'ComputeState':     result['compute']     = props; break;
            }
          }
          return result;
        } finally {
          await session.close();
        }
      },
    },
  };
}

export async function startGraphQL(driver: Driver): Promise<void> {
  const server = new ApolloServer({ typeDefs, resolvers: buildResolvers(driver) });
  const port = parseInt(process.env['GRAPHQL_PORT'] ?? '4000', 10);
  const { url } = await startStandaloneServer(server, { listen: { port } });
  console.log(`[graphql] ZWM GraphQL server running at ${url}`);
}
