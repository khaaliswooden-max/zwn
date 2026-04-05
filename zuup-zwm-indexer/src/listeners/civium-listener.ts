import { Connection, PublicKey, Context, Logs } from '@solana/web3.js';
import { parseCiviumEvents } from '../parsers/civium-parser';
import { writeComplianceState } from '../writers/compliance-writer';
import { evaluateAndPropagate } from '../causal/propagation-engine';
import { Driver } from 'neo4j-driver';

export function startCiviumListener(connection: Connection, driver: Driver): void {
  const programId = new PublicKey(process.env['CIVIUM_PROGRAM_ID']!);

  connection.onLogs(
    programId,
    async (logs: Logs, ctx: Context) => {
      if (logs.err) return;

      const events = parseCiviumEvents(logs.logs, programId);
      for (const event of events) {
        try {
          const substrateEventId = await writeComplianceState(
            driver,
            event,
            ctx.slot,
            logs.signature
          );

          await evaluateAndPropagate(
            'COMPLIANCE_STATE_CHANGE',
            'civium',
            { ...event, entityId: event.entityId },
            substrateEventId
          );
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          console.error(`[civium-listener] Error processing event: ${msg}`);
        }
      }
    },
    'confirmed'
  );

  console.log(`[civium-listener] Subscribed to program ${programId.toBase58()}`);
}
