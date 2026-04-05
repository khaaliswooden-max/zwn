import { EventParser, Idl } from '@coral-xyz/anchor';
import { PublicKey } from '@solana/web3.js';
import * as fs from 'fs';
import * as path from 'path';

export interface RelianStatePayload {
  projectId: string;
  semanticPreservation: number;
  testCoverage: number;
  locMigrated: number;
  artifactHash: number[];
  timestamp: number;
}

function loadIdl(): Idl {
  const idlPath = path.resolve(__dirname, '../../idl/relian.json');
  if (!fs.existsSync(idlPath)) {
    throw new Error(`Relian IDL not found at ${idlPath}.`);
  }
  return JSON.parse(fs.readFileSync(idlPath, 'utf8')) as Idl;
}

export function parseRelianEvents(logs: string[], programId: PublicKey): RelianStatePayload[] {
  const idl = loadIdl();
  const coder = new (require('@coral-xyz/anchor').BorshCoder)(idl);
  const parser = new EventParser(programId, coder);
  const results: RelianStatePayload[] = [];

  for (const event of parser.parseLogs(logs)) {
    if (event.name === 'MigrationComplete') {
      const d = event.data as Record<string, unknown>;
      results.push({
        projectId: d['projectId'] as string,
        semanticPreservation: d['semanticPreservation'] as number,
        testCoverage: d['testCoverage'] as number,
        locMigrated: Number(d['locMigrated']),
        artifactHash: Array.from(d['artifactHash'] as number[]),
        timestamp: Number(d['timestamp']),
      });
    }
  }

  return results;
}
