'use client';

import { Search } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

export function SearchBar({ compact = false }: { compact?: boolean }) {
  const [q, setQ] = useState('');
  const router = useRouter();

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const v = q.trim();
    if (!v) return;
    if (/^\d+$/.test(v)) router.push(`/block/${v}`);
    else if (/^[0-9a-fA-F]{64}$/.test(v)) router.push(`/search?q=${encodeURIComponent(v)}`);
    else router.push(`/search?q=${encodeURIComponent(v)}`);
  };

  return (
    <form onSubmit={submit} className={compact ? 'w-full max-w-md' : 'w-full max-w-2xl mx-auto'}>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--color-text-faint)]" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Block / tx / address / token symbol or ID…"
          className="w-full pl-10 pr-4 py-2.5 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]/40 focus:border-[var(--color-accent)] transition mono"
        />
      </div>
    </form>
  );
}
