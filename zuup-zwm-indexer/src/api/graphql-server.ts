import { ApolloServer } from '@apollo/server';
import { startStandaloneServer } from '@apollo/server/standalone';
import { Driver } from 'neo4j-driver';
import { queryCache } from './query-cache';

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
  type FullWorldState {
    actor: WorldActor
    compliance: ComplianceState
    procurement: ProcurementState
    biological: BiologicalState
    historical: HistoricalRecon
    migration: MigrationState
    compute: ComputeState
  }

  # --- Governance types ---
  type ObjectiveState {
    id: String!
    objective_type: String!
    target_metric: String!
    target_value: Float!
    time_horizon_years: Int!
    omega_floor: Float
    lyapunov_envelope: Float
    status: String!
    proposer_id: String
    dao_vote_id: String
    timestamp: Float
    solana_slot: Int
  }

  type TreatyAttestation {
    id: String!
    jurisdiction_code: String!
    jurisdiction_name: String!
    treaty_type: String!
    compliance_domain: String
    bilateral_partner: String
    effective_date: Float
    expiry_date: Float
    timestamp: Float
  }

  type JurisdictionalSummary {
    totalTreaties: Int!
    activeJurisdictions: Int!
    jurisdictionCodes: [String]
    coverageDomains: [String]
  }

  # --- Economics types ---
  type FeeRecord {
    id: String!
    settlement_id: String!
    fee_amount_usdc: Float!
    fee_basis_points: Int!
    fee_type: String!
    source_platform: String
    target_platform: String
    entity_id: String
    timestamp: Float
  }

  type ScaleMetric {
    id: String!
    platform: String!
    omega_rsf: Float!
    omega_max: Float!
    entropy_production: Float
    lyapunov_exponent: Float
    market_footprint: Float
    jurisdictional_coverage: Float
    assessment_status: String!
    timestamp: Float
  }

  # --- Cross-substrate correlation ---
  type SubstrateCoverage {
    entityId: String!
    substrates: [String!]!
    substrateCount: Int!
    lastUpdated: Float
  }

  type CacheStats {
    hits: Int!
    misses: Int!
    size: Int!
    hitRate: String!
  }

  type Query {
    worldState(entityId: String!): WorldActor
    entitiesByCompliance(status: String!, domain: String): [WorldActor]
    causalChain(substrateEventId: String!): [CausalLink]
    compositeRisk(entityId: String!): CompositeRisk
    fullWorldState(entityId: String!): FullWorldState
    # Governance queries
    activeObjectives: [ObjectiveState]
    treatyCoverage: [TreatyAttestation]
    jurisdictionalFootprint: JurisdictionalSummary
    # Economics queries
    feeHistory(entityId: String!, limit: Int): [FeeRecord]
    scaleAssessment(platform: String!): ScaleMetric
    # Cross-substrate analysis
    crossSubstrateCoverage(minSubstrates: Int!): [SubstrateCoverage]
    # Observability
    cacheStats: CacheStats
  }
