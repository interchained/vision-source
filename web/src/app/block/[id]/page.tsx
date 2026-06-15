'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { use } from 'react';
import { api, friendlyError } from '@/lib/api';
import { CopyButton } from '@/components/copy-button';
import { KeyValue } from '@/components/key-value';
import { formatNumber, humanBytes, shortHash, timeAgo } from '@/lib/utils';
import { formatSats, formatItc } from '@/lib/format';
import { Sk, SKELETON_ROWS } from '@/components/skeleton';
import { NodeSyncingPage } from '@/components/node-syncing';
import { useSyncState } from '@/hooks/use-sync';

export default function BlockPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [block, setBlock] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const syncing = useSyncState();

  useEffect(() => {
    api.block(id).then(setBlock).catch((e) => setError(friendlyError(e)));
  }, [id]);

  if (error) return syncing ? <NodeSyncingPage /> : (
    <div className="card p-8 space-y-3">
      <p className="text-[var(--color-danger)] font-semibold">Unable to load block</p>
      <p className="text-sm text-[var(--color-text-dim)]">{error}</p>
      <button onClick={() => { setError(null); api.block(id).then(setBlock).catch((e) => setError(friendlyError(e))); }} className="text-xs text-[var(--color-accent)] hover:underline">Try again →</button>
    </div>
  );
  if (!block) return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-3 mb-3">
          <Sk.Line w="w-16" h="h-5" />
          <Sk.Line w="w-24" h="h-5" />
        </div>
        <Sk.Line w="w-48" h="h-10" className="mb-3" />
        <Sk.Line w="w-full" h="h-4" />
      </div>
      <div className="grid lg:grid-cols-2 gap-6">
        <div className="card p-5"><Sk.Line w="w-24" h="h-4" className="mb-4" />{SKELETON_ROWS.slice(0,6).map(i=><Sk.KvRow key={i}/>)}</div>
        <div className="card p-5"><Sk.Line w="w-32" h="h-4" className="mb-4" />{SKELETON_ROWS.slice(0,6).map(i=><Sk.KvRow key={i}/>)}</div>
      </div>
      <div className="card overflow-hidden">
        <div className="px-5 py-3 border-b border-[var(--color-border)]"><Sk.Line w="w-32" h="h-4" /></div>
        <div className="divide-y divide-[var(--color-border-soft)]">
          {SKELETON_ROWS.slice(0,8).map(i=>(
            <div key={i} className="px-5 py-2.5 flex items-center gap-4">
              <Sk.Line w="w-8" h="h-3" />
              <Sk.Line w="w-56" h="h-3" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  const cb = block.coinbase;
  const reward = cb ? cb.subsidy_sats + cb.fee_sats : 0;

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-3 mb-2">
          <span className="chip chip-gold">BLOCK</span>
          {cb?.miner && (
            <span className="chip" style={{ color: cb.miner.color, borderColor: cb.miner.color }}>
              ⛏ {cb.miner.name}
            </span>
          )}
          <span className="text-xs text-[var(--color-text-dim)] mono">{timeAgo(block.time)}</span>
        </div>
        <h1 className="text-3xl lg:text-4xl mono font-bold text-[var(--color-gold)]">#{formatNumber(block.height)}</h1>
        <div className="flex items-center gap-2 mt-2 text-sm text-[var(--color-text-dim)] mono break-all">
          {block.hash}
          <CopyButton value={block.hash} />
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <div className="card p-5">
          <h2 className="text-sm font-semibold mb-3 text-white">Summary</h2>
          <KeyValue label="Height" value={`#${formatNumber(block.height)}`} />
          <KeyValue label="Time" value={`${new Date(block.time * 1000).toLocaleString()} (${timeAgo(block.time)})`} />
          <KeyValue label="Confirmations" value={formatNumber(block.confirmations)} />
          <KeyValue label="Transactions" value={formatNumber(block.n_tx)} />
          <KeyValue label="Size" value={`${humanBytes(block.size)} (${formatNumber(block.size)} B)`} />
          {block.weight && <KeyValue label="Weight" value={`${formatNumber(block.weight)} WU`} />}
          <KeyValue label="Difficulty" value={formatNumber(block.difficulty, 0)} />
        </div>

        {cb && (
          <div className="card p-5">
            <h2 className="text-sm font-semibold mb-3 text-white">Coinbase Reward</h2>
            <KeyValue
              label="Miner"
              value={
                cb.miner ? (
                  <a href={cb.miner.url || '#'} className="text-[var(--color-accent)]">{cb.miner.name}</a>
                ) : cb.address ? (
                  <Link href={`/address/${cb.address}`} className="mono text-xs text-[var(--color-accent)]" title={cb.address}>{cb.address}</Link>
                ) : (
                  <span className="text-[var(--color-text-dim)]">—</span>
                )
              }
            />
            <KeyValue label="Subsidy" value={formatItc(cb.subsidy_sats)} />
            <KeyValue label="Fees" value={formatItc(cb.fee_sats)} />
            <KeyValue label="Total" value={<span className="text-[var(--color-gold)]">{formatItc(reward)}</span>} />
            {cb.address && (
              <KeyValue
                label="Payout"
                value={<Link href={`/address/${cb.address}`} className="text-[var(--color-accent)]">{shortHash(cb.address, 12, 8)}</Link>}
                copy={cb.address}
              />
            )}
            <KeyValue
              label="Maturity"
              value={
                cb.maturity.matured ? (
                  <span className="chip chip-success">MATURE ({cb.maturity.confirmations}/{cb.maturity.needed})</span>
                ) : (
                  <span className="chip">{cb.maturity.confirmations}/{cb.maturity.needed} ({cb.maturity.blocks_remaining} blocks left)</span>
                )
              }
            />
            <KeyValue label="ScriptSig" value={<span className="text-xs">{cb.scriptsig_text || '(empty)'}</span>} />
          </div>
        )}
      </div>

      <div className="card overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3 border-b border-[var(--color-border)]">
          <h2 className="text-sm font-semibold">Transactions ({formatNumber(block.txids.length)})</h2>
          <button
            onClick={() => setShowAdvanced((v) => !v)}
            className="text-xs text-[var(--color-accent)] hover:underline"
          >
            {showAdvanced ? 'Hide' : 'Show'} advanced
          </button>
        </div>
        <div className="divide-y divide-[var(--color-border-soft)] max-h-[600px] overflow-y-auto">
          {block.txids.map((txid: string, idx: number) => (
            <Link key={txid} href={`/tx/${txid}`} className="block px-5 py-2.5 hover:bg-white/5 transition mono text-xs">
              <span className="text-[var(--color-text-faint)] inline-block w-10">{idx === 0 ? 'cb' : idx}</span>
              <span className="text-[var(--color-text-dim)]">{showAdvanced ? txid : shortHash(txid, 12, 8)}</span>
            </Link>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 text-sm">
        {block.previousblockhash && (
          <Link
            href={`/block/${block.previousblockhash}`}
            className="card-hover card p-4 flex items-center gap-2"
          >
            <span className="text-[var(--color-text-faint)]">←</span>
            <div>
              <div className="text-xs text-[var(--color-text-faint)]">Previous</div>
              <div className="mono text-[var(--color-accent)]">#{formatNumber(block.height - 1)}</div>
            </div>
          </Link>
        )}
        {block.nextblockhash && (
          <Link
            href={`/block/${block.nextblockhash}`}
            className="card-hover card p-4 flex items-center justify-end gap-2 text-right"
          >
            <div>
              <div className="text-xs text-[var(--color-text-faint)]">Next</div>
              <div className="mono text-[var(--color-accent)]">#{formatNumber(block.height + 1)}</div>
            </div>
            <span className="text-[var(--color-text-faint)]">→</span>
          </Link>
        )}
      </div>
    </div>
  );
}
