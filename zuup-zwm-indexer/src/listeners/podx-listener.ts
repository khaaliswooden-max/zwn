import { Connection, PublicKey, Logs, Context } from '@solana/web3.js';
import { parsePodxEvents } from '../parsers/podx-parser';
import { writeComputeState } from '../writers/compute-writer';
import { evaluateAndPropagate } from '../causal/propagation-engine';
import { Driver } from 'neo4j-driver';

export function startPodxListener(connection: Connection, driver: Driver): void {
  const programId = new PublicKey(process.env['PODX_PROGRAM_ID']!);

  connection.onLogs(
    programId,
    async (logs: Logs, ctx: Context) => {
      if (logs.err) return;

      const events = parsePodxEvents(logs.logs, programId);
      for (const event of events) {
        try {
          const substrateEventId = await writeComputeState(
            driver, event, ctx.slot, logs.signature
          );

          // Fire-and-forget: don't block the next event on causal propagation
          evaluateAndPropagate(
            'COMPUTE_DEGRADATION', 'podx',
            { ...event, entityId: event.nodeId, availability: event.availability },
            substrateEventId
          ).catch((pErr) => {
            const pMsg = pErr instanceof Error ? pErr.message : String(pErr);
            console.error(`[podx-listener] Causal propagation error: ${pMsg}`);
          });
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          console.error(`[podx-listener] Error processing event: ${msg}`);
        }
      }
    },
    'confirmed'
  );

  console.log(`[podx-listener] Subscribed to program ${programId.toBase58()}`);
}
