'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const LINKS = [
  { href: '/', label: 'WORLD' },
  { href: '/graph', label: 'GRAPH' },
  { href: '/console', label: 'CONSOLE' },
  { href: '/ingest', label: 'INGEST' },
];

export default function NavBar() {
  const pathname = usePathname();

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-6 h-11 border-b border-zwn-border bg-zwn-bg">
      <span className="text-zwn-teal text-sm font-semibold tracking-widest">ZWN</span>
      <div className="flex gap-8">
        {LINKS.map(({ href, label }) => {
          const active =
            href === '/' ? pathname === '/' : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={`text-xs tracking-widest transition-colors ${
                active
                  ? 'text-zwn-teal'
                  : 'text-zwn-muted hover:text-zwn-text'
              }`}
            >
              {label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
