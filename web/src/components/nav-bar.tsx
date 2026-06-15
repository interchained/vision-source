'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Logo } from './logo';
import { SearchBar } from './search-bar';
import { CurrencyToggle } from './currency-toggle';
import { cn } from '@/lib/utils';

const NAV = [
  { href: '/', label: 'Home', lgOnly: false },
  { href: '/blocks', label: 'Blocks', lgOnly: false },
  { href: '/mempool', label: 'Mempool', lgOnly: false },
  { href: '/tokens', label: 'Tokens', lgOnly: false },
  { href: '/infrastructure/grants', label: 'Treasury Grant', lgOnly: false },
  { href: '/deploy', label: 'Deploy', lgOnly: false },
  { href: '/api-docs', label: 'API', lgOnly: true },
  { href: '/docs', label: 'Docs', lgOnly: true },
];

export function NavBar() {
  const path = usePathname();
  return (
    <header className="sticky top-0 z-40 border-b border-[var(--color-border)] bg-[var(--color-bg)]/80 backdrop-blur-md">
      <div className="max-w-7xl mx-auto px-4 lg:px-6 py-3">
        <div className="flex items-center gap-6">
          <Link href="/" className="shrink-0">
            <Logo />
          </Link>
          <nav className="hidden md:flex items-center gap-1">
            {NAV.map((n) => {
              const active = path === n.href || (n.href !== '/' && path?.startsWith(n.href));
              return (
                <Link
                  key={n.href}
                  href={n.href}
                  className={cn(
                    'px-3 py-1.5 text-sm rounded-md transition',
                    n.lgOnly ? 'hidden lg:block' : '',
                    active
                      ? 'text-[var(--color-accent)] bg-[var(--color-accent)]/10'
                      : 'text-[var(--color-text-dim)] hover:text-white hover:bg-white/5'
                  )}
                >
                  {n.label}
                </Link>
              );
            })}
          </nav>
          <div className="flex-1 hidden lg:block">
            <SearchBar compact />
          </div>
          <CurrencyToggle />
        </div>
        <div className="mt-3 lg:hidden">
          <SearchBar compact />
        </div>
      </div>
    </header>
  );
}
