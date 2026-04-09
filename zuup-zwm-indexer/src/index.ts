import 'dotenv/config';
import neo4j from 'neo4j-driver';
import { Connection } from '@solana/web3.js';
import { initDb } from './db/init';
import { startGraphQL } from './api/graphql-server';
import { startEnterpriseApi } from './api/enterprise-api';
import { startCiviumListener } from './listeners/civium-listener';
import { startAureonListener } from './listeners/aureon-listener';

async function main(): Promise<void> {
  // Neo4j driver
  const driver = neo4j.driver(
    process.env['NEO4J_URI']!,
    neo4j.auth.basic(process.env['NEO4J_USER']!, process.env['NEO4J_PASSWORD']!)
  );

  // 1. Initialize DB constraints and indexes
  await initDb(driver);

  // 2. Start GraphQL API (port 4000)
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
}

main().catch((err) => {
  console.error('[index] Fatal error:', err);
  process.exit(1);
});
