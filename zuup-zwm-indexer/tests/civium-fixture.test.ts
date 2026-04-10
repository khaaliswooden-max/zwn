/**
 * Jest wrapper for the green-path e2e test in fixture mode.
 *
 * Exercises the full Civium → Aureon causal chain:
 *   Borsh encode → parse → Neo4j write → causal propagation → validation query
 *
 * Uses the in-memory Neo4j mock (no external services required).
 */

import { PublicKey } from '@solana/web3.js';
import { createMockDriver } from './helpers/mock-neo4j-driver';
import { writeComplianceState } from '../src/writers/compliance-writer';
import { writeProcurementState } from '../src/writers/procurement-writer';
import { parseCiviumEvents } from '../src/parsers/civium-parser';
import { evaluateAndPropagate } from '../src/causal/propagation-engine';
import { initDb } from '../src/db/init';
import { Driver } from 'neo4j-driver';
import * as http from 'http';

// ── Borsh helpers (same as civium-e2e.ts) ─────────────────────────────────────

function borshString(s: string): Buffer {
  const strBytes = Buffer.from(s, 'utf8');
  const lenBuf = Buffer.allocUnsafe(4);
  lenBuf.writeUInt32LE(strBytes.length, 0);
  return Buffer.concat([lenBuf, strBytes]);
}

function encodeComplianceStateChange(
  entityId: string,
  status: string,
  score: number,
  domain: string,
  evidenceHash: Buffer,
  timestamp: bigint
): Buffer {
  const disc = Buffer.from([88, 77, 221, 133, 60, 7, 216, 202]);
  const tsBuf = Buffer.allocUnsafe(8);
  tsBuf.writeBigInt64LE(timestamp, 0);
  return Buffer.concat([
    disc,
    borshString(entityId),
    borshString(status),
    Buffer.from([score & 0xff]),
    borshString(domain),
    evidenceHash,
    tsBuf,
  ]);
}

function buildAnchorLogs(programId: string, eventBuf: Buffer): string[] {
  return [
    `Program ${programId} invoke [1]`,
    `Program log: Instruction: EvaluateCompliance`,
    `Program data: ${eventBuf.toString('base64')}`,
    `Program ${programId} success`,
  ];
}

// ── Tests ─────────────────────────────────────────────────────────────────────

const PROGRAM_ID = 'H1eSx6ij1Q296Tzss62AHuamn1rD4a9MkDapYu1CyvVM';
const programKey = new PublicKey(PROGRAM_ID);

describe('Civium green-path (fixture mode)', () => {
  let driver: Driver;

  beforeAll(async () => {
    driver = createMockDriver() as unknown as Driver;
    await initDb(driver);
  });

  afterAll(async () => {
    await driver.close();
  });

  it('Step 3: parseCiviumEvents deserializes a ComplianceStateChange', () => {
    const entityId = `test-entity-${Date.now()}`;
    const evidenceHash = Buffer.alloc(32, 0xab);
    const timestamp = BigInt(Math.floor(Date.now() / 1000));
    const eventBuf = encodeComplianceStateChange(entityId, 'VIOLATION', 42, 'esg', evidenceHash, timestamp);
    const logs = buildAnchorLogs(PROGRAM_ID, eventBuf);

    const events = parseCiviumEvents(logs, programKey);
    expect(events.length).toBe(1);
    expect(events[0].entityId).toBe(entityId);
    expect(events[0].status).toBe('VIOLATION');
    expect(events[0].score).toBe(42);
    expect(events[0].domain).toBe('esg');
  });

  it('Step 4: writeComplianceState creates nodes in Neo4j', async () => {
    const entityId = `test-write-${Date.now()}`;
    const evidenceHash = Buffer.alloc(32, 0xab);
    const timestamp = BigInt(Math.floor(Date.now() / 1000));
    const eventBuf = encodeComplianceStateChange(entityId, 'VIOLATION', 42, 'esg', evidenceHash, timestamp);
    const logs = buildAnchorLogs(PROGRAM_ID, eventBuf);
    const events = parseCiviumEvents(logs, programKey);

    const substrateEventId = await writeComplianceState(
      driver, events[0], 999999, 'test-tx-sig'
    );
    expect(typeof substrateEventId).toBe('string');
    expect(substrateEventId.length).toBeGreaterThan(0);
  });

  it('Steps 5-7: causal propagation fires RECALCULATE_FIT_IQ to mock Aureon', async () => {
    // Start a mock Aureon server to receive the causal POST
    let receivedAction = '';
    const server = await new Promise<http.Server>((resolve, reject) => {
      const srv = http.createServer((req, res) => {
        const chunks: Buffer[] = [];
        req.on('data', (c: Buffer) => chunks.push(c));
        req.on('end', () => {
          const body = JSON.parse(Buffer.concat(chunks).toString()) as { action: string };
          receivedAction = body.action;
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ eventId: `mock-${Date.now()}`, status: 'ok' }));
        });
      });
      srv.on('error', reject);
      srv.listen(0, () => resolve(srv)); // port 0 = random available port
    });

    const addr = server.address() as { port: number };
    process.env['AUREON_INGEST_URL'] = `http://localhost:${addr.port}/zwm/ingest`;

    const entityId = `test-causal-${Date.now()}`;
    await evaluateAndPropagate(
      'COMPLIANCE_STATE_CHANGE',
      'civium',
      { entityId, status: 'VIOLATION', score: 42, domain: 'esg' },
      `evt-test-${Date.now()}`
    );

    // Give the async POST time to complete
    await new Promise(r => setTimeout(r, 500));

    server.close();
    expect(receivedAction).toBe('RECALCULATE_FIT_IQ');
  });
});
