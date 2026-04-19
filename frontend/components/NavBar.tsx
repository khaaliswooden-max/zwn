'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';

const LINKS = [
  { href: '/world', label: 'WORLD' },
  { href: '/substrates', label: 'SUBSTRATES' },
  { href: '/graph', label: 'GRAPH' },
  { href: '/research', label: 'RESEARCH' },
  { href: '/build', label: 'BUILD' },
];

// Tracks whether the visitor has already seen today's brief. We stamp the
// brief date into localStorage on view and only highlight the badge if the
// cached date is older than what /brief/latest.json reports.
const SEEN_KEY = 'zwn:brief:seen';

export default function NavBar() {
  const pathname = usePathname();
  const [briefDate, setBriefDate] = useState<string | null>(null);
  const [seenDate, setSeenDate] = useState<string | null>(null);

  useEffect(() => {
    // Cheap HEAD-style fetch — we only need the date field, so small + cacheable.
    fetch('/brief/latest.json', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { date?: string } | null) => {
        if (data?.date) setBriefDate(data.date);
      })
      .catch(() => {
        // Brief not published yet — badge stays hidden.
      });
    try {
      setSeenDate(localStorage.getItem(SEEN_KEY));
    } catch {
      // localStorage blocked (private browsing) — badge stays hidden.
    }
  }, []);

  useEffect(() => {
    if (pathname === '/brief' && briefDate) {
      try {
        localStorage.setItem(SEEN_KEY, briefDate);
        setSeenDate(briefDate);
      } catch {
        // ignore
      }
    }
  }, [pathname, briefDate]);

  const briefIsNew = briefDate !== null && briefDate !== seenDate;

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between gap-3 pl-3 pr-3 sm:pl-6 sm:pr-6 h-11 border-b border-zwn-border bg-zwn-bg">
      <Link href="/" className="shrink-0 text-zwn-teal text-sm font-semibold tracking-widest hover:opacity-80 transition-opacity">
        ZWM
      </Link>
      <div className="flex gap-3 sm:gap-8 items-center overflow-x-auto no-scrollbar">
        {LINKS.map(({ href, label }) => {
          const active = pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={`shrink-0 text-xs tracking-widest transition-colors ${
                active
                  ? 'text-zwn-teal'
                  : 'text-zwn-muted hover:text-zwn-text'
              }`}
            >
              {label}
            </Link>
          );
        })}
        <Link
          href="/brief"
          aria-label={briefIsNew ? 'New daily brief available' : 'Daily brief'}
          className={`relative shrink-0 text-xs tracking-widest transition-colors ${
            pathname.startsWith('/brief')
              ? 'text-zwn-teal'
              : 'text-zwn-muted hover:text-zwn-text'
          }`}
        >
          BRIEF
          {briefIsNew && (
            <span className="absolute -top-1 -right-2 w-1.5 h-1.5 rounded-full bg-zwn-amber animate-pulse" />
          )}
        </Link>
      </div>
    </nav>
  );
}
