'use client';

import { useState } from 'react';
import { formatItc, formatFeeRate } from '@/lib/format';

interface ProjectedBlock {
  index: number;
  fee_rate_median: number;
  fee_rate_min: number;
  tx_count: number;
  vsize: number;
  fees_sats: number;
}

interface Props {
  projected: ProjectedBlock[];
}

const TIERS = [
  { label: 'Economy', blocks: 6, color: '#888' },
  { label: 'Standard', blocks: 3, color: 'var(--color-accent)' },
  { label: 'Priority', blocks: 1, color: 'var(--color-warning)' },
  { label: 'Turbo', blocks: 0, color: 'var(--color-gold)' },
];

function minFeeForBlocks(projected: ProjectedBlock[], targetBlocks: number): number | null {
  if (!projected.length) return null;
  if (targetBlocks === 0) {
    return Math.max(...projected.map((p) => p.fee_rate_median)) * 1.25;
  }
  const target = projected.find((p) => p.index <= targetBlocks);
  return target?.fee_rate_median ?? projected[projected.length - 1]?.fee_rate_median ?? null;
}

export function FeeCalculator({ projected }: Props) {
  const [txBytes, setTxBytes] = useState(250);

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-4">
        <label className="text-xs text-[var(--color-text-dim)]">TX Size (bytes)</label>
        <input
          type="number"
          min={100}
          max={100000}
          value={txBytes}
          onChange={(e) => setTxBytes(Number(e.target.value) || 250)}
          className="w-28 bg-[var(--color-bg)] border border-[var(--color-border)] rounded px-3 py-1.5 text-xs mono text-[var(--color-text)] focus:outline-none focus:border-[var(--color-accent)]"
        />
        <span className="text-[10px] text-[var(--color-text-faint)]">typical P2PKH ≈ 226 B · P2WPKH ≈ 141 vB</span>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {TIERS.map((tier) => {
          const rate = minFeeForBlocks(projected, tier.blocks);
          const feeSats = rate !== null ? Math.ceil(rate * txBytes) : null;
          const blockTime = tier.blocks === 0 ? '<10 min' : `~${tier.blocks * 10} min`;
          return (
            <div key={tier.label} className="card p-4 space-y-2">
              <div className="text-[10px] uppercase tracking-wider" style={{ color: tier.color }}>
                {tier.label}
              </div>
              <div className="text-base mono font-bold text-white">
                {rate !== null ? `${rate.toFixed(1)} sat/vB` : '—'}
              </div>
              <div className="text-[11px] mono text-[var(--color-text-dim)]">
                {feeSats !== null ? formatItc(feeSats) : '—'}
              </div>
              <div className="text-[10px] text-[var(--color-text-faint)]">{blockTime}</div>
            </div>
          );
        })}
      </div>

      {projected.length > 0 && (
        <div>
          <h4 className="text-xs uppercase tracking-wider text-[var(--color-text-faint)] mb-3">
            Projected Block Fee Rates
          </h4>
          <div className="flex items-end gap-1 h-20">
            {projected.map((p) => {
              const maxRate = Math.max(...projected.map((x) => x.fee_rate_median), 1);
              const h = Math.max(8, (p.fee_rate_median / maxRate) * 72);
              return (
                <div
                  key={p.index}
                  className="flex-1 flex flex-col items-center gap-1"
                  title={`Block +${p.index}: ${formatFeeRate(p.fee_rate_median)} · ${p.tx_count} txs`}
                >
                  <div
                    className="w-full rounded-t"
                    style={{
                      height: h,
                      background: `linear-gradient(to top, var(--color-accent), var(--color-accent-glow))`,
                      opacity: 0.7 + (p.index === 1 ? 0.3 : 0),
                    }}
                  />
                  <div className="text-[8px] mono text-[var(--color-text-faint)]">+{p.index}</div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {projected.length === 0 && (
        <div className="py-6 text-center text-sm text-[var(--color-text-dim)]">
          No projected data — mempool may be empty.
        </div>
      )}
    </div>
  );
}
