import { EventParser, Idl } from '@coral-xyz/anchor';
import { PublicKey } from '@solana/web3.js';
import * as fs from 'fs';
import * as path from 'path';

export interface QalStatePayload {
  entityId: string;
  domain: string;
  confidence: number;
  temporalDepthYears: number;
  riskLevel: string;
  resultHash: number[];
  timestamp: number;
}

function loadIdl(): Idl {
  const idlPath = path.resolve(__dirname, '../../idl/qal.json');
  if (!fs.existsSync(idlPath)) {
    throw new Error(`QAL IDL not found at ${idlPath}. Run 'anchor build' in qal repo and copy target/idl/qal.json here.`);
  }
  return JSON.parse(fs.readFileSync(idlPath, 'utf8')) as Idl;
}

export function createQalEventParser(programId: PublicKey): EventParser {
  const idl = loadIdl();
  const coder = new (require('@coral-xyz/anchor').BorshCoder)(idl);
  return new EventParser(programId, coder);
}

export function parseQalEvents(
  logs: string[],
  programId: PublicKey
): QalStatePayload[] {
  const parser = createQalEventParser(programId);
  const results: QalStatePayload[] = [];

  for (const event of parser.parseLogs(logs)) {
    if (event.name === 'ReconstructionComplete') {
      const d = event.data as Record<string, unknown>;
      results.push({
        entityId: d['entity_id'] as string,
        domain: d['domain'] as string,
        confidence: d['confidence'] as number,
        temporalDepthYears: d['temporal_depth_years'] as number,
        riskLevel: d['risk_level'] as string,
        resultHash: Array.from(d['result_hash'] as number[]),
        timestamp: Number(d['timestamp']),
      });
    }
  }

  return results;
}