`;

function buildResolvers(driver: Driver) {
  return {
    Query: {
      // ── Cached: worldState ──────────────────────────────────────────────
      async worldState(_: unknown, { entityId }: { entityId: string }) {
        const cacheKey = `worldState:${entityId}`;
        const cached = queryCache.get(cacheKey);
        if (cached !== undefined) return cached;

        const session = driver.session();
        try {
          const result = await session.run(
            `MATCH (a:WorldActor {id: $entityId})
             RETURN a`,
            { entityId }
          );
          if (result.records.length === 0) return null;
          const value = result.records[0].get('a').properties;
          queryCache.set(cacheKey, value);
          return value;
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
             AND cs.is_current = true
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

      // ── Cached: compositeRisk ───────────────────────────────────────────
      async compositeRisk(_: unknown, { entityId }: { entityId: string }) {
        const cacheKey = `compositeRisk:${entityId}`;
        const cached = queryCache.get(cacheKey);
        if (cached !== undefined) return cached;

        const session = driver.session();
        try {
          const result = await session.run(
            `MATCH (a:WorldActor {id: $entityId})-[:HAS_STATE]->(state)
             WHERE state.is_current = true
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
          queryCache.set(cacheKey, risk, 30_000); // 30s TTL for risk (changes infrequently)
          return risk;
        } finally {
          await session.close();
        }
      },

      // ── Cached: fullWorldState ──────────────────────────────────────────
      async fullWorldState(_: unknown, { entityId }: { entityId: string }) {
        const cacheKey = `fullWorldState:${entityId}`;
        const cached = queryCache.get(cacheKey);
        if (cached !== undefined) return cached;

        const session = driver.session();
        try {
          const actorResult = await session.run(
            `MATCH (a:WorldActor {id: $entityId}) RETURN a`,
            { entityId }
          );
          if (actorResult.records.length === 0) return null;
          const actor = actorResult.records[0].get('a').properties as Record<string, unknown>;

          const stateResult = await session.run(
            `MATCH (a:WorldActor {id: $entityId})-[:HAS_STATE]->(state)
             WHERE state.is_current = true
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
          queryCache.set(cacheKey, result);
          return result;
        } finally {
          await session.close();
        }
      },

      // --- Governance resolvers ---

      // ── Cached: activeObjectives ────────────────────────────────────────
      async activeObjectives() {
        const cacheKey = 'activeObjectives';
        const cached = queryCache.get(cacheKey);
        if (cached !== undefined) return cached;

        const session = driver.session();
        try {
          const result = await session.run(
            `MATCH (o:ObjectiveState)
             WHERE o.status IN ['ACTIVE', 'APPROVED']
               AND o.is_current = true
             RETURN o
             ORDER BY o.timestamp DESC`
          );
          const value = result.records.map((r) => r.get('o').properties);
          queryCache.set(cacheKey, value, 30_000); // 30s TTL
          return value;
        } finally {
          await session.close();
        }
      },

      async treatyCoverage() {
        const session = driver.session();
        const now = Date.now();
        try {
          const result = await session.run(
            `MATCH (t:TreatyAttestation)
             WHERE t.expiry_date > $now OR t.expiry_date = 0
             RETURN t
             ORDER BY t.effective_date DESC`,
            { now }
          );
          return result.records.map((r) => r.get('t').properties);
        } finally {
          await session.close();
        }
      },

      async jurisdictionalFootprint() {
        const session = driver.session();
        const now = Date.now();
        try {
          const result = await session.run(
            `MATCH (t:TreatyAttestation)
             WHERE t.expiry_date > $now OR t.expiry_date = 0
             RETURN count(t) AS total,
                    count(DISTINCT t.jurisdiction_code) AS jurisdictions,
                    collect(DISTINCT t.jurisdiction_code) AS codes,
                    collect(DISTINCT t.compliance_domain) AS domains`,
            { now }
          );
          if (result.records.length === 0) {
            return { totalTreaties: 0, activeJurisdictions: 0, jurisdictionCodes: [], coverageDomains: [] };
          }
          const rec = result.records[0];
          return {
            totalTreaties: Number(rec.get('total')),
            activeJurisdictions: Number(rec.get('jurisdictions')),
            jurisdictionCodes: rec.get('codes'),
            coverageDomains: rec.get('domains'),
          };
        } finally {
          await session.close();
        }
      },

      // --- Economics resolvers ---

      async feeHistory(_: unknown, { entityId, limit }: { entityId: string; limit?: number }) {
        const session = driver.session();
        const cap = limit ?? 50;
        try {
          const result = await session.run(
            `MATCH (f:FeeRecord {entity_id: $entityId})
             RETURN f
             ORDER BY f.timestamp DESC
             LIMIT $cap`,
            { entityId, cap }
          );
          return result.records.map((r) => r.get('f').properties);
        } finally {
          await session.close();
        }
      },

      async scaleAssessment(_: unknown, { platform }: { platform: string }) {
        const session = driver.session();
        try {
          const result = await session.run(
            `MATCH (m:ScaleMetric {platform: $platform})
             WHERE m.is_current = true
             RETURN m
             LIMIT 1`,
            { platform }
          );
          if (result.records.length === 0) return null;
          return result.records[0].get('m').properties;
        } finally {
          await session.close();
        }
      },

      // --- Cross-substrate analysis ---

      async crossSubstrateCoverage(_: unknown, { minSubstrates }: { minSubstrates: number }) {
        const session = driver.session();
        try {
          const result = await session.run(
            `MATCH (a:WorldActor)-[:HAS_STATE]->(state)
             WHERE state.is_current = true
             WITH a, collect(DISTINCT labels(state)[0]) AS substrates,
                  max(state.timestamp) AS lastUpdated
             WHERE size(substrates) >= $minSubstrates
             RETURN a.id AS entityId, substrates, size(substrates) AS substrateCount, lastUpdated
             ORDER BY substrateCount DESC`,
            { minSubstrates }
          );
          return result.records.map((r) => ({
            entityId: r.get('entityId'),
            substrates: r.get('substrates'),
            substrateCount: Number(r.get('substrateCount')),
            lastUpdated: r.get('lastUpdated') ? Number(r.get('lastUpdated')) : null,
          }));
        } finally {
          await session.close();
        }
      },

      // --- Observability ---

      cacheStats() {
        return queryCache.stats();
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
