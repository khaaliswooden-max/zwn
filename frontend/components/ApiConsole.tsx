'use client';

import { useState, useCallback } from 'react';
import { CONSOLE_ENDPOINTS, type EndpointDef } from '@/lib/constants';
import { rawApiFetch } from '@/lib/api';
import CodeBlock from './CodeBlock';

export default function ApiConsole() {
  const [endpointIdx, setEndpointIdx] = useState(0);
  const [params, setParams] = useState<Record<string, string>>({});
  const [body, setBody] = useState('{\n  "track": "API_ACCESS"\n}');
  const [result, setResult] = useState<{ data: unknown; status: number; latencyMs: number } | null>(null);
  const [loading, setLoading] = useState(false);

  const endpoint: EndpointDef = CONSOLE_ENDPOINTS[endpointIdx]!;

  const setParam = (name: string, value: string) =>
    setParams((p) => ({ ...p, [name]: value }));

  const buildPath = useCallback(() => {
    let path = endpoint.path;
    for (const p of endpoint.params) {
      if (p.inPath && params[p.name]) {
        path = path.replace(`{${p.name}}`, encodeURIComponent(params[p.name]!));
      }
    }
    // Append query params (non-path)
    const qs = endpoint.params
      .filter((p) => !p.inPath && params[p.name])
      .map((p) => `${p.name}=${encodeURIComponent(params[p.name]!)}`)
      .join('&');
    return qs ? `${path}?${qs}` : path;
  }, [endpoint, params]);

  const fire = async () => {
    setLoading(true);
    try {
      const path = buildPath();
      const res = await rawApiFetch(
        endpoint.method,
        path,
        endpoint.needsBody ? body : undefined
      );
      setResult(res);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void fire();
    }
  };

  return (
    <div className="flex flex-col lg:flex-row gap-4 h-full">
      {/* Left — request */}
      <div className="flex flex-col gap-3 lg:w-1/2">
        {/* Endpoint selector */}
        <div>
          <label className="text-[9px] text-zwn-muted tracking-widest block mb-1">ENDPOINT</label>
          <select
            value={endpointIdx}
            onChange={(e) => {
              setEndpointIdx(Number(e.target.value));
              setParams({});
              setResult(null);
            }}
            className="w-full bg-zwn-surface text-zwn-text border border-zwn-border rounded px-3 py-2 text-[11px] outline-none cursor-pointer"
          >
            {CONSOLE_ENDPOINTS.map((ep, i) => (
              <option key={i} value={i} className="bg-zwn-bg">
                {ep.label}
              </option>
            ))}
          </select>
        </div>

        {/* Params */}
        {endpoint.params.map((p) => (
          <div key={p.name}>
            <label className="text-[9px] text-zwn-muted tracking-widest block mb-1">
              {p.name}
              {p.inPath && <span className="text-zwn-border ml-1">(path)</span>}
            </label>
            <input
              type="text"
              value={params[p.name] ?? ''}
              onChange={(e) => setParam(p.name, e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={p.placeholder}
              className="w-full bg-zwn-surface text-zwn-text border border-zwn-border rounded px-3 py-2 text-[11px] outline-none placeholder-zwn-border focus:border-zwn-teal transition-colors"
            />
          </div>
        ))}

        {/* Body (POST only) */}
        {endpoint.needsBody && (
          <div>
            <label className="text-[9px] text-zwn-muted tracking-widest block mb-1">BODY</label>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={4}
              className="w-full bg-zwn-surface text-zwn-text border border-zwn-border rounded px-3 py-2 text-[11px] outline-none font-mono resize-none focus:border-zwn-teal transition-colors"
            />
          </div>
        )}

        <button
          onClick={fire}
          disabled={loading}
          className="self-start text-[11px] tracking-widest text-zwn-bg bg-zwn-teal rounded px-4 py-2 hover:opacity-90 transition-opacity disabled:opacity-50"
        >
          {loading ? 'firing...' : 'fire →'}
        </button>
      </div>

      {/* Right — response */}
      <div className="flex flex-col gap-2 lg:w-1/2">
        <div className="flex items-center justify-between">
          <label className="text-[9px] text-zwn-muted tracking-widest">RESPONSE</label>
          {result && (
            <div className="flex items-center gap-3 text-[9px]">
              <span
                className={result.status >= 200 && result.status < 300 ? 'text-zwn-teal' : result.status === 0 ? 'text-zwn-muted' : 'text-zwn-coral'}
              >
                {result.status === 0 ? 'mock' : result.status}
              </span>
              <span className="text-zwn-border">{result.latencyMs}ms</span>
            </div>
          )}
        </div>
        {result ? (
          <CodeBlock data={result.data} maxHeight="460px" />
        ) : (
          <div className="flex-1 border border-zwn-border rounded bg-zwn-surface flex items-center justify-center text-[10px] text-zwn-border min-h-[200px]">
            response appears here
          </div>
        )}
      </div>
    </div>
  );
}
