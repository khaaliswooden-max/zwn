import { EventParser, Idl } from '@coral-xyz/anchor';
import { PublicKey } from '@solana/web3.js';
import * as fs from 'fs';
import * as path from 'path';

export interface AureonStatePayload {
  entityId: string;
  fitiqScore: number;
  updScore: number;
  opportunityCount: number;
  timestamp: number;
}

function loadIdl(): Idl {
  const idlPath = path.resolve(__dirname, '../../idl/aureon.json');
  if (!fs.existsSync(idlPath)) {
    throw new Error(`Aureon IDL not found at ${idlPath}. Run 'anchor build' in aureon repo and copy target/idl/aureon.json here.`);
  }
  return JSON.parse(fs.readFileSync(idlPath, 'utf8')) as Idl;
}

export function createAureonEventParser(programId: PublicKey): EventParser {
  const idl = loadIdl();
  const coder = new (require('@coral-xyz/anchor').BorshCoder)(idl);
  return new EventParser(programId, coder);
}

export function parseAureonEvents(
  logs: string[],
  programId: PublicKey
): AureonStatePayload[] {
  const parser = createAureonEventParser(programId);
  const results: AureonStatePayload[] = [];

  for (const event of parser.parseLogs(logs)) {
    if (event.name === 'ProcurementStateChange') {
      const d = event.data as Record<string, unknown>;
      results.push({
        entityId: d['entity_id'] as string,
        fitiqScore: d['fitiq_score'] as number,
        updScore: d['upd_score'] as number,
        opportunityCount: d['opportunity_count'] as number,
        timestamp: Number(d['timestamp']),
      });
    }
  }

  return results;
}
