import { EventParser, Idl } from '@coral-xyz/anchor';
import { PublicKey } from '@solana/web3.js';
import * as fs from 'fs';
import * as path from 'path';

export interface ZuupHqPayload {
  attestationId: string;
  sha256: number[];
  attestationType: string;
  score: number;
  timestamp: number;
}

function loadIdl(): Idl {
  const idlPath = path.resolve(__dirname, '../../idl/zuuphq.json');
  if (!fs.existsSync(idlPath)) {
    throw new Error(`ZuupHQ IDL not found at ${idlPath}.`);
  }
  return JSON.parse(fs.readFileSync(idlPath, 'utf8')) as Idl;
}

export function parseZuupHqEvents(logs: string[], programId: PublicKey): ZuupHqPayload[] {
  const idl = loadIdl();
  const coder = new (require('@coral-xyz/anchor').BorshCoder)(idl);
  const parser = new EventParser(programId, coder);
  const results: ZuupHqPayload[] = [];

  for (const event of parser.parseLogs(logs)) {
    if (event.name === 'AttestationWritten') {
      const d = event.data as Record<string, unknown>;
      results.push({
        attestationId: d['attestationId'] as string,
        sha256: Array.from(d['sha256'] as number[]),
        attestationType: d['attestationType'] as string,
        score: d['score'] as number,
        timestamp: Number(d['timestamp']),
      });
    }
  }

  return results;
}
