import { Connection, PublicKey, Context, Logs } from '@solana/web3.js';
import { parsePodxEvents } from '../parsers/podx-parser';
import { writeComputeState } from '../writers/compute-state-writer';
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

          // writer stamps the SubstrateEvent as COMPUTE_DEGRADATION when availability < 0.90;
          // propagation engine matches on that trigger string
          const triggerType = event.availability < 0.90
            ? 'COMPUTE_DEGRADATION'
            : 'COMPUTE_STATE_UPDATE';

          await evaluateAndPropagate(
            triggerType,
            'podx',
            { nodeId: event.nodeId, availability: event.availability },
            substrateEventId
          );
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          console.error(`[podx-listener] Error: ${msg}`);
        }
      }
    },
    'confirmed'
  );

  console.log(`[podx-listener] Subscribed to program ${programId.toBase58()}`);
}
