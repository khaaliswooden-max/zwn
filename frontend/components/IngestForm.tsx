'use client';

import { useState } from 'react';
import { PLATFORMS, PLATFORM_ACTIONS, ACTION_CAUSAL_DESC, ACTION_FIELDS } from '@/lib/constants';
import { postIngest } from '@/lib/api';
import CodeBlock from './CodeBlock';

export default function IngestForm() {
  const [platform, setPlatform] = useState<string>(PLATFORMS[0]);
  const [action, setAction] = useState<string>(PLATFORM_ACTIONS[PLATFORMS[0]]![0]!);
  const [values, setValues] = useState<Record<string, string>>({});
  const [result, setResult] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(false);

  const handlePlatformChange = (p: string) => {
    setPlatform(p);
    const first = PLATFORM_ACTIONS[p]?.[0] ?? '';
    setAction(first);
    setValues({});
    setResult(null);
  };

  const handleActionChange = (a: string) => {
    setAction(a);
    setValues({});
    setResult(null);
  };

  const setValue = (name: string, val: string) =>
    setValues((v) => ({ ...v, [name]: val }));

  const submit = async () => {
    setLoading(true);
    try {
      const params: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(values)) {
        const field = ACTION_FIELDS[action]?.find((f) => f.name === k);
        if (field?.type === 'number') {
          params[k] = Number(v);
        } else if (v === 'true') {
          params[k] = true;
        } else if (v === 'false') {
          params[k] = false;
        } else {
          params[k] = v;
        }
      }
      const res = await postIngest(platform, action, params);
      setResult(res);
    } finally {
      setLoading(false);
    }
  };

  const fields = ACTION_FIELDS[action] ?? [];
  const causalDesc = ACTION_CAUSAL_DESC[action] ?? '';

  return (
    <div className="flex flex-col gap-4 max-w-xl">
      {/* Platform + Action row */}
      <div className="flex gap-3 flex-wrap">
        <div>
          <label className="text-[9px] text-zwn-muted tracking-widest block mb-1">PLATFORM</label>
          <select
            value={platform}
            onChange={(e) => handlePlatformChange(e.target.value)}
            className="bg-zwn-surface text-zwn-text border border-zwn-border rounded px-3 py-2 text-[11px] outline-none cursor-pointer"
          >
            {PLATFORMS.map((p) => (
              <option key={p} value={p} className="bg-zwn-bg">
                {p}
              </option>
            ))}
          </select>
        </div>

        <div className="flex-1 min-w-[200px]">
          <label className="text-[9px] text-zwn-muted tracking-widest block mb-1">ACTION</label>
          <select
            value={action}
            onChange={(e) => handleActionChange(e.target.value)}
            className="w-full bg-zwn-surface text-zwn-text border border-zwn-border rounded px-3 py-2 text-[11px] outline-none cursor-pointer"
          >
            {(PLATFORM_ACTIONS[platform] ?? []).map((a) => (
              <option key={a} value={a} className="bg-zwn-bg">
                {a}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Causal description */}
      {causalDesc && (
        <div className="text-[10px] text-zwn-muted border-l-2 border-zwn-coral pl-3 py-0.5">
          {causalDesc}
        </div>
      )}

      {/* Fields */}
      {fields.map((field) => (
        <div key={field.name}>
          <label className="text-[9px] text-zwn-muted tracking-widest block mb-1">
            {field.label}
          </label>
          {field.type === 'select' && field.options ? (
            <select
              value={values[field.name] ?? ''}
              onChange={(e) => setValue(field.name, e.target.value)}
              className="w-full bg-zwn-surface text-zwn-text border border-zwn-border rounded px-3 py-2 text-[11px] outline-none cursor-pointer"
            >
              <option value="" className="bg-zwn-bg text-zwn-muted">
                select...
              </option>
              {field.options.map((o) => (
                <option key={o} value={o} className="bg-zwn-bg">
                  {o}
                </option>
              ))}
            </select>
          ) : (
            <input
              type={field.type === 'number' ? 'number' : 'text'}
              value={values[field.name] ?? ''}
              onChange={(e) => setValue(field.name, e.target.value)}
              placeholder={field.placeholder}
              className="w-full bg-zwn-surface text-zwn-text border border-zwn-border rounded px-3 py-2 text-[11px] outline-none placeholder-zwn-border focus:border-zwn-teal transition-colors"
            />
          )}
        </div>
      ))}

      <button
        onClick={submit}
        disabled={loading}
        className="self-start text-[11px] tracking-widest text-zwn-bg bg-zwn-teal rounded px-4 py-2 hover:opacity-90 transition-opacity disabled:opacity-50"
      >
        {loading ? 'submitting...' : 'submit →'}
      </button>

      {result !== null && (
        <div>
          <div className="text-[9px] text-zwn-muted tracking-widest mb-1">RESPONSE</div>
          <CodeBlock data={result} />
        </div>
      )}
    </div>
  );
}
