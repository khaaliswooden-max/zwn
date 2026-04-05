import { Connection, PublicKey, Context, Logs } from '@solana/web3.js';
import { parseVeyraEvents } from '../parsers/veyra-parser';
import { writeReasoningEvent } from '../writers/reasoning-writer';
import { Driver } from 'neo4j-driver';

// Veyra is a causal endpoint — its ReasoningComplete events are recorded
// as SubstrateEvents but do not trigger further causal propagation.
export function startVeyraListener(connection: Connection, driver: Driver): void {
  const programId = new PublicKey(process.env['VEYRA_PROGRAM_ID']!);

  connection.onLogs(
    programId,
    async (logs: Logs, ctx: Context) => {
      if (logs.err) return;

      const events = parseVeyraEvents(logs.logs, programId);
      for (const event of events) {
        try {
          await writeReasoningEvent(driver, event, ctx.slot, logs.signature);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          console.error(`[veyra-listener] Error: ${msg}`);
        }
      }
    },
    'confirmed'
  );

  console.log(`[veyra-listener] Subscribed to program ${programId.toBase58()}`);
}
