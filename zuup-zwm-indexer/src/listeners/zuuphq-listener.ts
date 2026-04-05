import { Connection, PublicKey, Context, Logs } from '@solana/web3.js';
import { parseZuupHqEvents } from '../parsers/zuuphq-parser';
import { writeAttestation } from '../writers/attestation-writer';
import { Driver } from 'neo4j-driver';

// ZuupHQ is the trust layer — attestations are terminal events.
// They do not trigger further causal propagation.
export function startZuupHqListener(connection: Connection, driver: Driver): void {
  const programId = new PublicKey(process.env['ZUUP_HQ_PROGRAM_ID']!);

  connection.onLogs(
    programId,
    async (logs: Logs, ctx: Context) => {
      if (logs.err) return;

      const events = parseZuupHqEvents(logs.logs, programId);
      for (const event of events) {
        try {
          await writeAttestation(driver, event, ctx.slot, logs.signature);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          console.error(`[zuuphq-listener] Error: ${msg}`);
        }
      }
    },
    'confirmed'
  );

  console.log(`[zuuphq-listener] Subscribed to program ${programId.toBase58()}`);
}
