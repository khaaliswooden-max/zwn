import { Connection, PublicKey, Context, Logs } from '@solana/web3.js';
import { parseAureonEvents } from '../parsers/aureon-parser';
import { writeProcurementState } from '../writers/procurement-writer';
import { evaluateAndPropagate } from '../causal/propagation-engine';
import { Driver } from 'neo4j-driver';

export function startAureonListener(connection: Connection, driver: Driver): void {
  const programId = new PublicKey(process.env['AUREON_PROGRAM_ID']!);

  connection.onLogs(
    programId,
    async (logs: Logs, ctx: Context) => {
      if (logs.err) return;

      const events = parseAureonEvents(logs.logs, programId);
      for (const event of events) {
        try {
          const substrateEventId = await writeProcurementState(
            driver,
            event,
            ctx.slot,
            logs.signature
          );

          // Fire-and-forget: don't block the next event on causal propagation
          evaluateAndPropagate(
            'PROCUREMENT_STATE_CHANGE',
            'aureon',
            { ...event, entityId: event.entityId },
            substrateEventId
          ).catch((pErr) => {
            const pMsg = pErr instanceof Error ? pErr.message : String(pErr);
            console.error(`[aureon-listener] Causal propagation error: ${pMsg}`);
          });
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          console.error(`[aureon-listener] Error processing event: ${msg}`);
        }
      }
    },
    'confirmed'
  );

  console.log(`[aureon-listener] Subscribed to program ${programId.toBase58()}`);
}
