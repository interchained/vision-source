'use client';

import { useEffect, useRef, useState } from 'react';
import { useSse } from '@/lib/sse';
import { formatNumber } from '@/lib/utils';
import { formatItc } from '@/lib/format';
import Link from 'next/link';

type Toast = {
  id: number;
  kind: 'block' | 'whale';
  height?: number;
  txCount?: number;
  txid?: string;
  valueSats?: number;
  exiting: boolean;
};

let _id = 0;
const DURATION = 6000;
const WHALE_THRESHOLD_SATS = 100_000 * 100_000_000; // 100,000 ITC

export function BlockToast() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timers = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());

  function dismiss(id: number) {
    setToasts((prev) =>
      prev.map((t) => (t.id === id ? { ...t, exiting: true } : t)),
    );
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 350);
  }

  function addToast(t: Omit<Toast, 'id' | 'exiting'>) {
    const id = ++_id;
    setToasts((prev) => [...prev.slice(-3), { ...t, id, exiting: false }]);
    const timer = setTimeout(() => dismiss(id), DURATION);
    timers.current.set(id, timer);
  }

  useEffect(() => {
    const ts = timers.current;
    return () => ts.forEach((t) => clearTimeout(t));
  }, []);

  useSse((ev) => {
    if (ev.type === 'block') {
      addToast({
        kind: 'block',
        height: ev.data?.height,
        txCount: ev.data?.tx_count,
      });
    }
    if (ev.type === 'mempool' && ev.data?.top_tx) {
      const top = ev.data.top_tx;
      if (top.value_sats && top.value_sats >= WHALE_THRESHOLD_SATS) {
        addToast({ kind: 'whale', txid: top.txid, valueSats: top.value_sats });
      }
    }
  });

  if (toasts.length === 0) return null;

  return (
    <div
      aria-live="polite"
      className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 items-end pointer-events-none"
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          className="pointer-events-auto"
          style={{
            animation: t.exiting
              ? 'toast-out 0.35s ease forwards'
              : 'toast-in 0.3s ease',
          }}
        >
          {t.kind === 'block' ? (
            <Link
              href={t.height !== undefined ? `/block/${t.height}` : '#'}
              onClick={() => dismiss(t.id)}
              className="flex items-center gap-3 px-4 py-3 rounded-lg border border-[var(--color-border)]
                bg-[var(--color-surface)] shadow-lg hover:border-[var(--color-accent)] transition
                text-sm max-w-xs"
            >
              <span className="text-[var(--color-success)] text-lg leading-none">⬡</span>
              <div>
                <div className="font-semibold text-white text-xs">
                  Block #{t.height !== undefined ? formatNumber(t.height) : '—'} mined
                </div>
                {t.txCount !== undefined && (
                  <div className="text-[var(--color-text-dim)] text-xs">
                    {formatNumber(t.txCount)} transaction{t.txCount !== 1 ? 's' : ''}
                  </div>
                )}
              </div>
            </Link>
          ) : (
            <Link
              href={t.txid ? `/tx/${t.txid}` : '#'}
              onClick={() => dismiss(t.id)}
              className="flex items-center gap-3 px-4 py-3 rounded-lg border border-[var(--color-gold)]/40
                bg-[var(--color-surface)] shadow-lg hover:border-[var(--color-gold)] transition
                text-sm max-w-xs"
            >
              <span className="text-[var(--color-gold)] text-lg leading-none">🐋</span>
              <div>
                <div className="font-semibold text-white text-xs">Whale TX detected</div>
                {t.valueSats !== undefined && (
                  <div className="text-[var(--color-gold)] text-xs mono">
                    {formatItc(t.valueSats)}
                  </div>
                )}
              </div>
            </Link>
          )}
        </div>
      ))}

      <style>{`
        @keyframes toast-in {
          from { opacity: 0; transform: translateX(100%); }
          to   { opacity: 1; transform: translateX(0); }
        }
        @keyframes toast-out {
          from { opacity: 1; transform: translateX(0); }
          to   { opacity: 0; transform: translateX(100%); }
        }
      `}</style>
    </div>
  );
}
