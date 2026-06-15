'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';
import { useSse } from '@/lib/sse';
import { formatItc } from '@/lib/format';
import { formatNumber, shortHash } from '@/lib/utils';

const STORAGE_KEY = 'vision:watchlist';

type WatchedEntry = { addr: string; label: string; addedAt: number };
type LiveData = {
  balance_sats: number;
  tx_count: number;
  prev_balance?: number;
};

function load(): WatchedEntry[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
  } catch {
    return [];
  }
}
function save(list: WatchedEntry[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
}

export function AddressWatchlist() {
  const [entries, setEntries] = useState<WatchedEntry[]>([]);
  const [live, setLive] = useState<Record<string, LiveData>>({});
  const [input, setInput] = useState('');
  const [label, setLabel] = useState('');
  const [adding, setAdding] = useState(false);
  const [open, setOpen] = useState(false);
  const fetchingRef = useRef(false);

  useEffect(() => {
    setEntries(load());
  }, []);

  const fetchAll = async (list: WatchedEntry[]) => {
    if (!list.length || fetchingRef.current) return;
    fetchingRef.current = true;
    try {
      const results = await Promise.allSettled(
        list.map((e) => api.address(e.addr)),
      );
      setLive((prev) => {
        const next: Record<string, LiveData> = { ...prev };
        list.forEach((e, i) => {
          const r = results[i];
          if (r.status === 'fulfilled') {
            next[e.addr] = {
              balance_sats: r.value.balance_sats ?? 0,
              tx_count: r.value.tx_count ?? 0,
              prev_balance: prev[e.addr]?.balance_sats,
            };
          }
        });
        return next;
      });
    } finally {
      fetchingRef.current = false;
    }
  };

  useEffect(() => {
    if (entries.length) {
      fetchAll(entries);
      const t = setInterval(() => fetchAll(entries), 60_000);
      return () => clearInterval(t);
    }
  }, [entries]);

  useSse((ev) => {
    if (ev.type === 'block') fetchAll(entries);
  });

  const addAddress = async () => {
    const addr = input.trim();
    if (!addr || entries.some((e) => e.addr === addr)) return;
    setAdding(true);
    try {
      await api.address(addr);
    } catch {
      setAdding(false);
      return;
    }
    const next = [...entries, { addr, label: label.trim() || shortHash(addr, 6, 4), addedAt: Date.now() }];
    setEntries(next);
    save(next);
    setInput('');
    setLabel('');
    setAdding(false);
    fetchAll(next);
  };

  const remove = (addr: string) => {
    const next = entries.filter((e) => e.addr !== addr);
    setEntries(next);
    save(next);
    setLive((prev) => {
      const n = { ...prev };
      delete n[addr];
      return n;
    });
  };

  return (
    <div className="card overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-5 py-3 border-b border-[var(--color-border)] hover:bg-white/5 transition"
      >
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-white">Address Watchlist</span>
          {entries.length > 0 && (
            <span className="chip text-[10px] py-0">{entries.length}</span>
          )}
        </div>
        <span className="text-[var(--color-text-faint)] text-xs">{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div>
          <div className="divide-y divide-[var(--color-border-soft)]">
            {entries.length === 0 && (
              <div className="px-5 py-6 text-center text-sm text-[var(--color-text-faint)]">
                No addresses watched yet.
              </div>
            )}
            {entries.map((e) => {
              const d = live[e.addr];
              const changed = d?.prev_balance !== undefined && d.prev_balance !== d.balance_sats;
              const gained = changed && (d?.balance_sats ?? 0) > (d?.prev_balance ?? 0);
              return (
                <div key={e.addr} className="flex items-center justify-between px-5 py-3 gap-4">
                  <div className="min-w-0">
                    <Link
                      href={`/address/${e.addr}`}
                      className="text-xs font-semibold text-[var(--color-accent)] hover:underline block truncate"
                    >
                      {e.label}
                    </Link>
                    <div className="text-[10px] mono text-[var(--color-text-faint)] truncate mt-0.5">
                      {shortHash(e.addr, 8, 6)}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    {d ? (
                      <>
                        <div
                          className="text-xs mono font-semibold"
                          style={{ color: changed ? (gained ? 'var(--color-success)' : 'var(--color-danger)') : 'var(--color-gold)' }}
                        >
                          {changed ? (gained ? '▲' : '▼') : ''} {formatItc(d.balance_sats)}
                        </div>
                        <div className="text-[10px] text-[var(--color-text-faint)] mono">
                          {formatNumber(d.tx_count)} txs
                        </div>
                      </>
                    ) : (
                      <div className="text-[10px] text-[var(--color-text-faint)]">loading…</div>
                    )}
                  </div>
                  <button
                    onClick={() => remove(e.addr)}
                    className="text-[var(--color-text-faint)] hover:text-[var(--color-danger)] text-xs shrink-0 transition"
                    title="Remove"
                  >
                    ✕
                  </button>
                </div>
              );
            })}
          </div>

          <div className="px-5 py-3 border-t border-[var(--color-border)] flex flex-col gap-2">
            <input
              type="text"
              placeholder="ITC address…"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addAddress()}
              className="w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded px-3 py-1.5 text-xs mono text-[var(--color-text)] placeholder:text-[var(--color-text-faint)] focus:outline-none focus:border-[var(--color-accent)]"
            />
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Label (optional)"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && addAddress()}
                className="flex-1 bg-[var(--color-bg)] border border-[var(--color-border)] rounded px-3 py-1.5 text-xs text-[var(--color-text)] placeholder:text-[var(--color-text-faint)] focus:outline-none focus:border-[var(--color-accent)]"
              />
              <button
                onClick={addAddress}
                disabled={!input.trim() || adding}
                className="px-3 py-1.5 text-xs font-semibold rounded bg-[var(--color-accent)] text-white disabled:opacity-40 hover:opacity-90 transition"
              >
                {adding ? '…' : 'Watch'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
