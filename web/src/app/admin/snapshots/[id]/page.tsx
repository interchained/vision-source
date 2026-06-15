'use client';

import { useParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { adminApi } from '@/lib/api';
import { Sk, SKELETON_ROWS } from '@/components/skeleton';
import { formatNumber, shortHash } from '@/lib/utils';

function StatusChip({ status }: { status: string }) {
  const map: Record<string, string> = {
    paid: 'chip-success',
    approved: 'chip-gold',
    generated: 'chip',
    draft: 'chip',
    pending: 'chip',
    rejected: 'chip-danger',
    failed: 'chip-danger',
  };
  const label = status === 'draft' ? 'scanning…' : status;
  return <span className={`chip ${map[status] || 'chip'}`}>{label}</span>;
}

function fmtDate(unix?: number | null): string {
  if (!unix) return '—';
  return new Date(unix * 1000).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });
}

export default function SnapshotDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = Number(params.id);
  const [snap, setSnap] = useState<any>(null);
  const [entries, setEntries] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [txidDraft, setTxidDraft] = useState<Record<number, string>>({});

  const load = useCallback(async (opts?: { silent?: boolean }) => {
    if (!opts?.silent) setLoading(true);
    try {
      const r = await adminApi.getSnapshot(id);
      setSnap(r.snapshot);
      setEntries(r.entries || []);
    } catch (err: any) {
      setError(err?.payload?.detail || err?.message || 'Failed to load snapshot.');
    } finally {
      if (!opts?.silent) setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    if (Number.isInteger(id)) load();
  }, [id, load]);

  // While the snapshot is still scanning (status === 'draft'), poll for updates
  // so the page flips to results automatically once the background scan finishes.
  useEffect(() => {
    if (snap?.status !== 'draft') return;
    const t = setInterval(() => load({ silent: true }), 2000);
    return () => clearInterval(t);
  }, [snap?.status, load]);

  const setStatus = async (status: string) => {
    setBusy(true);
    setError(null);
    try {
      await adminApi.setSnapshotStatus(id, status);
      await load();
    } catch (err: any) {
      setError(err?.payload?.detail || err?.message || 'Update failed.');
    } finally {
      setBusy(false);
    }
  };

  const deleteSnapshot = async () => {
    if (!window.confirm(`Delete snapshot "${snap?.snapshot_name}"? This removes its results permanently.`)) return;
    setBusy(true);
    setError(null);
    try {
      await adminApi.deleteSnapshot(id);
      router.push('/admin');
    } catch (err: any) {
      setError(err?.payload?.detail || err?.message || 'Delete failed.');
      setBusy(false);
    }
  };

  const updateEntry = async (entryId: number, body: { status?: string; txid?: string }) => {
    setBusy(true);
    setError(null);
    try {
      await adminApi.updateEntry(id, entryId, body);
      await load();
    } catch (err: any) {
      setError(err?.payload?.detail || err?.message || 'Update failed.');
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="card p-5 space-y-2">
        {SKELETON_ROWS.slice(0, 5).map((i) => (
          <Sk.TableRow key={i} cols={['w-48', 'w-24', 'w-32', 'w-20']} />
        ))}
      </div>
    );
  }

  if (!snap) {
    return <div className="card p-8 text-center text-sm text-[var(--color-danger)]">{error || 'Snapshot not found.'}</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold">{snap.snapshot_name}</h1>
            <StatusChip status={snap.status} />
          </div>
          <div className="text-sm text-[var(--color-text-dim)] mt-1">
            Blocks {formatNumber(snap.start_height)}–{formatNumber(snap.end_height)} · {snap.reward_per_block} ITC/block · {fmtDate(snap.created_at)}
          </div>
          {snap.notes && <div className="text-sm text-[var(--color-text-dim)] mt-2">{snap.notes}</div>}
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => adminApi.downloadResultsCsv(id)} className="text-sm px-3 py-2 rounded border border-[var(--color-border)] hover:bg-white/5 transition">
            Results CSV
          </button>
          <button onClick={() => adminApi.downloadPayoutsCsv(id)} className="text-sm px-3 py-2 rounded bg-[var(--color-gold)]/15 text-[var(--color-gold)] border border-[var(--color-gold)]/30 hover:bg-[var(--color-gold)]/25 transition">
            Payouts CSV
          </button>
          <button disabled={busy} onClick={deleteSnapshot} className="text-sm px-3 py-2 rounded bg-[var(--color-danger)]/15 text-[var(--color-danger)] border border-[var(--color-danger)]/30 disabled:opacity-40 hover:bg-[var(--color-danger)]/25 transition">
            Delete
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="card p-4">
          <div className="text-[11px] uppercase tracking-wider text-[var(--color-text-faint)]">Scanned</div>
          <div className="text-xl font-bold mt-1 mono">{formatNumber(snap.total_blocks_scanned)}</div>
        </div>
        <div className="card p-4">
          <div className="text-[11px] uppercase tracking-wider text-[var(--color-text-faint)]">Matched</div>
          <div className="text-xl font-bold mt-1 mono">{formatNumber(snap.total_blocks_matched)}</div>
        </div>
        <div className="card p-4">
          <div className="text-[11px] uppercase tracking-wider text-[var(--color-text-faint)]">Pools</div>
          <div className="text-xl font-bold mt-1 mono">{formatNumber(entries.length)}</div>
        </div>
        <div className="card p-4">
          <div className="text-[11px] uppercase tracking-wider text-[var(--color-text-faint)]">Total Reward</div>
          <div className="text-xl font-bold mt-1 mono text-[var(--color-gold)]">{snap.total_reward} ITC</div>
        </div>
      </div>

      {snap.status !== 'draft' && snap.status !== 'failed' && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-[var(--color-text-dim)]">Snapshot actions:</span>
          <button disabled={busy || snap.status === 'approved'} onClick={() => setStatus('approved')} className="text-sm px-3 py-1.5 rounded bg-[var(--color-gold)]/15 text-[var(--color-gold)] border border-[var(--color-gold)]/30 disabled:opacity-40 hover:bg-[var(--color-gold)]/25 transition">
            Approve all
          </button>
          <button disabled={busy || snap.status === 'paid'} onClick={() => setStatus('paid')} className="text-sm px-3 py-1.5 rounded bg-[var(--color-success)]/15 text-[var(--color-success)] border border-[var(--color-success)]/30 disabled:opacity-40 hover:bg-[var(--color-success)]/25 transition">
            Mark all paid
          </button>
          <button disabled={busy || snap.status === 'rejected'} onClick={() => setStatus('rejected')} className="text-sm px-3 py-1.5 rounded bg-[var(--color-danger)]/15 text-[var(--color-danger)] border border-[var(--color-danger)]/30 disabled:opacity-40 hover:bg-[var(--color-danger)]/25 transition">
            Reject
          </button>
        </div>
      )}

      {error && <div className="text-sm text-[var(--color-danger)]">{error}</div>}

      {snap.status === 'draft' ? (
        <div className="card p-8 text-center text-sm text-[var(--color-text-dim)]">
          <div className="inline-block h-4 w-4 rounded-full border-2 border-[var(--color-accent)] border-t-transparent animate-spin align-middle mr-2" />
          Scanning {formatNumber(snap.end_height - snap.start_height + 1)} blocks… this runs in the
          background and the page will update automatically when it finishes.
        </div>
      ) : snap.status === 'failed' ? (
        <div className="card p-8 text-center text-sm text-[var(--color-danger)]">
          Snapshot scan failed{snap.notes ? `: ${snap.notes}` : '.'}
        </div>
      ) : entries.length === 0 ? (
        <div className="card p-8 text-center text-sm text-[var(--color-text-dim)]">No pools matched in this snapshot range.</div>
      ) : (
        <div className="card overflow-hidden">
          <div className="hidden lg:grid grid-cols-[1fr_1fr_90px_130px_100px_1fr] gap-3 px-5 py-3 text-[11px] uppercase tracking-wider text-[var(--color-text-faint)] border-b border-[var(--color-border)]">
            <div>Pool</div>
            <div>Payout address</div>
            <div className="text-right">Blocks</div>
            <div className="text-right">Reward</div>
            <div className="text-center">Status</div>
            <div>Payout txid / actions</div>
          </div>
          <div className="divide-y divide-[var(--color-border-soft)]">
            {entries.map((e) => (
              <div key={e.id} className="grid grid-cols-1 lg:grid-cols-[1fr_1fr_90px_130px_100px_1fr] gap-3 px-5 py-3 items-center">
                <div className="text-sm font-medium truncate">{e.pool_name}</div>
                <div className="text-xs mono text-[var(--color-text-dim)] truncate">
                  {e.payout_address ? shortHash(e.payout_address, 10, 8) : '—'}
                </div>
                <div className="lg:text-right text-sm mono">{formatNumber(e.blocks_found)}</div>
                <div className="lg:text-right text-sm mono text-[var(--color-gold)]">{e.total_reward} ITC</div>
                <div className="lg:text-center"><StatusChip status={e.status} /></div>
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    className="flex-1 min-w-[120px] bg-[var(--color-surface)] border border-[var(--color-border)] rounded px-2 py-1 text-xs mono focus:outline-none focus:border-[var(--color-accent)]"
                    placeholder="txid"
                    defaultValue={e.txid || ''}
                    onChange={(ev) => setTxidDraft((d) => ({ ...d, [e.id]: ev.target.value }))}
                  />
                  <button
                    disabled={busy}
                    onClick={() => updateEntry(e.id, { txid: txidDraft[e.id] ?? e.txid ?? '', status: 'paid' })}
                    className="text-xs px-2 py-1 rounded bg-[var(--color-success)]/15 text-[var(--color-success)] border border-[var(--color-success)]/30 disabled:opacity-40 hover:bg-[var(--color-success)]/25 transition"
                  >
                    Paid
                  </button>
                  <button
                    disabled={busy}
                    onClick={() => updateEntry(e.id, { status: 'approved' })}
                    className="text-xs px-2 py-1 rounded border border-[var(--color-border)] disabled:opacity-40 hover:bg-white/5 transition"
                  >
                    Approve
                  </button>
                  <button
                    disabled={busy}
                    onClick={() => updateEntry(e.id, { status: 'rejected' })}
                    className="text-xs px-2 py-1 rounded border border-[var(--color-border)] text-[var(--color-danger)] disabled:opacity-40 hover:bg-white/5 transition"
                  >
                    Reject
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
