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
    throw new Error(`PodX IDL not found at ${idlPath}. Run 'anchor build' in podx repo and copy target/idl/podx.json here.`);
  }
  return JSON.parse(fs.readFileSync(idlPath, 'utf8')) as Idl;
}

export function createPodxEventParser(programId: PublicKey): EventParser {
  const idl = loadIdl();
  const coder = new (require('@coral-xyz/anchor').BorshCoder)(idl);
  return new EventParser(programId, coder);
}

export function parsePodxEvents(
  logs: string[],
  programId: PublicKey
): PodxStatePayload[] {
  const parser = createPodxEventParser(programId);
  const results: PodxStatePayload[] = [];

  for (const event of parser.parseLogs(logs)) {
    if (event.name === 'ComputeStateUpdate') {
      const d = event.data as Record<string, unknown>;
      results.push({
        nodeId: d['node_id'] as string,
        xdopScore: d['xdop_score'] as number,
        wcbiScore: d['wcbi_score'] as number,
        ddilHours: d['ddil_hours'] as number,
        tops: d['tops'] as number,
        availability: d['availability'] as number,
        timestamp: Number(d['timestamp']),
      });
    }
  }

  return results;
}
