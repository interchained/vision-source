'use client';

import { useNetwork } from '@/hooks/use-network';
import { formatNumber, humanBytes, humanHashrate } from '@/lib/utils';
import { humanItc } from '@/lib/format';
import { StatCard } from './stat-card';

export function NetworkHealth() {
  const { stats, price, supply, loading } = useNetwork();
  const mempool = stats?.mempool;
  const supplySats = supply?.circulating_sats ?? 0;
  const supplyUsd =
    price?.available && supplySats > 0
      ? (supplySats / 100_000_000) * Number(price.price_usd)
      : null;

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4">
      <StatCard
        label="Network Hashrate"
        value={humanHashrate(stats?.hashps_120 || 0)}
        sub="120-block average"
        accent="gold"
        loading={loading}
      />
      <StatCard
        label="Difficulty"
        value={formatNumber(stats?.difficulty || 0, 8)}
        sub={`Chain: ${stats?.chain ?? '—'}`}
        loading={loading}
      />
      <StatCard
        label="Tip Height"
        value={`#${formatNumber(stats?.tip_height ?? 0)}`}
        sub={stats?.headers ? `${formatNumber(stats.headers)} headers` : undefined}
        loading={loading}
      />
      <StatCard
        label="Connections"
        value={formatNumber(stats?.connections ?? 0)}
        sub={stats?.subversion ?? undefined}
        loading={loading}
      />
      <StatCard
        label="Mempool TX"
        value={formatNumber(mempool?.tx_count ?? 0)}
        sub={mempool ? `${humanBytes(mempool.vsize_total)} total` : undefined}
        accent="blue"
        loading={loading}
      />
      <StatCard
        label="Mempool Fee Median"
        value={mempool ? `${Number(mempool.fee_rate_median).toFixed(2)} sat/vB` : '—'}
        sub={mempool ? `Min ${mempool.fee_rate_min} / Max ${mempool.fee_rate_max}` : undefined}
        accent="gold"
        loading={loading}
      />
      <StatCard
        label="Disk Size"
        value={stats?.size_on_disk ? humanBytes(stats.size_on_disk) : '—'}
        sub={stats?.pruned ? 'Pruned node' : 'Full archive'}
        loading={loading}
      />
      <StatCard
        label="ITC / USD"
        value={price?.available ? `$${Number(price.price_usd).toFixed(4)}` : '—'}
        sub={
          price?.available && price.change_24h_pct !== undefined
            ? `24h: ${price.change_24h_pct >= 0 ? '+' : ''}${Number(price.change_24h_pct).toFixed(2)}%`
            : undefined
        }
        accent={price?.available ? (price.change_24h_pct >= 0 ? 'green' : 'red') : 'blue'}
        loading={loading}
      />
      <StatCard
        label="Circulating Supply"
        value={supplySats > 0 ? humanItc(supplySats) : '—'}
        sub={
          supply
            ? supply.source === 'gettxoutsetinfo'
              ? `UTXO set @ #${formatNumber(supply.height ?? 0)}`
              : `Estimated @ #${formatNumber(supply.height ?? 0)}`
            : undefined
        }
        accent="gold"
        loading={loading}
      />
      <StatCard
        label="Market Cap"
        value={
          supplyUsd !== null
            ? supplyUsd >= 1e9
              ? `$${(supplyUsd / 1e9).toFixed(2)}B`
              : supplyUsd >= 1e6
                ? `$${(supplyUsd / 1e6).toFixed(2)}M`
                : supplyUsd >= 1e3
                  ? `$${(supplyUsd / 1e3).toFixed(2)}K`
                  : `$${supplyUsd.toLocaleString('en-US', { maximumFractionDigits: 2 })}`
            : '—'
        }
        sub={supplyUsd !== null ? `${humanItc(supplySats)} × $${Number(price.price_usd).toFixed(4)}` : 'Needs price + supply'}
        accent="blue"
        loading={loading}
      />
    </div>
  );
}
