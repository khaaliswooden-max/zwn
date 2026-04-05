import { Connection, PublicKey, Context, Logs } from '@solana/web3.js';
import { parseZusdcEvents } from '../parsers/zusdc-parser';
import { writeSettlementRecord } from '../writers/settlement-writer';
import { Driver } from 'neo4j-driver';

// ZUSDC is a causal endpoint (receives FLAG_SETTLEMENT from civium/aureon).
// Its on-chain events are recorded but do not trigger further causal rules.
export function startZusdcListener(connection: Connection, driver: Driver): void {
  const programId = new PublicKey(process.env['ZUSDC_PROGRAM_ID']!);

  connection.onLogs(
    programId,
    async (logs: Logs, ctx: Context) => {
      if (logs.err) return;

      const events = parseZusdcEvents(logs.logs, programId);
      for (const event of events) {
        try {
          await writeSettlementRecord(driver, event, ctx.slot, logs.signature);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          console.error(`[zusdc-listener] Error: ${msg}`);
        }
      }
    },
    'confirmed'
  );

  console.log(`[zusdc-listener] Subscribed to program ${programId.toBase58()}`);
}
