import { Connection, PublicKey, Logs, Context } from '@solana/web3.js';
import { parseSymbionEvents } from '../parsers/symbion-parser';
import { writeBiologicalState } from '../writers/biological-writer';
import { evaluateAndPropagate } from '../causal/propagation-engine';
import { Driver } from 'neo4j-driver';

export function startSymbionListener(connection: Connection, driver: Driver): void {
  const programId = new PublicKey(process.env['SYMBION_PROGRAM_ID']!);

  connection.onLogs(
    programId,
    async (logs: Logs, ctx: Context) => {
      if (logs.err) return;

      const events = parseSymbionEvents(logs.logs, programId);
      for (const event of events) {
        try {
          const substrateEventId = await writeBiologicalState(
            driver, event, ctx.slot, logs.signature
          );

          // Fire-and-forget: don't block the next event on causal propagation
          evaluateAndPropagate(
            'BIOLOGICAL_ANOMALY', 'symbion',
            { ...event, entityId: event.subjectId, severity: event.severity },
            substrateEventId
          ).catch((pErr) => {
            const pMsg = pErr instanceof Error ? pErr.message : String(pErr);
            console.error(`[symbion-listener] Causal propagation error: ${pMsg}`);
          });
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          console.error(`[symbion-listener] Error processing event: ${msg}`);
        }
      }
    },
    'confirmed'
  );

  console.log(`[symbion-listener] Subscribed to program ${programId.toBase58()}`);
}
