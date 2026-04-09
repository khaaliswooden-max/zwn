/**
 * @zuup/zwm-sdk — Quickstart example
 *
 * Prerequisites:
 *   1. Start the ZWM indexer:   cd zuup-zwm-indexer && npm run dev
 *   2. Generate an API key:     curl -X POST http://localhost:3001/enterprise/api-keys
 *   3. Run this file:           ts-node sdk/example.ts <your-key>
 */

import { ZWMClient } from './index';

const apiKey = process.argv[2];
if (!apiKey) {
  console.error('Usage: ts-node sdk/example.ts <api-key>');
  console.error('\nGet a key:');
  console.error('  curl -X POST http://localhost:3001/enterprise/api-keys');
  process.exit(1);
}

const client = new ZWMClient(apiKey, 'http://localhost:3001');

async function run(): Promise<void> {
  const entityId = process.argv[3] ?? 'supplier-demo';
  console.log(`\n[ZWM SDK] Querying entity: ${entityId}\n`);

  // ── 1. Full world state ───────────────────────────────────────────────────
  console.log('── Full World State ─────────────────────────────────────────');
  try {
    const state = await client.getWorldState(entityId);
    console.log('Actor:      ', state.actor);
    console.log('Compliance: ', state.compliance ?? '(no data)');
    console.log('Procurement:', state.procurement ?? '(no data)');
    console.log('Compute:    ', state.compute ?? '(no data)');
    console.log('Biological: ', state.biological ?? '(no data)');
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.log('Not found or API error:', msg);
  }

  // ── 2. Composite risk ─────────────────────────────────────────────────────
  console.log('\n── Composite Risk ───────────────────────────────────────────');
  try {
    const risk = await client.getCompositeRisk(entityId);
    console.log('Risk Level:        ', risk.riskLevel);
    console.log('Compliance Status: ', risk.complianceStatus ?? '(no data)');
    console.log('FitIQ:             ', risk.fitiq ?? '(no data)');
    console.log('Availability:      ', risk.availability ?? '(no data)');
    console.log('Anomaly Flag:      ', risk.anomalyFlag ?? '(no data)');
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.log('Not found or API error:', msg);
  }

  // ── 3. Compliance filter ──────────────────────────────────────────────────
  console.log('\n── Entities in VIOLATION (halal domain) ────────────────────');
  try {
    const flagged = await client.getEntitiesByCompliance('VIOLATION', 'halal');
    if (flagged.length === 0) {
      console.log('None currently. (Index Civium events to populate.)');
    } else {
      flagged.forEach((a) => console.log(' -', a.id));
    }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.log('Error:', msg);
  }

  console.log('\n[ZWM SDK] Done. Visit http://localhost:3001 for the full API reference.\n');
}

run().catch((err) => {
  console.error('[ZWM SDK] Fatal error:', err);
  process.exit(1);
});
