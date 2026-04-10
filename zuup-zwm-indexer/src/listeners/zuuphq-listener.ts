import { Connection, PublicKey, Logs, Context } from '@solana/web3.js';
import { parseZuuphqEvents } from '../parsers/zuuphq-parser';
import { writeAttestation } from '../writers/attestation-writer';
import { Driver } from 'neo4j-driver';

export function startZuuphqListener(connection: Connection, driver: Driver): void {
  const programId = new PublicKey(process.env['ZUUPHQ_PROGRAM_ID']!);

  connection.onLogs(
    programId,
    async (logs: Logs, ctx: Context) => {
      if (logs.err) return;

      const events = parseZuuphqEvents(logs.logs, programId);
      for (const event of events) {
        try {
          await writeAttestation(driver, event, ctx.slot, logs.signature);
          // ZuupHQ is a trust anchor — attestations don't trigger causal propagation
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          console.error(`[zuuphq-listener] Error processing event: ${msg}`);
        }
      }
    },
    'confirmed'
  );

  console.log(`[zuuphq-listener] Subscribed to program ${programId.toBase58()}`);
}
