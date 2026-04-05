import { Connection, PublicKey, Context, Logs } from '@solana/web3.js';
import { parseSymbionEvents } from '../parsers/symbion-parser';
import { writeBiologicalState } from '../writers/biological-state-writer';
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

          // Only fire causal propagation for anomalies — writer already sets
          // SubstrateEvent.type to BIOLOGICAL_ANOMALY when anomaly_flag is true
          if (event.anomalyFlag) {
            await evaluateAndPropagate(
              'BIOLOGICAL_ANOMALY',
              'symbion',
              { subjectId: event.subjectId, severity: event.severity },
              substrateEventId
            );
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          console.error(`[symbion-listener] Error: ${msg}`);
        }
      }
    },
    'confirmed'
  );

  console.log(`[symbion-listener] Subscribed to program ${programId.toBase58()}`);
}
