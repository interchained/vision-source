'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { Empty } from '@/components/empty';
import { formatNumber, shortHash } from '@/lib/utils';
import { Sk, SKELETON_ROWS } from '@/components/skeleton';
import { NodeSyncingInline } from '@/components/node-syncing';
import { useSyncState } from '@/hooks/use-sync';

const SORTS = [
  { id: 'created', label: 'Newest' },
  { id: 'transfers', label: 'Activity' },
  { id: 'supply', label: 'Supply' },
  { id: 'name', label: 'Name' },
] as const;

const TOKEN_COLS = ['w-16', 'w-32', 'w-40', 'w-20', 'w-10', 'w-16'];

export default function TokensPage() {
  const [tokens, setTokens] = useState<any[]>([]);
  const [sort, setSort] = useState<typeof SORTS[number]['id']>('created');
  const [q, setQ] = useState('');
  const [verifiedOnly, setVerifiedOnly] = useState(false);
  const [loading, setLoading] = useState(true);
  const syncing = useSyncState();

  useEffect(() => {
    setLoading(true);
    api
      .tokens({ sort, q: q || undefined, verified: verifiedOnly || undefined, limit: 200 })
      .then((r) => setTokens(r.items))
      .finally(() => setLoading(false));
  }, [sort, q, verifiedOnly]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl lg:text-3xl font-bold">ITSL Tokens</h1>
        <p className="text-sm text-[var(--color-text-dim)] mt-1">
          Native tokens issued via the Interchained Token Subsystem Layer.
        </p>
      </div>

      <div className="flex flex-col lg:flex-row gap-3 items-stretch lg:items-center">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search by name, symbol, or token ID…"
          className="flex-1 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-[var(--color-accent)]"
        />
        <div className="flex gap-1 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-1">
          {SORTS.map((s) => (
            <button
              key={s.id}
              onClick={() => setSort(s.id)}
              className={`px-3 py-1.5 text-xs rounded ${
                sort === s.id ? 'bg-[var(--color-accent)]/15 text-[var(--color-accent)]' : 'text-[var(--color-text-dim)] hover:text-white'
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-2 text-xs text-[var(--color-text-dim)] cursor-pointer">
          <input
            type="checkbox"
            checked={verifiedOnly}
            onChange={(e) => setVerifiedOnly(e.target.checked)}
            className="accent-[var(--color-accent)]"
          />
          Verified only
        </label>
      </div>

      {loading ? (
        <div className="card overflow-hidden">
          <div className="hidden md:grid grid-cols-[120px_1fr_1fr_140px_120px_140px] gap-3 px-5 py-3 text-[11px] uppercase tracking-wider text-[var(--color-text-faint)] border-b border-[var(--color-border)]">
            <div>Symbol</div><div>Name</div><div>Token ID</div>
            <div className="text-right">Supply</div>
            <div className="text-right">Decimals</div>
            <div className="text-right">Transfers</div>
          </div>
          <div className="divide-y divide-[var(--color-border-soft)]">
            {SKELETON_ROWS.slice(0, 12).map((i) => (
              <Sk.TableRow key={i} cols={TOKEN_COLS} className="py-3" />
            ))}
          </div>
        </div>
      ) : tokens.length === 0 ? (
        syncing ? (
          <div className="card overflow-hidden"><NodeSyncingInline /></div>
        ) : (
          <Empty title="No tokens match your filters" hint="Try clearing search or switching the sort." />
        )
      ) : (
        <div className="card overflow-hidden">
          <div className="hidden md:grid grid-cols-[120px_1fr_1fr_140px_120px_140px] gap-3 px-5 py-3 text-[11px] uppercase tracking-wider text-[var(--color-text-faint)] border-b border-[var(--color-border)]">
            <div>Symbol</div>
            <div>Name</div>
            <div>Token ID</div>
            <div className="text-right">Supply</div>
            <div className="text-right">Decimals</div>
            <div className="text-right">Transfers</div>
          </div>
          <div className="divide-y divide-[var(--color-border-soft)]">
            {tokens.map((t) => (
              <Link
                key={t.id}
                href={`/token/${t.id}`}
                className="grid grid-cols-2 md:grid-cols-[120px_1fr_1fr_140px_120px_140px] gap-3 px-5 py-3 hover:bg-white/5 transition items-center"
              >
                <div className="flex items-center gap-2">
                  <span className="font-bold text-[var(--color-gold)]">{t.symbol}</span>
                  {t.verified && <span className="chip chip-gold">✓</span>}
                </div>
                <div className="text-sm truncate">{t.name}</div>
                <div className="hidden md:block text-xs mono text-[var(--color-text-dim)] truncate">{shortHash(t.id, 10, 8)}</div>
                <div className="text-right text-sm mono">{formatNumber(t.total_supply, 0)}</div>
                <div className="text-right text-xs mono text-[var(--color-text-dim)] hidden md:block">{t.decimals}</div>
                <div className="text-right text-xs mono text-[var(--color-text-dim)] hidden md:block">{formatNumber(t.transfer_count)}</div>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
