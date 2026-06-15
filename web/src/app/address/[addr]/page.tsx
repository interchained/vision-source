'use client';

import Link from 'next/link';
import { use, useEffect, useState } from 'react';
import { api, friendlyError } from '@/lib/api';
import { CopyButton } from '@/components/copy-button';
import { KeyValue } from '@/components/key-value';
import { Empty } from '@/components/empty';
import { formatItc } from '@/lib/format';
import { formatNumber, shortHash } from '@/lib/utils';
import { Sk, SKELETON_ROWS } from '@/components/skeleton';
import { NodeSyncingPage, NodeSyncingInline } from '@/components/node-syncing';
import { useSyncState } from '@/hooks/use-sync';

type Tab = 'txs' | 'utxos' | 'tokens' | 'stats' | 'notes';

export default function AddressPage({ params }: { params: Promise<{ addr: string }> }) {
  const { addr } = use(params);
  const [stats, setStats] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('txs');
  const syncing = useSyncState();

  const [txs, setTxs] = useState<any[]>([]);
  const [utxos, setUtxos] = useState<any[]>([]);
  const [tokens, setTokens] = useState<any[]>([]);
  const [loadingTab, setLoadingTab] = useState(false);
  const [note, setNote] = useState<string>('');

  useEffect(() => {
    api.address(addr).then(setStats).catch((e) => setError(friendlyError(e)));
    if (typeof window !== 'undefined') {
      setNote(localStorage.getItem(`vision:note:${addr}`) || '');
    }
  }, [addr]);

  useEffect(() => {
    if (!stats?.valid) return;
    setLoadingTab(true);
    const load = async () => {
      try {
        if (tab === 'txs' && txs.length === 0) {
          const r = await api.addressTxs(addr, { limit: 100 });
          setTxs(r.items);
        } else if (tab === 'utxos' && utxos.length === 0) {
          const r = await api.addressUtxos(addr);
          setUtxos(r.items);
        } else if (tab === 'tokens' && tokens.length === 0) {
          const r = await api.addressTokens(addr);
          setTokens(r.items);
        }
      } finally {
        setLoadingTab(false);
      }
    };
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, stats]);

  const saveNote = (v: string) => {
    setNote(v);
    if (typeof window !== 'undefined') localStorage.setItem(`vision:note:${addr}`, v);
  };

  if (error) return syncing ? <NodeSyncingPage /> : (
    <div className="card p-8 space-y-3">
      <p className="text-[var(--color-danger)] font-semibold">Unable to load address</p>
      <p className="text-sm text-[var(--color-text-dim)]">{error}</p>
      <button onClick={() => { setError(null); api.address(addr).then(setStats).catch((e) => setError(friendlyError(e))); }} className="text-xs text-[var(--color-accent)] hover:underline">Try again →</button>
    </div>
  );
  if (!stats) return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-2 mb-2"><Sk.Line w="w-20" h="h-5" /></div>
        <Sk.Line w="w-full" h="h-7" className="mb-2" />
      </div>
      <div className="grid sm:grid-cols-3 gap-3">
        {[0,1,2].map(i=><Sk.Card key={i}/>)}
      </div>
      <div className="card overflow-hidden">
        <div className="flex border-b border-[var(--color-border)] px-2 py-2 gap-1">
          {[0,1,2,3,4].map(i=><Sk.Line key={i} w="w-24" h="h-8"/>)}
        </div>
        <div className="p-5 divide-y divide-[var(--color-border-soft)]">
          {[0,1,2,3,4,5,6,7].map(i=><Sk.TxRow key={i}/>)}
        </div>
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-3 mb-2">
          <span className="chip">ADDRESS</span>
          {stats.is_special && stats.label && <span className="chip chip-gold">{stats.label}</span>}
        </div>
        <h1 className="text-xl lg:text-2xl mono font-bold break-all flex items-center gap-2">
          {addr}
          <CopyButton value={addr} />
        </h1>
      </div>

      {stats.electrumx_available === false && (
        <div className="card px-4 py-3 flex items-center gap-3 border border-amber-500/30 bg-amber-500/5">
          <span className="text-amber-400 text-lg">⚡</span>
          <div>
            <p className="text-sm font-medium text-amber-300">Address index temporarily offline</p>
            <p className="text-xs text-[var(--color-text-dim)] mt-0.5">
              The ElectrumX address index is unreachable right now. Balance and transaction history are unavailable — check back soon.
            </p>
          </div>
        </div>
      )}

      <div className="grid sm:grid-cols-3 gap-3">
        <div className="card p-4">
          <div className="text-[10px] uppercase tracking-wider text-[var(--color-text-faint)]">Confirmed Balance</div>
          <div className="mt-2 text-xl mono font-semibold text-[var(--color-gold)]">
            {stats.electrumx_available === false ? <span className="text-[var(--color-text-faint)] text-base">Unavailable</span> : formatItc(stats.balance.confirmed_sats)}
          </div>
        </div>
        <div className="card p-4">
          <div className="text-[10px] uppercase tracking-wider text-[var(--color-text-faint)]">Unconfirmed</div>
          <div className="mt-2 text-xl mono font-semibold">
            {stats.electrumx_available === false ? '—' : formatItc(stats.balance.unconfirmed_sats)}
          </div>
        </div>
        <div className="card p-4">
          <div className="text-[10px] uppercase tracking-wider text-[var(--color-text-faint)]">Transactions</div>
          <div className="mt-2 text-xl mono font-semibold text-[var(--color-accent)]">
            {stats.electrumx_available === false ? '—' : formatNumber(stats.tx_count)}
          </div>
        </div>
      </div>

      <div className="card overflow-hidden">
        <div className="flex border-b border-[var(--color-border)]">
          {([
            ['txs', `Transactions (${formatNumber(stats.tx_count)})`],
            ['utxos', 'UTXOs'],
            ['tokens', 'ITSL Tokens'],
            ['stats', 'Stats'],
            ['notes', 'Private Note'],
          ] as [Tab, string][]).map(([id, label]) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`px-4 py-3 text-sm border-b-2 transition ${
                tab === id
                  ? 'border-[var(--color-accent)] text-white'
                  : 'border-transparent text-[var(--color-text-dim)] hover:text-white'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="p-5">
          {loadingTab && (
            <div className="divide-y divide-[var(--color-border-soft)] -mx-5">
              {SKELETON_ROWS.slice(0, 8).map((i) => <Sk.TxRow key={i} />)}
            </div>
          )}
          {!loadingTab && tab === 'txs' && (
            txs.length === 0 ? (
              stats.electrumx_available === false
                ? <Empty title="Address index offline" hint="Transaction history is unavailable while the ElectrumX node is unreachable." />
                : syncing ? <NodeSyncingInline /> : <Empty title="No transactions yet" />
            ) :
            <div className="divide-y divide-[var(--color-border-soft)] -mx-5">
              {txs.map((t) => (
                <Link key={t.txid} href={`/tx/${t.txid}`} className="flex items-center justify-between px-5 py-2.5 hover:bg-white/5 transition mono text-xs">
                  <span className="text-[var(--color-text-dim)]">{shortHash(t.txid, 12, 8)}</span>
                  <span className="text-[var(--color-text-faint)]">{t.height ? `#${t.height}` : 'mempool'}</span>
                </Link>
              ))}
            </div>
          )}
          {!loadingTab && tab === 'utxos' && (
            utxos.length === 0 ? (
              stats.electrumx_available === false
                ? <Empty title="Address index offline" hint="UTXO data is unavailable while the ElectrumX node is unreachable." />
                : syncing ? <NodeSyncingInline /> : <Empty title="No unspent outputs" />
            ) :
            <div className="divide-y divide-[var(--color-border-soft)] -mx-5">
              {utxos.map((u) => (
                <Link key={`${u.txid}:${u.vout}`} href={`/tx/${u.txid}`} className="flex items-center justify-between px-5 py-2.5 hover:bg-white/5 transition mono text-xs">
                  <span className="text-[var(--color-text-dim)]">{shortHash(u.txid)}:{u.vout}</span>
                  <span className="text-[var(--color-gold)]">{formatItc(u.value_sats)}</span>
                </Link>
              ))}
            </div>
          )}
          {!loadingTab && tab === 'tokens' && (
            tokens.length === 0 ? (syncing ? <NodeSyncingInline /> : <Empty title="No ITSL token holdings detected" />) :
            <div className="divide-y divide-[var(--color-border-soft)] -mx-5">
              {tokens.map((t) => (
                <Link key={t.token_id} href={`/token/${t.token_id}`} className="flex items-center justify-between px-5 py-3 hover:bg-white/5 transition">
                  <div className="flex items-center gap-3">
                    <span className="font-semibold">{t.symbol}</span>
                    <span className="text-xs text-[var(--color-text-dim)]">{t.name}</span>
                    {t.verified && <span className="chip chip-gold">VERIFIED</span>}
                  </div>
                  <span className="mono text-sm text-[var(--color-gold)]">{t.balance}</span>
                </Link>
              ))}
            </div>
          )}
          {!loadingTab && tab === 'stats' && (
            <div className="space-y-0">
              <KeyValue label="Address" value={addr} copy={addr} />
              <KeyValue label="Tx Count" value={formatNumber(stats.tx_count)} />
              <KeyValue label="First Seen" value={stats.first_seen_height ? `Block #${stats.first_seen_height}` : '—'} />
              <KeyValue label="Last Seen" value={stats.last_seen_height ? `Block #${stats.last_seen_height}` : '—'} />
              <KeyValue label="Special" value={stats.is_special ? `Yes (${stats.label})` : 'No'} />
            </div>
          )}
          {!loadingTab && tab === 'notes' && (
            <div>
              <p className="text-xs text-[var(--color-text-dim)] mb-2">
                Private note stored only in your browser. Never sent to the server.
              </p>
              <textarea
                value={note}
                onChange={(e) => saveNote(e.target.value)}
                placeholder="e.g. My cold storage wallet…"
                rows={5}
                className="w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg p-3 text-sm focus:outline-none focus:border-[var(--color-accent)]"
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
