import { EventParser, Idl } from '@coral-xyz/anchor';
import { PublicKey } from '@solana/web3.js';
import * as fs from 'fs';
import * as path from 'path';

export interface SymbionStatePayload {
  subjectId: string;
  serotoninNm: number;
  dopamineNm: number;
  cortisolNm: number;
  gabaNm: number;
  anomalyFlag: boolean;
  severity: string;
  timestamp: number;
}

function loadIdl(): Idl {
  const idlPath = path.resolve(__dirname, '../../idl/symbion.json');
  if (!fs.existsSync(idlPath)) {
    throw new Error(`Symbion IDL not found at ${idlPath}.`);
  }
  return JSON.parse(fs.readFileSync(idlPath, 'utf8')) as Idl;
}

export function parseSymbionEvents(logs: string[], programId: PublicKey): SymbionStatePayload[] {
  const idl = loadIdl();
  const coder = new (require('@coral-xyz/anchor').BorshCoder)(idl);
  const parser = new EventParser(programId, coder);
  const results: SymbionStatePayload[] = [];

  for (const event of parser.parseLogs(logs)) {
    if (event.name === 'BiologicalReading') {
      const d = event.data as Record<string, unknown>;
      results.push({
        subjectId: d['subjectId'] as string,
        serotoninNm: d['serotoninNm'] as number,
        dopamineNm: d['dopamineNm'] as number,
        cortisolNm: d['cortisolNm'] as number,
        gabaNm: d['gabaNm'] as number,
        anomalyFlag: d['anomalyFlag'] as boolean,
        severity: d['severity'] as string,
        timestamp: Number(d['timestamp']),
      });
    }
  }

  return results;
}
