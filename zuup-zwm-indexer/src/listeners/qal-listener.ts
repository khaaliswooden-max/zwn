import { Connection, PublicKey, Logs, Context } from '@solana/web3.js';
import { parseQalEvents } from '../parsers/qal-parser';
import { writeHistoricalRecon } from '../writers/historical-writer';
import { evaluateAndPropagate } from '../causal/propagation-engine';
import { Driver } from 'neo4j-driver';
import { metrics } from '../lib/metrics';

const PLATFORM = 'qal';

export function startQalListener(connection: Connection, driver: Driver): void {
  const programId = new PublicKey(process.env['QAL_PROGRAM_ID']!);

  connection.onLogs(
    programId,
    async (logs: Logs, ctx: Context) => {
      if (logs.err) return;

      const events = parseQalEvents(logs.logs, programId);
      for (const event of events) {
        const writeStart = Date.now();
        try {
          const substrateEventId = await writeHistoricalRecon(
            driver, event, ctx.slot, logs.signature
          );

          metrics.eventsProcessed.inc({ platform: PLATFORM });
          metrics.writeLatencyMs.observe({ platform: PLATFORM }, Date.now() - writeStart);
          metrics.lastEventTimestamp.set({ platform: PLATFORM }, Date.now());

          evaluateAndPropagate(
            'RECONSTRUCTION_COMPLETE', PLATFORM,
            { ...event, entityId: event.entityId },
            substrateEventId
          ).catch((pErr) => {
            const pMsg = pErr instanceof Error ? pErr.message : String(pErr);
            console.error(`[${PLATFORM}-listener] Causal propagation error: ${pMsg}`);
          });
        } catch (err) {
          metrics.eventsFailed.inc({ platform: PLATFORM });
          const msg = err instanceof Error ? err.message : String(err);
          console.error(`[${PLATFORM}-listener] Error processing event: ${msg}`);
        }
      }
    },
    'confirmed'
  );

  console.log(`[${PLATFORM}-listener] Subscribed to program ${programId.toBase58()}`);
}
