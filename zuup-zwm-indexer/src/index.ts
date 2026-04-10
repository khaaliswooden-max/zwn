import 'dotenv/config';
import neo4j from 'neo4j-driver';
import { Connection } from '@solana/web3.js';
import { initDb } from './db/init';
import { startGraphQL } from './api/graphql-server';
import { startEnterpriseApi } from './api/enterprise-api';
import { startCiviumListener } from './listeners/civium-listener';
import { startAureonListener } from './listeners/aureon-listener';
import { startQalListener } from './listeners/qal-listener';
import { startSymbionListener } from './listeners/symbion-listener';
import { startRelianListener } from './listeners/relian-listener';
import { startPodxListener } from './listeners/podx-listener';
import { startVeyraListener } from './listeners/veyra-listener';
import { startZusdcListener } from './listeners/zusdc-listener';
import { startZuuphqListener } from './listeners/zuuphq-listener';

// Governance + Economics modules (Phase 4 — 100-year positioning)
// Writers are invoked by causal rules and API endpoints, not at startup.
// Importing here validates the modules load correctly at bootstrap.
import './governance/types';
import './economics/types';
import { metrics } from './lib/metrics';

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

  // 5. Start all 9 platform listeners (guarded by env var — missing IDs log warning)
  const listeners = [
    { name: 'civium',  envKey: 'CIVIUM_PROGRAM_ID',  start: startCiviumListener },
    { name: 'aureon',  envKey: 'AUREON_PROGRAM_ID',  start: startAureonListener },
    { name: 'qal',     envKey: 'QAL_PROGRAM_ID',     start: startQalListener },
    { name: 'symbion', envKey: 'SYMBION_PROGRAM_ID', start: startSymbionListener },
    { name: 'relian',  envKey: 'RELIAN_PROGRAM_ID',  start: startRelianListener },
    { name: 'podx',    envKey: 'PODX_PROGRAM_ID',    start: startPodxListener },
    { name: 'veyra',   envKey: 'VEYRA_PROGRAM_ID',   start: startVeyraListener },
    { name: 'zusdc',   envKey: 'ZUSDC_PROGRAM_ID',   start: startZusdcListener },
    { name: 'zuuphq',  envKey: 'ZUUPHQ_PROGRAM_ID',  start: startZuuphqListener },
  ];

  let activeCount = 0;
  for (const { name, envKey, start } of listeners) {
    if (process.env[envKey]) {
      start(connection, driver);
      activeCount++;
    } else {
      console.warn(`[index] Skipping ${name} listener — ${envKey} not set`);
    }
  }

  metrics.activeListeners.set({}, activeCount);
  console.log(`[index] ZWM indexer running. ${activeCount}/9 platform listeners active.`);
  console.log('[index] Governance + Economics layers loaded (Phase 4).');
  console.log('[index] Metrics available at http://localhost:3001/metrics (Prometheus format).');
}

main().catch((err) => {
  console.error('[index] Fatal error:', err);
  process.exit(1);
});
