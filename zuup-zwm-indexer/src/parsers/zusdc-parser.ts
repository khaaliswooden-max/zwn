import { EventParser, Idl } from '@coral-xyz/anchor';
import { PublicKey } from '@solana/web3.js';
import * as fs from 'fs';
import * as path from 'path';

export interface ZusdcStatePayload {
  transactionId: string;
  counterpartyId: string;
  amountUsdc: number;
  eventType: string;
  timestamp: number;
}

function loadIdl(): Idl {
  const idlPath = path.resolve(__dirname, '../../idl/zusdc.json');
  if (!fs.existsSync(idlPath)) {
    throw new Error(`ZUSDC IDL not found at ${idlPath}.`);
  }
  return JSON.parse(fs.readFileSync(idlPath, 'utf8')) as Idl;
}

export function parseZusdcEvents(logs: string[], programId: PublicKey): ZusdcStatePayload[] {
  const idl = loadIdl();
  const coder = new (require('@coral-xyz/anchor').BorshCoder)(idl);
  const parser = new EventParser(programId, coder);
  const results: ZusdcStatePayload[] = [];

  for (const event of parser.parseLogs(logs)) {
    if (event.name === 'SettlementEvent') {
      const d = event.data as Record<string, unknown>;
      results.push({
        transactionId: d['transactionId'] as string,
        counterpartyId: d['counterpartyId'] as string,
        amountUsdc: Number(d['amountUsdc']),
        eventType: d['eventType'] as string,
        timestamp: Number(d['timestamp']),
      });
    }
  }

  return results;
}
