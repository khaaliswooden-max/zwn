import { EventParser, Idl } from '@coral-xyz/anchor';
import { PublicKey } from '@solana/web3.js';
import * as fs from 'fs';
import * as path from 'path';

export interface VeyraStatePayload {
  requestId: string;
  context: string;
  vScore: number;
  latencyMs: number;
  outputHash: number[];
  timestamp: number;
}

function loadIdl(): Idl {
  const idlPath = path.resolve(__dirname, '../../idl/veyra.json');
  if (!fs.existsSync(idlPath)) {
    throw new Error(`Veyra IDL not found at ${idlPath}.`);
  }
  return JSON.parse(fs.readFileSync(idlPath, 'utf8')) as Idl;
}

export function parseVeyraEvents(logs: string[], programId: PublicKey): VeyraStatePayload[] {
  const idl = loadIdl();
  const coder = new (require('@coral-xyz/anchor').BorshCoder)(idl);
  const parser = new EventParser(programId, coder);
  const results: VeyraStatePayload[] = [];

  for (const event of parser.parseLogs(logs)) {
    if (event.name === 'ReasoningComplete') {
      const d = event.data as Record<string, unknown>;
      results.push({
        requestId: d['requestId'] as string,
        context: d['context'] as string,
        vScore: d['vScore'] as number,
        latencyMs: d['latencyMs'] as number,
        outputHash: Array.from(d['outputHash'] as number[]),
        timestamp: Number(d['timestamp']),
      });
    }
  }

  return results;
}
