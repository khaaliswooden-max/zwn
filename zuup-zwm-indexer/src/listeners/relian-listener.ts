import { Connection, PublicKey, Context, Logs } from '@solana/web3.js';
import { parseRelianEvents } from '../parsers/relian-parser';
import { writeMigrationState } from '../writers/migration-state-writer';
import { evaluateAndPropagate } from '../causal/propagation-engine';
import { Driver } from 'neo4j-driver';

export function startRelianListener(connection: Connection, driver: Driver): void {
  const programId = new PublicKey(process.env['RELIAN_PROGRAM_ID']!);

  connection.onLogs(
    programId,
    async (logs: Logs, ctx: Context) => {
      if (logs.err) return;

      const events = parseRelianEvents(logs.logs, programId);
      for (const event of events) {
        try {
          const substrateEventId = await writeMigrationState(
            driver, event, ctx.slot, logs.signature
          );

          await evaluateAndPropagate(
            'MIGRATION_COMPLETE',
            'relian',
            {
              projectId: event.projectId,
              semanticPreservation: event.semanticPreservation,
              artifactHash: event.artifactHash,
            },
            substrateEventId
          );
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          console.error(`[relian-listener] Error: ${msg}`);
        }
      }
    },
    'confirmed'
  );

  console.log(`[relian-listener] Subscribed to program ${programId.toBase58()}`);
}
