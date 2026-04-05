import { EventParser, Program, Idl } from '@coral-xyz/anchor';
import { PublicKey } from '@solana/web3.js';
import * as fs from 'fs';
import * as path from 'path';

export interface CiviumStatePayload {
  entityId: string;
  status: string;
  score: number;
  domain: string;
  evidenceHash: number[];
  timestamp: number;
}

function loadIdl(): Idl {
  const idlPath = path.resolve(__dirname, '../../idl/civium.json');
  if (!fs.existsSync(idlPath)) {
    throw new Error(`Civium IDL not found at ${idlPath}. Run 'anchor build' in civium repo and copy target/idl/civium.json here.`);
  }
  return JSON.parse(fs.readFileSync(idlPath, 'utf8')) as Idl;
}

export function createCiviumEventParser(programId: PublicKey): EventParser {
  const idl = loadIdl();
  const coder = new (require('@coral-xyz/anchor').BorshCoder)(idl);
  return new EventParser(programId, coder);
}

export function parseCiviumEvents(
  logs: string[],
  programId: PublicKey
): CiviumStatePayload[] {
  const parser = createCiviumEventParser(programId);
  const results: CiviumStatePayload[] = [];

  for (const event of parser.parseLogs(logs)) {
    if (event.name === 'ComplianceStateChange') {
      const d = event.data as Record<string, unknown>;
      results.push({
        entityId: d['entityId'] as string,
        status: d['status'] as string,
        score: d['score'] as number,
        domain: d['domain'] as string,
        evidenceHash: Array.from(d['evidenceHash'] as number[]),
        timestamp: Number(d['timestamp']),
      });
    }
  }

  return results;
}
