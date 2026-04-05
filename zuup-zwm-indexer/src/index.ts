import 'dotenv/config';
import neo4j from 'neo4j-driver';
import { Connection } from '@solana/web3.js';
import { initDb } from './db/init';
import { startGraphQL } from './api/graphql-server';
import { startCiviumListener } from './listeners/civium-listener';
import { startAureonListener } from './listeners/aureon-listener';
import { startQalListener } from './listeners/qal-listener';
import { startSymbionListener } from './listeners/symbion-listener';
import { startRelianListener } from './listeners/relian-listener';
import { startPodxListener } from './listeners/podx-listener';
import { startVeyraListener } from './listeners/veyra-listener';
import { startZusdcListener } from './listeners/zusdc-listener';

async function main(): Promise<void> {
  // Neo4j driver
  const driver = neo4j.driver(
    process.env['NEO4J_URI']!,
    neo4j.auth.basic(process.env['NEO4J_USER']!, process.env['NEO4J_PASSWORD']!)
  );

  // 1. Initialize DB constraints and indexes
  await initDb(driver);

  // 2. Start GraphQL API
  await startGraphQL(driver);

  // 3. Solana WebSocket connection
  const connection = new Connection(
    process.env['SOLANA_RPC_HTTP']!,
    { wsEndpoint: process.env['SOLANA_RPC_WS']! }
  );

  // 4. Start all platform listeners
  startCiviumListener(connection, driver);
  startAureonListener(connection, driver);
  startQalListener(connection, driver);
  startSymbionListener(connection, driver);
  startRelianListener(connection, driver);
  startPodxListener(connection, driver);
  startVeyraListener(connection, driver);
  startZusdcListener(connection, driver);

  console.log('[index] ZWM indexer running — all 8 platform listeners active.');
}

main().catch((err) => {
  console.error('[index] Fatal error:', err);
  process.exit(1);
});
