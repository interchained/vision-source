'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { adminApi } from '@/lib/api';
import { Sk, SKELETON_ROWS } from '@/components/skeleton';
import { formatNumber, shortHash } from '@/lib/utils';

function StatusChip({ status }: { status: string }) {
  const map: Record<string, string> = {
    paid: 'chip-success',
    approved: 'chip-gold',
    generated: 'chip',
    draft: 'chip',
    rejected: 'chip-danger',
    active: 'chip-success',
    disabled: 'chip-danger',
  };
  return <span className={`chip ${map[status] || 'chip'}`}>{status}</span>;
}

function fmtDate(unix?: number | null): string {
  if (!unix) return '—';
  return new Date(unix * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function AdminDashboard() {
  const [pools, setPools] = useState<any[]>([]);
  const [snapshots, setSnapshots] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [cleaning, setCleaning] = useState(false);

  useEffect(() => {
    Promise.all([adminApi.listPools(), adminApi.listSnapshots({ limit: 20 })])
      .then(([p, s]) => {
        setPools(p.pools || []);
        setSnapshots(s.snapshots || []);
      })
      .finally(() => setLoading(false));
  }, []);

  const deleteSnapshot = async (s: any) => {
    if (!window.confirm(`Delete snapshot "${s.snapshot_name}"? This removes its results permanently.`)) return;
    setBusyId(s.id);
    try {
      await adminApi.deleteSnapshot(s.id);
      setSnapshots((cur) => cur.filter((x) => x.id !== s.id));
    } catch (err: any) {
      alert(err?.payload?.detail || err?.message || 'Delete failed.');
    } finally {
      setBusyId(null);
    }
  };

  const cleanupSnapshots = async () => {
    if (!window.confirm('Delete all failed and unfinished (draft) snapshots? This cannot be undone.')) return;
    setCleaning(true);
    try {
      await adminApi.cleanupSnapshots(['failed', 'draft']);
      const s = await adminApi.listSnapshots({ limit: 20 });
      setSnapshots(s.snapshots || []);
    } catch (err: any) {
      alert(err?.payload?.detail || err?.message || 'Cleanup failed.');
    } finally {
      setCleaning(false);
    }
  };

  const pendingCount = pools.filter((p) => p.status === 'pending').length;

  return (
    <div className="space-y-8">
      {!loading && pendingCount > 0 && (
        <Link
          href="/admin/pools"
          className="block card p-4 border border-[var(--color-gold)]/40 bg-[var(--color-gold)]/5 hover:bg-[var(--color-gold)]/10 transition"
        >
          <span className="text-sm font-semibold text-[var(--color-gold)]">
            {pendingCount} pending application{pendingCount === 1 ? '' : 's'} awaiting review
          </span>
          <span className="text-sm text-[var(--color-text-dim)]"> — review in Pools →</span>
        </Link>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        <div className="card p-5">
          <div className="text-[11px] uppercase tracking-wider text-[var(--color-text-faint)]">Registered Pools</div>
          <div className="text-2xl font-bold mt-1">{loading ? '—' : formatNumber(pools.length)}</div>
        </div>
        <div className="card p-5">
          <div className="text-[11px] uppercase tracking-wider text-[var(--color-text-faint)]">Active Pools</div>
          <div className="text-2xl font-bold mt-1">
            {loading ? '—' : formatNumber(pools.filter((p) => p.status === 'active').length)}
          </div>
        </div>
        <div className="card p-5">
          <div className="text-[11px] uppercase tracking-wider text-[var(--color-text-faint)]">Pending</div>
          <div className="text-2xl font-bold mt-1">{loading ? '—' : formatNumber(pendingCount)}</div>
        </div>
        <div className="card p-5">
          <div className="text-[11px] uppercase tracking-wider text-[var(--color-text-faint)]">Snapshots</div>
          <div className="text-2xl font-bold mt-1">{loading ? '—' : formatNumber(snapshots.length)}</div>
        </div>
      </div>

      <div className="flex flex-wrap gap-3">
        <Link
          href="/admin/snapshots/new"
          className="bg-[var(--color-accent)] text-black font-semibold rounded-lg px-4 py-2.5 text-sm hover:opacity-90 transition"
        >
          + Run a snapshot
        </Link>
        <Link
          href="/admin/pools"
          className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg px-4 py-2.5 text-sm hover:bg-white/5 transition"
        >
          Manage pools
        </Link>
      </div>

      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold">Recent snapshots</h2>
          {!loading && snapshots.some((s) => s.status === 'failed' || s.status === 'draft') && (
            <button
              disabled={cleaning}
              onClick={cleanupSnapshots}
              className="text-xs px-3 py-1.5 rounded border border-[var(--color-danger)]/30 text-[var(--color-danger)] disabled:opacity-40 hover:bg-[var(--color-danger)]/10 transition"
            >
              {cleaning ? 'Cleaning…' : 'Clean up failed/unfinished'}
            </button>
          )}
        </div>
        {loading ? (
          <div className="card p-5 space-y-2">
            {SKELETON_ROWS.slice(0, 5).map((i) => (
              <Sk.TableRow key={i} cols={['w-48', 'w-32', 'w-24', 'w-20']} />
            ))}
          </div>
        ) : snapshots.length === 0 ? (
          <div className="card p-8 text-center text-sm text-[var(--color-text-dim)]">
            No snapshots yet. <Link href="/admin/snapshots/new" className="text-[var(--color-accent)]">Run one →</Link>
          </div>
        ) : (
          <div className="card overflow-hidden">
            <div className="hidden md:grid grid-cols-[1fr_160px_120px_140px_100px_44px] gap-3 px-5 py-3 text-[11px] uppercase tracking-wider text-[var(--color-text-faint)] border-b border-[var(--color-border)]">
              <div>Name</div>
              <div>Range</div>
              <div className="text-right">Blocks</div>
              <div className="text-right">Total</div>
              <div className="text-right">Status</div>
              <div></div>
            </div>
            <div className="divide-y divide-[var(--color-border-soft)]">
              {snapshots.map((s) => (
                <div
                  key={s.id}
                  className="grid grid-cols-2 md:grid-cols-[1fr_160px_120px_140px_100px_44px] gap-3 px-5 py-3 hover:bg-white/5 transition items-center"
                >
                  <Link href={`/admin/snapshots/${s.id}`} className="min-w-0">
                    <div className="text-sm font-medium truncate">{s.snapshot_name}</div>
                    <div className="text-xs text-[var(--color-text-dim)]">{fmtDate(s.created_at)}</div>
                  </Link>
                  <div className="text-xs mono text-[var(--color-text-dim)]">
                    {formatNumber(s.start_height)}–{formatNumber(s.end_height)}
                  </div>
                  <div className="text-right text-sm mono">{formatNumber(s.total_blocks_matched)}</div>
                  <div className="text-right text-sm mono text-[var(--color-gold)]">{s.total_reward} ITC</div>
                  <div className="text-right"><StatusChip status={s.status} /></div>
                  <div className="text-right">
                    <button
                      disabled={busyId === s.id}
                      onClick={() => deleteSnapshot(s)}
                      title="Delete snapshot"
                      aria-label="Delete snapshot"
                      className="text-xs px-2 py-1 rounded text-[var(--color-text-faint)] hover:text-[var(--color-danger)] hover:bg-[var(--color-danger)]/10 disabled:opacity-40 transition"
                    >
                      {busyId === s.id ? '…' : '✕'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
