import { Connection, PublicKey, Logs, Context } from '@solana/web3.js';
import { parseZuuphqEvents } from '../parsers/zuuphq-parser';
import { writeAttestation } from '../writers/attestation-writer';
import { Driver } from 'neo4j-driver';
import { metrics } from '../lib/metrics';

const PLATFORM = 'zuuphq';

export function startZuuphqListener(connection: Connection, driver: Driver): void {
  const programId = new PublicKey(process.env['ZUUPHQ_PROGRAM_ID']!);

  connection.onLogs(
    programId,
    async (logs: Logs, ctx: Context) => {
      if (logs.err) return;

      const events = parseZuuphqEvents(logs.logs, programId);
      for (const event of events) {
        const writeStart = Date.now();
        try {
          await writeAttestation(driver, event, ctx.slot, logs.signature);

          metrics.eventsProcessed.inc({ platform: PLATFORM });
          metrics.writeLatencyMs.observe({ platform: PLATFORM }, Date.now() - writeStart);
          metrics.lastEventTimestamp.set({ platform: PLATFORM }, Date.now());
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
