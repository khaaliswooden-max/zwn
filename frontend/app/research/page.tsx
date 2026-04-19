import fs from 'node:fs/promises';
import path from 'node:path';
import ThresholdChart, { Experiment } from '@/components/ThresholdChart';

export const dynamic = 'force-static';
export const revalidate = 60;

interface ExperimentLog {
  baseline_metric: number;
  baseline_f1: number;
  best_metric: number;
  best_f1: number;
  experiments: Experiment[];
}

async function loadLog(): Promise<ExperimentLog | null> {
  try {
    const filePath = path.join(process.cwd(), 'public', 'research', 'experiment_log.json');
    const raw = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(raw) as ExperimentLog;
  } catch {
    return null;
  }
}

export default async function ResearchPage() {
  const log = await loadLog();

  if (!log) {
    return (
      <div className="max-w-3xl mx-auto px-6 py-16 text-center">
        <div className="text-[9px] text-zwn-muted tracking-[0.3em] mb-2">AUTORESEARCH</div>
        <h1 className="text-2xl text-zwn-text font-semibold tracking-wide">No experiment log yet</h1>
        <p className="text-[13px] text-zwn-muted mt-3">
          Run <code className="font-mono text-zwn-teal">python zwm-autoresearch/run_loop.py</code> to
          generate <code className="font-mono text-zwn-amber">frontend/public/research/experiment_log.json</code>.
        </p>
      </div>
    );
  }

  const kept = log.experiments.filter((e) => e.status === 'kept');
  const improvement = log.best_f1 - log.baseline_f1;
  const improvementPct = (improvement / log.baseline_f1) * 100;

  return (
    <div className="max-w-4xl mx-auto px-6 py-12">
      {/* Header */}
      <div className="mb-10">
        <div className="text-[9px] text-zwn-muted tracking-[0.3em] mb-2">
          AUTORESEARCH · CAUSAL RULE OPTIMIZER
        </div>
        <h1 className="text-2xl text-zwn-text font-semibold tracking-wide">
          How the graph learns its own thresholds
        </h1>
        <p className="text-[13px] text-zwn-muted mt-3 max-w-2xl leading-relaxed">
          A Claude-driven loop proposes one change to{' '}
          <code className="font-mono text-zwn-text/80">train.py</code> per iteration, runs the
          experiment, and either keeps or reverts the change based on F1 delta. The kept diffs are
          the threshold config the ZWM causal engine actually ships.
        </p>
      </div>

      {/* Headline numbers */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 mb-10">
        <Stat label="BASELINE F1" value={log.baseline_f1.toFixed(4)} color="#888880" />
        <Stat label="BEST F1" value={log.best_f1.toFixed(4)} color="#1D9E75" />
        <Stat
          label="DELTA"
          value={`${improvement >= 0 ? '+' : ''}${improvement.toFixed(4)}`}
          sub={`${improvementPct >= 0 ? '+' : ''}${improvementPct.toFixed(1)}%`}
          color={improvement >= 0 ? '#1D9E75' : '#D85A30'}
        />
        <Stat
          label="ITERATIONS"
          value={String(log.experiments.length)}
          sub={`${kept.length} kept`}
          color="#7F77DD"
        />
      </div>

      {/* Chart */}
      <section className="mb-10 border border-zwn-border rounded-lg bg-zwn-surface p-5">
        <div className="flex items-baseline justify-between mb-3">
          <div>
            <h2 className="text-[11px] text-zwn-text font-semibold tracking-widest">F1 TRAJECTORY</h2>
            <p className="text-[10px] text-zwn-muted mt-1">
              Each point is one experiment. Filled teal = kept, faded grey = reverted.
            </p>
          </div>
        </div>
        <ThresholdChart
          baselineF1={log.baseline_f1}
          bestF1={log.best_f1}
          experiments={log.experiments}
        />
      </section>

      {/* Kept experiments */}
      <section className="mb-10">
        <h2 className="text-[11px] text-zwn-text font-semibold tracking-widest mb-3">
          KEPT DIFFS ({kept.length})
        </h2>
        <div className="space-y-2">
          {kept.map((e) => (
            <div
              key={e.iteration}
              className="flex items-start gap-4 border border-zwn-teal/15 bg-zwn-teal/5 rounded px-4 py-2.5"
            >
              <div className="text-[10px] text-zwn-teal font-mono shrink-0 w-12">
                iter {String(e.iteration).padStart(2, '0')}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[12px] text-zwn-text leading-snug">{e.description}</div>
                <div className="text-[9px] text-zwn-muted font-mono mt-1">
                  F1 {(e.f1 ?? 0).toFixed(4)}
                  {typeof e.precision === 'number' && <> · P {e.precision.toFixed(3)}</>}
                  {typeof e.recall === 'number' && <> · R {e.recall.toFixed(3)}</>}
                  {typeof e.delta === 'number' && (
                    <>
                      {' · Δ '}
                      <span className={e.delta < 0 ? 'text-zwn-teal' : 'text-zwn-coral'}>
                        {e.delta >= 0 ? '+' : ''}
                        {e.delta.toFixed(4)}
                      </span>
                    </>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* All experiments table */}
      <section className="mb-10">
        <h2 className="text-[11px] text-zwn-text font-semibold tracking-widest mb-3">
          FULL HISTORY
        </h2>
        <div className="border border-zwn-border rounded-lg overflow-hidden">
          <table className="w-full text-[11px]">
            <thead className="bg-zwn-surface">
              <tr className="text-[9px] text-zwn-muted tracking-widest">
                <th className="px-3 py-2 text-left">#</th>
                <th className="px-3 py-2 text-left">DESCRIPTION</th>
                <th className="px-3 py-2 text-right">F1</th>
                <th className="px-3 py-2 text-right">Δ</th>
                <th className="px-3 py-2 text-center">STATUS</th>
              </tr>
            </thead>
            <tbody>
              {log.experiments.map((e) => (
                <tr
                  key={e.iteration}
                  className="border-t border-zwn-border/40 hover:bg-zwn-surface/60"
                >
                  <td className="px-3 py-2 text-zwn-muted font-mono">{e.iteration}</td>
                  <td className="px-3 py-2 text-zwn-text/90">{e.description}</td>
                  <td className="px-3 py-2 text-right font-mono text-zwn-muted">
                    {typeof e.f1 === 'number' ? e.f1.toFixed(4) : '—'}
                  </td>
                  <td
                    className={`px-3 py-2 text-right font-mono ${
                      typeof e.delta === 'number' && e.delta < 0
                        ? 'text-zwn-teal'
                        : typeof e.delta === 'number' && e.delta > 0
                          ? 'text-zwn-coral'
                          : 'text-zwn-muted'
                    }`}
                  >
                    {typeof e.delta === 'number'
                      ? `${e.delta >= 0 ? '+' : ''}${e.delta.toFixed(4)}`
                      : '—'}
                  </td>
                  <td className="px-3 py-2 text-center">
                    <StatusPill status={e.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <div className="text-[10px] text-zwn-muted/60 leading-relaxed border-t border-zwn-border pt-4">
        Loop source:{' '}
        <code className="font-mono text-zwn-muted">zwm-autoresearch/run_loop.py</code> · model{' '}
        <code className="font-mono text-zwn-muted">claude-sonnet-4-6</code> · experiment log updates
        after every iteration.
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  sub,
  color,
}: {
  label: string;
  value: string;
  sub?: string;
  color: string;
}) {
  return (
    <div className="border border-zwn-border rounded bg-zwn-surface px-4 py-3">
      <div className="text-[9px] text-zwn-muted tracking-widest">{label}</div>
      <div className="text-lg font-mono mt-1" style={{ color }}>
        {value}
      </div>
      {sub && <div className="text-[9px] text-zwn-muted/70 font-mono mt-0.5">{sub}</div>}
    </div>
  );
}

function StatusPill({ status }: { status: Experiment['status'] }) {
  const config: Record<Experiment['status'], { label: string; cls: string }> = {
    kept: { label: 'KEPT', cls: 'bg-zwn-teal/15 text-zwn-teal border-zwn-teal/30' },
    reverted: { label: 'REVERTED', cls: 'bg-zwn-muted/10 text-zwn-muted border-zwn-border' },
    error: { label: 'ERROR', cls: 'bg-zwn-coral/10 text-zwn-coral border-zwn-coral/30' },
    timeout: { label: 'TIMEOUT', cls: 'bg-zwn-amber/10 text-zwn-amber border-zwn-amber/30' },
    parse_error: { label: 'PARSE', cls: 'bg-zwn-coral/10 text-zwn-coral border-zwn-coral/30' },
  };
  const c = config[status] ?? config.error;
  return (
    <span
      className={`inline-block px-1.5 py-0.5 rounded border text-[8px] font-mono tracking-widest ${c.cls}`}
    >
      {c.label}
    </span>
  );
}
