'use client';

import { useState, useEffect } from 'react';
import { getRecentEntities, addRecentEntity } from '@/lib/entity-search';

interface Props {
  onSearch: (entityId: string) => void;
  className?: string;
}

export default function EntitySearchPanel({ onSearch, className }: Props) {
  const [query, setQuery] = useState('');
  const [recent, setRecent] = useState<string[]>([]);

  useEffect(() => {
    setRecent(getRecentEntities());
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const id = query.trim();
    if (!id) return;
    addRecentEntity(id);
    setRecent(getRecentEntities());
    setQuery('');
    onSearch(id);
  };

  const handleRecent = (id: string) => {
    addRecentEntity(id);
    setRecent(getRecentEntities());
    onSearch(id);
  };

  return (
    <div className={className}>
      <form onSubmit={handleSubmit} className="space-y-2">
        <div className="text-[9px] text-zwn-muted tracking-widest text-center mb-3">
          search entity &rarr;
        </div>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="entity-id"
          autoComplete="off"
          className="w-full bg-zwn-surface border border-zwn-border rounded px-4 py-3 text-[13px] text-zwn-text placeholder-zwn-border outline-none focus:border-zwn-teal transition-colors text-center"
        />
        <button type="submit" className="sr-only">search</button>
      </form>

      {recent.length > 0 && (
        <div className="mt-6 space-y-2">
          <div className="text-[9px] text-zwn-border tracking-widest text-center">recent</div>
          <div className="space-y-1">
            {recent.map((id) => (
              <button
                key={id}
                onClick={() => handleRecent(id)}
                className="w-full text-left text-[11px] text-zwn-muted hover:text-zwn-text px-3 py-1.5 rounded hover:bg-zwn-surface transition-colors"
              >
                {id}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
