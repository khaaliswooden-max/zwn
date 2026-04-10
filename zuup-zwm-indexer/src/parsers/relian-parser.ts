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
    throw new Error(`Relian IDL not found at ${idlPath}. Run 'anchor build' in relian repo and copy target/idl/relian.json here.`);
  }
  return JSON.parse(fs.readFileSync(idlPath, 'utf8')) as Idl;
}

export function createRelianEventParser(programId: PublicKey): EventParser {
  const idl = loadIdl();
  const coder = new (require('@coral-xyz/anchor').BorshCoder)(idl);
  return new EventParser(programId, coder);
}

export function parseRelianEvents(
  logs: string[],
  programId: PublicKey
): RelianStatePayload[] {
  const parser = createRelianEventParser(programId);
  const results: RelianStatePayload[] = [];

  for (const event of parser.parseLogs(logs)) {
    if (event.name === 'MigrationComplete') {
      const d = event.data as Record<string, unknown>;
      results.push({
        projectId: d['project_id'] as string,
        semanticPreservation: d['semantic_preservation'] as number,
        testCoverage: d['test_coverage'] as number,
        locMigrated: Number(d['loc_migrated']),
        artifactHash: Array.from(d['artifact_hash'] as number[]),
        timestamp: Number(d['timestamp']),
      });
    }
  }

  return results;
}
