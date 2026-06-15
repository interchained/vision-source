'use client';

import Link from 'next/link';
import { useEffect, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { api, ApiError } from '@/lib/api';
import { Empty } from '@/components/empty';
import { NodeSyncingInline } from '@/components/node-syncing';
import { useSyncState } from '@/hooks/use-sync';

function SearchInner() {
  const params = useSearchParams();
  const q = params.get('q') || '';
  const [results, setResults] = useState<any[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const syncing = useSyncState();

  useEffect(() => {
    if (!q) return;
    setLoading(true);
    setError(null);
    setResults(null);

    let cancelled = false;

    const run = async (attempt = 0): Promise<void> => {
      try {
        const r = await api.search(q);
        if (!cancelled) setResults(r.matches);
      } catch (err: any) {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 429 && attempt < 2) {
          // Back off and retry: 2s then 4s
          await new Promise((res) => setTimeout(res, (attempt + 1) * 2000));
          return run(attempt + 1);
        }
        if (err instanceof ApiError && err.status === 429) {
          setError('Too many requests — please wait a moment and try again.');
        } else {
          setError(err?.payload?.message || err.message || 'Search failed.');
        }
        setResults([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    run();
    return () => { cancelled = true; };
  }, [q]);

  const showEmpty = !loading && results !== null && results.length === 0 && !error;
  const showError = !loading && !!error;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl lg:text-3xl font-bold">Search</h1>
        <p className="text-sm text-[var(--color-text-dim)] mt-1 mono">"{q}"</p>
      </div>

      {loading && (
        <div className="card p-8 text-center text-[var(--color-text-dim)] text-sm">Searching…</div>
      )}

      {showError && (
        <div className="card p-6 text-center space-y-2">
          <p className="text-[var(--color-danger)] text-sm font-medium">{error}</p>
        </div>
      )}

      {showEmpty && (
        syncing ? (
          <div className="card overflow-hidden"><NodeSyncingInline /></div>
        ) : (
          <Empty
            title="No matches found"
            hint="Try a block height, full transaction id, address, or token symbol/name."
          />
        )
      )}

      {!loading && results && results.length > 0 && (
        <div className="card overflow-hidden">
          <div className="divide-y divide-[var(--color-border-soft)]">
            {results.map((m, idx) => (
              <Link
                key={idx}
                href={m.href}
                className="flex items-center justify-between px-5 py-4 hover:bg-white/5 transition"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="chip">{m.type}</span>
                    <span className="text-sm font-semibold">{m.label}</span>
                  </div>
                  {m.subtitle && (
                    <div className="text-xs text-[var(--color-text-dim)] mono mt-1 truncate">
                      {m.subtitle}
                    </div>
                  )}
                </div>
                <span className="text-[var(--color-accent)]">→</span>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function SearchPage() {
  return (
    <Suspense fallback={<div className="card p-8 text-[var(--color-text-dim)] text-sm">Loading…</div>}>
      <SearchInner />
    </Suspense>
  );
}
