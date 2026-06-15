'use client';

import Link from 'next/link';
import { use, useEffect, useState } from 'react';
import { api, friendlyError } from '@/lib/api';
import { CopyButton } from '@/components/copy-button';
import { KeyValue } from '@/components/key-value';
import { formatItc, formatFeeRate } from '@/lib/format';
import { humanBytes, shortHash, timeAgo, formatNumber } from '@/lib/utils';
import { Sk, SKELETON_ROWS } from '@/components/skeleton';
import { NodeSyncingPage } from '@/components/node-syncing';
import { useSyncState } from '@/hooks/use-sync';
import { TxFlowDiagram } from '@/components/tx-flow-diagram';

export default function TxPage({ params }: { params: Promise<{ txid: string }> }) {
  const { txid } = use(params);
  const [tx, setTx] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [advanced, setAdvanced] = useState(false);
  const syncing = useSyncState();

  useEffect(() => {
    api.tx(txid).then(setTx).catch((e) => setError(friendlyError(e)));
  }, [txid]);

  if (error) return syncing ? <NodeSyncingPage /> : (
    <div className="card p-8 space-y-3">
      <p className="text-[var(--color-danger)] font-semibold">Unable to load transaction</p>
      <p className="text-sm text-[var(--color-text-dim)]">{error}</p>
      <button onClick={() => { setError(null); api.tx(txid).then(setTx).catch((e) => setError(friendlyError(e))); }} className="text-xs text-[var(--color-accent)] hover:underline">Try again →</button>
    </div>
  );
  if (!tx) return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-3 mb-3"><Sk.Line w="w-24" h="h-5" /></div>
        <Sk.Line w="w-80" h="h-8" className="mb-2" />
      </div>
      <div className="grid lg:grid-cols-2 gap-6">
        <div className="card p-5"><Sk.Line w="w-20" h="h-4" className="mb-4" />{SKELETON_ROWS.slice(0,5).map(i=><Sk.KvRow key={i}/>)}</div>
        <div className="card p-5"><Sk.Line w="w-24" h="h-4" className="mb-4" />{SKELETON_ROWS.slice(0,4).map(i=><Sk.KvRow key={i}/>)}</div>
      </div>
      <div className="grid lg:grid-cols-2 gap-6">
        <div className="card overflow-hidden">
          <div className="px-5 py-3 border-b border-[var(--color-border)]"><Sk.Line w="w-20" h="h-4" /></div>
          <div className="divide-y divide-[var(--color-border-soft)]">{SKELETON_ROWS.slice(0,4).map(i=><Sk.Row key={i} cols={2}/>)}</div>
        </div>
        <div className="card overflow-hidden">
          <div className="px-5 py-3 border-b border-[var(--color-border)]"><Sk.Line w="w-20" h="h-4" /></div>
          <div className="divide-y divide-[var(--color-border-soft)]">{SKELETON_ROWS.slice(0,4).map(i=><Sk.Row key={i} cols={2}/>)}</div>
        </div>
      </div>
    </div>
  );

  const totalIn = tx.inputs.reduce((s: number, i: any) => s + (i.prevout?.value_sats || 0), 0);
  const totalOut = tx.outputs.reduce((s: number, o: any) => s + o.value_sats, 0);

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-3 mb-2">
          {tx.is_coinbase && <span className="chip chip-gold">COINBASE</span>}
          {tx.in_mempool && <span className="chip">UNCONFIRMED</span>}
          {tx.confirmations && tx.confirmations > 0 && (
            <span className="chip chip-success">{formatNumber(tx.confirmations)} conf</span>
          )}
          {tx.block_time && <span className="text-xs text-[var(--color-text-dim)] mono">{timeAgo(tx.block_time)}</span>}
        </div>
        <h1 className="text-2xl lg:text-3xl mono font-bold break-all flex items-center gap-2">
          {shortHash(tx.txid, 16, 12)}
          <CopyButton value={tx.txid} />
        </h1>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <div className="card p-5">
          <h2 className="text-sm font-semibold mb-3 text-white">Summary</h2>
          <KeyValue label="TXID" value={shortHash(tx.txid)} copy={tx.txid} />
          {tx.block_height !== undefined && tx.block_height !== null && (
            <KeyValue
              label="Block"
              value={<Link href={`/block/${tx.block_height}`} className="text-[var(--color-accent)]">#{formatNumber(tx.block_height)}</Link>}
            />
          )}
          <KeyValue label="Size" value={`${humanBytes(tx.size)} (${formatNumber(tx.size)} B)`} />
          <KeyValue label="vSize" value={`${formatNumber(tx.vsize)} vB`} />
          {tx.weight && <KeyValue label="Weight" value={`${formatNumber(tx.weight)} WU`} />}
          <KeyValue label="Version" value={String(tx.version)} />
          <KeyValue label="Locktime" value={String(tx.locktime)} />
        </div>

        <div className="card p-5">
          <h2 className="text-sm font-semibold mb-3 text-white">Value Flow</h2>
          {!tx.is_coinbase && totalIn > 0 && (
            <KeyValue label="Total Input" value={formatItc(totalIn)} />
          )}
          <KeyValue label="Total Output" value={formatItc(totalOut)} />
          {tx.fee_sats !== null && tx.fee_sats !== undefined && (
            <>
              <KeyValue label="Fee" value={<span className="text-[var(--color-gold)]">{formatItc(tx.fee_sats)}</span>} />
              {tx.fee_rate_sat_vbyte && (
                <KeyValue label="Fee Rate" value={formatFeeRate(tx.fee_rate_sat_vbyte)} />
              )}
            </>
          )}
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <div className="card overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3 border-b border-[var(--color-border)]">
            <h3 className="text-sm font-semibold">Inputs ({tx.inputs.length})</h3>
            {tx.is_coinbase && <span className="chip chip-gold">COINBASE</span>}
          </div>
          <div className="divide-y divide-[var(--color-border-soft)]">
            {tx.inputs.map((i: any, idx: number) => (
              <div key={idx} className="px-5 py-3">
                {i.coinbase ? (
                  <div>
                    <div className="text-xs text-[var(--color-text-faint)]">Coinbase data</div>
                    <div className="mono text-xs mt-1 break-all text-[var(--color-text-dim)]">{i.coinbase}</div>
                  </div>
                ) : (
                  <>
                    <div className="flex items-center justify-between">
                      <Link href={`/tx/${i.txid}`} className="text-xs text-[var(--color-accent)] mono">
                        {shortHash(i.txid)}:{i.vout}
                      </Link>
                      {i.prevout?.value_sats !== undefined && (
                        <span className="text-xs mono text-[var(--color-gold)]">{formatItc(i.prevout.value_sats)}</span>
                      )}
                    </div>
                    {i.prevout?.address && (
                      <div className="mt-1">
                        <Link href={`/address/${i.prevout.address}`} className="text-xs text-[var(--color-text-dim)] mono break-all">
                          {i.prevout.address}
                        </Link>
                      </div>
                    )}
                  </>
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="card overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3 border-b border-[var(--color-border)]">
            <h3 className="text-sm font-semibold">Outputs ({tx.outputs.length})</h3>
          </div>
          <div className="divide-y divide-[var(--color-border-soft)]">
            {tx.outputs.map((o: any) => (
              <div key={o.n} className="px-5 py-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-[var(--color-text-faint)]">#{o.n}</span>
                  <span className="text-xs mono text-[var(--color-gold)]">{formatItc(o.value_sats)}</span>
                </div>
                {o.address ? (
                  <Link href={`/address/${o.address}`} className="text-xs text-[var(--color-text-dim)] mono break-all block mt-1">
                    {o.address}
                  </Link>
                ) : (
                  <div className="text-xs text-[var(--color-text-faint)] mt-1">{o.script_pubkey_type || 'non-standard'}</div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      <TxFlowDiagram tx={tx} />

      <div>
        <button
          onClick={() => setAdvanced((v) => !v)}
          className="text-xs text-[var(--color-accent)] hover:underline"
        >
          {advanced ? 'Hide' : 'Show'} raw hex
        </button>
        {advanced && tx.raw_hex && (
          <pre className="card p-4 mt-2 text-[10px] mono break-all whitespace-pre-wrap text-[var(--color-text-dim)] max-h-64 overflow-y-auto">{tx.raw_hex}</pre>
        )}
      </div>
    </div>
  );
}
