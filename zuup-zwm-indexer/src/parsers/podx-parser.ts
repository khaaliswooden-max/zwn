import { EventParser, Idl } from '@coral-xyz/anchor';
import { PublicKey } from '@solana/web3.js';
import * as fs from 'fs';
import * as path from 'path';

export interface PodxStatePayload {
  nodeId: string;
  xdopScore: number;
  wcbiScore: number;
  ddilHours: number;
  tops: number;
  availability: number;
  timestamp: number;
}

function loadIdl(): Idl {
  const idlPath = path.resolve(__dirname, '../../idl/podx.json');
  if (!fs.existsSync(idlPath)) {
    throw new Error(`PodX IDL not found at ${idlPath}.`);
  }
  return JSON.parse(fs.readFileSync(idlPath, 'utf8')) as Idl;
}

export function parsePodxEvents(logs: string[], programId: PublicKey): PodxStatePayload[] {
  const idl = loadIdl();
  const coder = new (require('@coral-xyz/anchor').BorshCoder)(idl);
  const parser = new EventParser(programId, coder);
  const results: PodxStatePayload[] = [];

  for (const event of parser.parseLogs(logs)) {
    if (event.name === 'ComputeStateUpdate') {
      const d = event.data as Record<string, unknown>;
      results.push({
        nodeId: d['nodeId'] as string,
        xdopScore: d['xdopScore'] as number,
        wcbiScore: d['wcbiScore'] as number,
        ddilHours: d['ddilHours'] as number,
        tops: d['tops'] as number,
        availability: d['availability'] as number,
        timestamp: Number(d['timestamp']),
      });
    }
  }

  return results;
}
