import 'dotenv/config';
import neo4j from 'neo4j-driver';
import { Connection } from '@solana/web3.js';
import { initDb } from './db/init';
import { startGraphQL } from './api/graphql-server';
import { startEnterpriseApi } from './api/enterprise-api';
import { startCiviumListener } from './listeners/civium-listener';
import { startAureonListener } from './listeners/aureon-listener';

// Governance + Economics modules (Phase 4 — 100-year positioning)
// Writers are invoked by causal rules and API endpoints, not at startup.
// Importing here validates the modules load correctly at bootstrap.
import './governance/types';
import './economics/types';

async function main(): Promise<void> {
  // Neo4j driver (connection pool: up to 50 connections, 30s acquisition timeout)
  const driver = neo4j.driver(
    process.env['NEO4J_URI']!,
    neo4j.auth.basic(process.env['NEO4J_USER']!, process.env['NEO4J_PASSWORD']!),
    {
      maxConnectionPoolSize: parseInt(process.env['NEO4J_POOL_SIZE'] ?? '50', 10),
      connectionAcquisitionTimeout: 30_000,
      maxTransactionRetryTime: 15_000,
    }
  );

  // 1. Initialize DB constraints and indexes (includes governance + economics)
  await initDb(driver);

  // 2. Start GraphQL API (port 4000) — includes governance + economics queries
  await startGraphQL(driver);

  // 3. Start Enterprise REST API (port 3001)
  await startEnterpriseApi(driver);

  // 4. Solana WebSocket connection
  const connection = new Connection(
    process.env['SOLANA_RPC_HTTP']!,
    { wsEndpoint: process.env['SOLANA_RPC_WS']! }
  );

  // 5. Start platform listeners
  startCiviumListener(connection, driver);
  startAureonListener(connection, driver);

  console.log('[index] ZWM indexer running.');
  console.log('[index] Governance + Economics layers loaded (Phase 4).');
}

main().catch((err) => {
  console.error('[index] Fatal error:', err);
  process.exit(1);
});
