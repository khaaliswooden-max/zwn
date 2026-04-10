import { Connection, PublicKey, Logs, Context } from '@solana/web3.js';
import { parseVeyraEvents } from '../parsers/veyra-parser';
import { writeReasoningState } from '../writers/reasoning-writer';
import { Driver } from 'neo4j-driver';

export function startVeyraListener(connection: Connection, driver: Driver): void {
  const programId = new PublicKey(process.env['VEYRA_PROGRAM_ID']!);

  connection.onLogs(
    programId,
    async (logs: Logs, ctx: Context) => {
      if (logs.err) return;

      const events = parseVeyraEvents(logs.logs, programId);
      for (const event of events) {
        try {
          await writeReasoningState(driver, event, ctx.slot, logs.signature);
          // Veyra is a terminal node — no causal propagation from reasoning output
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          console.error(`[veyra-listener] Error processing event: ${msg}`);
        }
      }
    },
    'confirmed'
  );

  console.log(`[veyra-listener] Subscribed to program ${programId.toBase58()}`);
}
