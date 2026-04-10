import { Connection, PublicKey, Logs, Context } from '@solana/web3.js';
import { parseQalEvents } from '../parsers/qal-parser';
import { writeHistoricalRecon } from '../writers/historical-writer';
import { evaluateAndPropagate } from '../causal/propagation-engine';
import { Driver } from 'neo4j-driver';

export function startQalListener(connection: Connection, driver: Driver): void {
  const programId = new PublicKey(process.env['QAL_PROGRAM_ID']!);

  connection.onLogs(
    programId,
    async (logs: Logs, ctx: Context) => {
      if (logs.err) return;

      const events = parseQalEvents(logs.logs, programId);
      for (const event of events) {
        try {
          const substrateEventId = await writeHistoricalRecon(
            driver, event, ctx.slot, logs.signature
          );

          await evaluateAndPropagate(
            'RECONSTRUCTION_COMPLETE', 'qal',
            { ...event, entityId: event.entityId },
            substrateEventId
          );
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          console.error(`[qal-listener] Error processing event: ${msg}`);
        }
      }
    },
    'confirmed'
  );

  console.log(`[qal-listener] Subscribed to program ${programId.toBase58()}`);
}
