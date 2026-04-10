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
    throw new Error(`ZUSDC IDL not found at ${idlPath}. Run 'anchor build' in zusdc repo and copy target/idl/zusdc.json here.`);
  }
  return JSON.parse(fs.readFileSync(idlPath, 'utf8')) as Idl;
}

export function createZusdcEventParser(programId: PublicKey): EventParser {
  const idl = loadIdl();
  const coder = new (require('@coral-xyz/anchor').BorshCoder)(idl);
  return new EventParser(programId, coder);
}

export function parseZusdcEvents(
  logs: string[],
  programId: PublicKey
): ZusdcStatePayload[] {
  const parser = createZusdcEventParser(programId);
  const results: ZusdcStatePayload[] = [];

  for (const event of parser.parseLogs(logs)) {
    if (event.name === 'SettlementEvent') {
      const d = event.data as Record<string, unknown>;
      results.push({
        transactionId: d['transaction_id'] as string,
        counterpartyId: d['counterparty_id'] as string,
        amountUsdc: Number(d['amount_usdc']),
        eventType: d['event_type'] as string,
        timestamp: Number(d['timestamp']),
      });
    }
  }

  return results;
}
