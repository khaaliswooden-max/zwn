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
    throw new Error(`Symbion IDL not found at ${idlPath}. Run 'anchor build' in symbion repo and copy target/idl/symbion.json here.`);
  }
  return JSON.parse(fs.readFileSync(idlPath, 'utf8')) as Idl;
}

export function createSymbionEventParser(programId: PublicKey): EventParser {
  const idl = loadIdl();
  const coder = new (require('@coral-xyz/anchor').BorshCoder)(idl);
  return new EventParser(programId, coder);
}

export function parseSymbionEvents(
  logs: string[],
  programId: PublicKey
): SymbionStatePayload[] {
  const parser = createSymbionEventParser(programId);
  const results: SymbionStatePayload[] = [];

  for (const event of parser.parseLogs(logs)) {
    if (event.name === 'BiologicalReading') {
      const d = event.data as Record<string, unknown>;
      results.push({
        subjectId: d['subject_id'] as string,
        serotoninNm: d['serotonin_nm'] as number,
        dopamineNm: d['dopamine_nm'] as number,
        cortisolNm: d['cortisol_nm'] as number,
        gabaNm: d['gaba_nm'] as number,
        anomalyFlag: d['anomaly_flag'] as boolean,
        severity: d['severity'] as string,
        timestamp: Number(d['timestamp']),
      });
    }
  }

  return results;
}
