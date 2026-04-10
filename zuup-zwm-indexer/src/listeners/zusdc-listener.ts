import { Connection, PublicKey, Logs, Context } from '@solana/web3.js';
import { parseZusdcEvents } from '../parsers/zusdc-parser';
import { writeSettlementRecord } from '../writers/settlement-writer';
import { evaluateAndPropagate } from '../causal/propagation-engine';
import { Driver } from 'neo4j-driver';

export function startZusdcListener(connection: Connection, driver: Driver): void {
  const programId = new PublicKey(process.env['ZUSDC_PROGRAM_ID']!);

  connection.onLogs(
    programId,
    async (logs: Logs, ctx: Context) => {
      if (logs.err) return;

      const events = parseZusdcEvents(logs.logs, programId);
      for (const event of events) {
        try {
          const substrateEventId = await writeSettlementRecord(
            driver, event, ctx.slot, logs.signature
          );

          // Fire-and-forget: don't block the next event on causal propagation
          evaluateAndPropagate(
            'SETTLEMENT_EVENT', 'zusdc',
            { ...event, entityId: event.counterpartyId, amount: event.amountUsdc },
            substrateEventId
          ).catch((pErr) => {
            const pMsg = pErr instanceof Error ? pErr.message : String(pErr);
            console.error(`[zusdc-listener] Causal propagation error: ${pMsg}`);
          });
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          console.error(`[zusdc-listener] Error processing event: ${msg}`);
        }
      }
    },
    'confirmed'
  );

  console.log(`[zusdc-listener] Subscribed to program ${programId.toBase58()}`);
}
