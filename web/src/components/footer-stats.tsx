'use client';

import Link from 'next/link';
import { useNetwork } from '@/hooks/use-network';
import { formatNumber, humanHashrate } from '@/lib/utils';

function Pill({ label, value, accent }: { label: string; value: React.ReactNode; accent?: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="text-[var(--color-text-faint)] tracking-wider">{label}</span>
      <span className={accent ? `font-semibold` : 'text-white'} style={accent ? { color: accent } : undefined}>
        {value}
      </span>
    </span>
  );
}

export function FooterStats() {
  const { stats, price } = useNetwork();

  const mempoolCount = stats?.mempool?.tx_count ?? null;
  const mempoolFee   = stats?.mempool?.fee_categories?.medium;

  return (
    <footer className="sticky bottom-0 z-30 border-t border-[var(--color-border)] bg-[var(--color-bg)]/95 backdrop-blur-md">
      <div className="max-w-7xl mx-auto px-4 lg:px-6 py-2 flex flex-wrap items-center gap-x-6 gap-y-1.5 text-[11px] mono uppercase">

        <Pill label="Tip"        value={`#${formatNumber(stats?.tip_height)}`} />
        <Pill label="Difficulty" value={formatNumber(stats?.difficulty, 8)} />
        <Pill label="Hashrate"   value={humanHashrate(stats?.hashps_120 || 0)} />
        <Pill label="Mempool"    value={`${formatNumber(mempoolCount)} tx`} />

        {mempoolFee !== undefined && (
          <Pill label="Fee-Med" value={`${Number(mempoolFee).toFixed(1)} sat/vB`} accent="var(--color-gold)" />
        )}

        {price?.available && (
          <Pill
            label="ITC/USD"
            value={
              <>
                <span>${Number(price.price_usd).toFixed(4)}</span>
                {price.change_24h_pct !== undefined && (
                  <span
                    className="ml-1"
                    style={{ color: price.change_24h_pct >= 0 ? 'var(--color-success)' : 'var(--color-danger)' }}
                  >
                    {price.change_24h_pct >= 0 ? '▲' : '▼'}{Math.abs(price.change_24h_pct).toFixed(2)}%
                  </span>
                )}
              </>
            }
          />
        )}

        <Pill label="Connections" value={stats?.connections ?? '—'} />

        <span className="text-[var(--color-border)] hidden sm:inline">·</span>

        <Link href="/api-docs" className="text-[var(--color-accent)] hover:underline">API</Link>
        <Link href="/docs"     className="text-[var(--color-accent)] hover:underline">Docs</Link>
        <Link href="https://github.com/interchained" className="text-[var(--color-accent)] hover:underline" target="_blank" rel="noopener">GitHub</Link>
      </div>
    </footer>
  );
}
