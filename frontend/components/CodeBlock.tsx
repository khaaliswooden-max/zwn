'use client';

import { useState } from 'react';

interface Props {
  data: unknown;
  maxHeight?: string;
}

export default function CodeBlock({ data, maxHeight = '320px' }: Props) {
  const [copied, setCopied] = useState(false);

  const text =
    typeof data === 'string' ? data : JSON.stringify(data, null, 2);

  const copy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="relative group">
      <button
        onClick={copy}
        className="absolute top-2 right-2 text-[9px] text-zwn-muted hover:text-zwn-text tracking-widest transition-colors opacity-0 group-hover:opacity-100"
      >
        {copied ? 'COPIED' : 'COPY'}
      </button>
      <pre
        className="text-[11px] text-zwn-text bg-zwn-surface border border-zwn-border rounded p-3 overflow-auto leading-relaxed"
        style={{ maxHeight }}
      >
        {text}
      </pre>
    </div>
  );
}
