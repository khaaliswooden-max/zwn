import fs from 'node:fs/promises';
import path from 'node:path';

export const dynamic = 'force-static';
export const revalidate = 300;

interface BriefItem {
  headline: string;
  detail: string;
  source_url?: string;
}

interface ResearchItem {
  title: string;
  detail: string;
  url?: string;
}

interface UseCase {
  company: string;
  what_they_did: string;
  outcome: string;
}

interface DailyBrief {
  date: string;
  model?: string;
  generated_at?: string;
  whats_new: BriefItem[];
  ten_x_improvement: {
    title: string;
    summary: string;
    affected_platforms: string[];
    implementation_steps: string[];
    thirty_day_plan?: Record<string, string>;
    financial_impact: string;
  };
  research_backing: ResearchItem[];
  use_cases: {
    successful: UseCase[];
    failed: UseCase[];
  };
}

async function loadBrief(): Promise<DailyBrief | null> {
  try {
    const filePath = path.join(process.cwd(), 'public', 'brief', 'latest.json');
    const raw = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(raw) as DailyBrief;
  } catch {
    return null;
  }
}

export default async function BriefPage() {
  const brief = await loadBrief();

  if (!brief) {
    return (
      <div className="max-w-3xl mx-auto px-6 py-16 text-center">
        <div className="text-[9px] text-zwn-muted tracking-[0.3em] mb-2">DAILY BRIEF</div>
        <h1 className="text-2xl text-zwn-text font-semibold tracking-wide">No brief yet</h1>
        <p className="text-[13px] text-zwn-muted mt-3">
          Run{' '}
          <code className="font-mono text-zwn-teal">
            node zwm-daily/zwm-daily.mjs --json-out frontend/public/brief/latest.json
          </code>{' '}
          to generate today&apos;s brief.
        </p>
      </div>
    );
  }

  const plan = brief.ten_x_improvement.thirty_day_plan ?? {};

  return (
    <div className="max-w-3xl mx-auto px-6 py-12">
      {/* Header */}
      <div className="mb-10">
        <div className="text-[9px] text-zwn-muted tracking-[0.3em] mb-2">
          ZWM DAILY 10X BRIEF · {brief.date}
        </div>
        <h1 className="text-2xl text-zwn-text font-semibold tracking-wide leading-snug">
          {brief.ten_x_improvement.title}
        </h1>
        {brief.model && (
          <div className="text-[9px] text-zwn-muted/60 font-mono mt-3">
            model {brief.model}
            {brief.generated_at && <> · generated {brief.generated_at.slice(0, 16).replace('T', ' ')}</>}
          </div>
        )}
      </div>

      {/* Summary */}
      <section className="mb-10 border border-zwn-purple/20 bg-zwn-purple/5 rounded-lg p-5">
        <div className="text-[9px] text-zwn-purple tracking-widest mb-2">THE MOVE</div>
        <p className="text-[13px] text-zwn-text/95 leading-relaxed">{brief.ten_x_improvement.summary}</p>
        <div className="flex flex-wrap gap-1.5 mt-4">
          {brief.ten_x_improvement.affected_platforms.map((p) => (
            <span
              key={p}
              className="text-[9px] font-mono px-2 py-0.5 rounded bg-zwn-amber/10 text-zwn-amber border border-zwn-amber/20"
            >
              {p}
            </span>
          ))}
        </div>
      </section>

      {/* Implementation steps */}
      <section className="mb-10">
        <h2 className="text-[11px] text-zwn-text font-semibold tracking-widest mb-3">
          IMPLEMENTATION STEPS
        </h2>
        <ol className="space-y-2">
          {brief.ten_x_improvement.implementation_steps.map((step, i) => (
            <li key={i} className="flex gap-3">
              <span className="text-[10px] text-zwn-teal font-mono shrink-0 w-6 pt-0.5">
                {String(i + 1).padStart(2, '0')}
              </span>
              <span className="text-[12px] text-zwn-text/90 leading-relaxed">{step}</span>
            </li>
          ))}
        </ol>
      </section>

      {/* 30-day plan */}
      {Object.keys(plan).length > 0 && (
        <section className="mb-10">
          <h2 className="text-[11px] text-zwn-text font-semibold tracking-widest mb-3">
            30-DAY PLAN
          </h2>
          <div className="border border-zwn-border rounded-lg overflow-hidden">
            <table className="w-full text-[11px]">
              <tbody>
                {(['week_1', 'week_2', 'week_3', 'week_4'] as const).map((key, i) => (
                  <tr key={key} className="border-t border-zwn-border/40 first:border-t-0">
                    <td className="px-3 py-3 font-mono text-zwn-teal w-20 align-top">
                      Week {i + 1}
                    </td>
                    <td className="px-3 py-3 text-zwn-text/90 leading-relaxed">
                      {plan[key] ?? '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Financial impact */}
      <section className="mb-10 border-l-2 border-zwn-teal/60 pl-4">
        <h2 className="text-[11px] text-zwn-teal font-semibold tracking-widest mb-2">
          FINANCIAL IMPACT
        </h2>
        <p className="text-[12px] text-zwn-text/90 leading-relaxed">
          {brief.ten_x_improvement.financial_impact}
        </p>
      </section>

      {/* What's new */}
      <section className="mb-10">
        <h2 className="text-[11px] text-zwn-text font-semibold tracking-widest mb-3">
          WHAT&apos;S NEW
        </h2>
        <div className="space-y-4">
          {brief.whats_new.map((item, i) => (
            <div key={i}>
              <div className="text-[12px] text-zwn-text font-medium leading-snug">
                {item.headline}
              </div>
              <div className="text-[11px] text-zwn-muted mt-1 leading-relaxed">{item.detail}</div>
              {item.source_url && (
                <a
                  href={item.source_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[9px] font-mono text-zwn-purple/80 hover:text-zwn-purple mt-1 inline-block break-all"
                >
                  {item.source_url}
                </a>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* Research backing */}
      <section className="mb-10">
        <h2 className="text-[11px] text-zwn-text font-semibold tracking-widest mb-3">
          RESEARCH BACKING
        </h2>
        <div className="space-y-3">
          {brief.research_backing.map((r, i) => (
            <div key={i} className="border border-zwn-border rounded p-3">
              <div className="text-[11px] text-zwn-text font-medium">{r.title}</div>
              <div className="text-[10px] text-zwn-muted mt-1 leading-relaxed">{r.detail}</div>
              {r.url && (
                <a
                  href={r.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[9px] font-mono text-zwn-purple/80 hover:text-zwn-purple mt-1 inline-block break-all"
                >
                  {r.url}
                </a>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* Use cases */}
      <section className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
        <UseCaseColumn label="SUCCESSFUL" color="#1D9E75" cases={brief.use_cases.successful} />
        <UseCaseColumn label="FAILED" color="#D85A30" cases={brief.use_cases.failed} />
      </section>

      <div className="text-[10px] text-zwn-muted/60 leading-relaxed border-t border-zwn-border pt-4">
        Source:{' '}
        <code className="font-mono text-zwn-muted">
          zwm-daily/zwm-daily.mjs --json-out frontend/public/brief/latest.json
        </code>
      </div>
    </div>
  );
}

function UseCaseColumn({
  label,
  color,
  cases,
}: {
  label: string;
  color: string;
  cases: UseCase[];
}) {
  return (
    <div>
      <div
        className="text-[10px] font-semibold tracking-widest mb-2"
        style={{ color }}
      >
        {label}
      </div>
      <div className="space-y-3">
        {cases.map((c, i) => (
          <div key={i} className="border border-zwn-border rounded p-3">
            <div className="text-[11px] text-zwn-text font-medium">{c.company}</div>
            <div className="text-[10px] text-zwn-muted mt-1 leading-relaxed">{c.what_they_did}</div>
            <div className="text-[10px] text-zwn-text/80 italic mt-2 leading-relaxed">
              {c.outcome}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
