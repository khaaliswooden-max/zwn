'use client';

import { useState, useEffect } from 'react';
import { generateApiKey } from '@/lib/api';

const TRACKS = ['API_ACCESS', 'PLATFORM_PARTNERSHIP', 'INSTITUTIONAL'] as const;

interface Props {
  onKeyChange?: (key: string) => void;
}

export default function ApiKeyPanel({ onKeyChange }: Props) {
  const [track, setTrack] = useState<string>('API_ACCESS');
  const [key, setKey] = useState('');
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [genError, setGenError] = useState('');

  useEffect(() => {
    const stored = localStorage.getItem('zwm_api_key') ?? '';
    setKey(stored);
  }, []);

  const generate = async () => {
    setLoading(true);
    setGenError('');
    try {
      const rec = await generateApiKey(track);
      const newKey = rec.key;
      localStorage.setItem('zwm_api_key', newKey);
      setKey(newKey);
      onKeyChange?.(newKey);
    } catch {
      setGenError('Key generation failed. Verify ADMIN_SECRET is configured.');
    } finally {
      setLoading(false);
    }
  };

  const copy = async () => {
    if (!key) return;
    await navigator.clipboard.writeText(key);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="flex flex-wrap items-center gap-3 py-2 px-4 border border-zwn-border rounded bg-zwn-surface text-[11px]">
      <span className="text-zwn-muted tracking-widest text-[9px]">API KEY</span>

      <select
        value={track}
        onChange={(e) => setTrack(e.target.value)}
        className="bg-transparent text-zwn-text border border-zwn-border rounded px-2 py-1 text-[10px] tracking-widest outline-none cursor-pointer"
      >
        {TRACKS.map((t) => (
          <option key={t} value={t} className="bg-zwn-bg">
            {t}
          </option>
        ))}
      </select>

      <button
        onClick={generate}
        disabled={loading}
        className="text-[10px] tracking-widest text-zwn-teal border border-zwn-teal border-opacity-40 rounded px-3 py-1 hover:bg-zwn-teal hover:bg-opacity-10 transition-colors disabled:opacity-50"
      >
        {loading ? 'generating...' : 'generate'}
      </button>

      {genError && (
        <span className="text-[10px] text-red-400">{genError}</span>
      )}

      {key && (
        <>
          <span className="text-zwn-muted font-mono text-[10px] truncate max-w-[240px]">
            {key}
          </span>
          <button
            onClick={copy}
            className="text-[9px] text-zwn-muted hover:text-zwn-text tracking-widest transition-colors"
          >
            {copied ? 'COPIED' : 'COPY'}
          </button>
        </>
      )}
    </div>
  );
}
