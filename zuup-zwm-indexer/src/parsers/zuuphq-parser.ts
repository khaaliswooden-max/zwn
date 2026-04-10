import { EventParser, Idl } from '@coral-xyz/anchor';
import { PublicKey } from '@solana/web3.js';
import * as fs from 'fs';
import * as path from 'path';

export interface ZuuphqStatePayload {
  attestationId: string;
  sha256: number[];
  pdaAddress: string;
  score: number;
  attestationType: string;
  timestamp: number;
}

function loadIdl(): Idl {
  const idlPath = path.resolve(__dirname, '../../idl/zuuphq.json');
  if (!fs.existsSync(idlPath)) {
    throw new Error(`ZuupHQ IDL not found at ${idlPath}. Run 'anchor build' in zuup-hq repo and copy target/idl/zuup_hq.json here.`);
  }
  return JSON.parse(fs.readFileSync(idlPath, 'utf8')) as Idl;
}

export function createZuuphqEventParser(programId: PublicKey): EventParser {
  const idl = loadIdl();
  const coder = new (require('@coral-xyz/anchor').BorshCoder)(idl);
  return new EventParser(programId, coder);
}

export function parseZuuphqEvents(
  logs: string[],
  programId: PublicKey
): ZuuphqStatePayload[] {
  const parser = createZuuphqEventParser(programId);
  const results: ZuuphqStatePayload[] = [];

  for (const event of parser.parseLogs(logs)) {
    if (event.name === 'AttestationCreated') {
      const d = event.data as Record<string, unknown>;
      results.push({
        attestationId: d['attestation_id'] as string,
        sha256: Array.from(d['sha256'] as number[]),
        pdaAddress: d['pda_address'] as string,
        score: d['score'] as number,
        attestationType: d['attestation_type'] as string,
        timestamp: Number(d['timestamp']),
      });
    }
  }

  return results;
}
