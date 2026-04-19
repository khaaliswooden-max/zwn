import { Connection, PublicKey, Logs, Context } from '@solana/web3.js';
import { parseSymbionEvents } from '../parsers/symbion-parser';
import { writeBiologicalState } from '../writers/biological-writer';
import { evaluateAndPropagate, publishAnomalyScore } from '../causal/propagation-engine';
import { detectBiologicalAnomaly, writeAnomalyScore } from '../nn/anomaly-client';
import { Driver } from 'neo4j-driver';
import { metrics } from '../lib/metrics';

const PLATFORM = 'symbion';

export function startSymbionListener(connection: Connection, driver: Driver): void {
  const programId = new PublicKey(process.env['SYMBION_PROGRAM_ID']!);

  connection.onLogs(
    programId,
    async (logs: Logs, ctx: Context) => {
      if (logs.err) return;

      const events = parseSymbionEvents(logs.logs, programId);
      for (const event of events) {
        const writeStart = Date.now();
        try {
          const { stateId: biologicalStateId, eventId: substrateEventId } =
            await writeBiologicalState(driver, event, ctx.slot, logs.signature);

          metrics.eventsProcessed.inc({ platform: PLATFORM });
          metrics.writeLatencyMs.observe({ platform: PLATFORM }, Date.now() - writeStart);
          metrics.lastEventTimestamp.set({ platform: PLATFORM }, Date.now());

          // --- Neural network anomaly detection (non-blocking) ---
          // Runs in parallel with causal propagation. If nn-service is down,
          // detectBiologicalAnomaly returns null and we fall back to the
          // existing threshold-based rules in causal-rules.ts.
          const nnDetection = detectBiologicalAnomaly(
            {
              serotonin: event.serotoninNm,
              dopamine: event.dopamineNm,
              cortisol: event.cortisolNm,
              gaba: event.gabaNm,
            },
            event.subjectId,
            substrateEventId,
          );

          // Build causal payload — enrich with NN score if available
          const propagate = async () => {
            const nnResult = await nnDetection;

            // Write AnomalyScore node to Neo4j if NN returned a result
            if (nnResult) {
              writeAnomalyScore(driver, {
                entityId: event.subjectId,
                substrate: 'biological',
                anomalyScore: nnResult.anomaly_score,
                rawScore: nnResult.raw_score,
                isAnomaly: nnResult.is_anomaly,
                modelVersion: nnResult.model_version,
                substrateEventId,
                biologicalStateId,
              }).catch((writeErr) => {
                const wMsg = writeErr instanceof Error ? writeErr.message : String(writeErr);
                console.error(`[${PLATFORM}-listener] AnomalyScore write error: ${wMsg}`);
              });

              // Push to SSE bus so browsers can flash the affected cluster
              // without waiting for the subsequent causal propagation.
              publishAnomalyScore({
                substrateEventId,
                entityId: event.subjectId,
                substrate: 'biological',
                anomalyScore: nnResult.anomaly_score,
                isAnomaly: nnResult.is_anomaly,
                modelVersion: nnResult.model_version,
              });
            }

            // Pass both the original event data and the NN anomaly score
            // to the causal engine. Rules can use either:
            //   - event.severity (original on-chain flag)
            //   - anomalyScore (continuous NN score, 0.0-1.0)
            await evaluateAndPropagate(
              'BIOLOGICAL_ANOMALY', PLATFORM,
              {
                ...event,
                entityId: event.subjectId,
                severity: event.severity,
                anomalyScore: nnResult?.anomaly_score ?? null,
                nnIsAnomaly: nnResult?.is_anomaly ?? null,
                modelVersion: nnResult?.model_version ?? null,
              },
              substrateEventId,
            );
          };

          propagate().catch((pErr) => {
            const pMsg = pErr instanceof Error ? pErr.message : String(pErr);
            console.error(`[${PLATFORM}-listener] Causal propagation error: ${pMsg}`);
          });
        } catch (err) {
          metrics.eventsFailed.inc({ platform: PLATFORM });
          const msg = err instanceof Error ? err.message : String(err);
          console.error(`[${PLATFORM}-listener] Error processing event: ${msg}`);
        }
      }
    },
    'confirmed'
  );

  console.log(`[${PLATFORM}-listener] Subscribed to program ${programId.toBase58()}`);
}
