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
    throw new Error(`Veyra IDL not found at ${idlPath}. Run 'anchor build' in veyra repo and copy target/idl/veyra.json here.`);
  }
  return JSON.parse(fs.readFileSync(idlPath, 'utf8')) as Idl;
}

export function createVeyraEventParser(programId: PublicKey): EventParser {
  const idl = loadIdl();
  const coder = new (require('@coral-xyz/anchor').BorshCoder)(idl);
  return new EventParser(programId, coder);
}

export function parseVeyraEvents(
  logs: string[],
  programId: PublicKey
): VeyraStatePayload[] {
  const parser = createVeyraEventParser(programId);
  const results: VeyraStatePayload[] = [];

  for (const event of parser.parseLogs(logs)) {
    if (event.name === 'ReasoningComplete') {
      const d = event.data as Record<string, unknown>;
      results.push({
        requestId: d['request_id'] as string,
        context: d['context'] as string,
        vScore: d['v_score'] as number,
        latencyMs: d['latency_ms'] as number,
        outputHash: Array.from(d['output_hash'] as number[]),
        timestamp: Number(d['timestamp']),
      });
    }
  }

  return results;
}
