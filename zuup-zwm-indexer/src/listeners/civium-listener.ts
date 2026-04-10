import { Connection, PublicKey, Context, Logs } from '@solana/web3.js';
import { parseCiviumEvents } from '../parsers/civium-parser';
import { writeComplianceState } from '../writers/compliance-writer';
import { evaluateAndPropagate } from '../causal/propagation-engine';
import { Driver } from 'neo4j-driver';
import { metrics } from '../lib/metrics';

const PLATFORM = 'civium';

export function startCiviumListener(connection: Connection, driver: Driver): void {
  const programId = new PublicKey(process.env['CIVIUM_PROGRAM_ID']!);

  connection.onLogs(
    programId,
    async (logs: Logs, ctx: Context) => {
      if (logs.err) return;

      const events = parseCiviumEvents(logs.logs, programId);
      for (const event of events) {
        const writeStart = Date.now();
        try {
          const substrateEventId = await writeComplianceState(
            driver, event, ctx.slot, logs.signature
          );

          metrics.eventsProcessed.inc({ platform: PLATFORM });
          metrics.writeLatencyMs.observe({ platform: PLATFORM }, Date.now() - writeStart);
          metrics.lastEventTimestamp.set({ platform: PLATFORM }, Date.now());

          evaluateAndPropagate(
            'COMPLIANCE_STATE_CHANGE', PLATFORM,
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
