'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { adminApi, api } from '@/lib/api';
import { formatNumber } from '@/lib/utils';

const input =
  'w-full bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[var(--color-accent)]';

const DEFAULT_RATE = '0.10301990';

export default function NewSnapshotPage() {
  const router = useRouter();
  const [form, setForm] = useState({
    snapshot_name: '',
    start_height: '',
    end_height: '',
    reward_per_block: DEFAULT_RATE,
    notes: '',
  });
  const [tip, setTip] = useState<number | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.networkStats?.().then((s: any) => setTip(s?.tip_height ?? null)).catch(() => {});
  }, []);

  const run = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const start = Number(form.start_height);
    const end = Number(form.end_height);
    if (!form.snapshot_name.trim()) return setError('Snapshot name is required.');
    if (!Number.isInteger(start) || !Number.isInteger(end)) return setError('Start and end heights must be integers.');
    if (start > end) return setError('Start height must be ≤ end height.');
    setRunning(true);
    try {
      const r = await adminApi.createSnapshot({
        snapshot_name: form.snapshot_name.trim(),
        start_height: start,
        end_height: end,
        reward_per_block: form.reward_per_block.trim() || DEFAULT_RATE,
        notes: form.notes.trim() || undefined,
      });
      router.push(`/admin/snapshots/${r.snapshot.id}`);
    } catch (err: any) {
      setError(err?.payload?.detail || err?.message || 'Snapshot failed.');
      setRunning(false);
    }
  };

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-xl font-bold">Run a Treasury Grant snapshot</h1>
        <p className="text-sm text-[var(--color-text-dim)] mt-1">
          Scans the block range, matches each block&apos;s coinbase payout address to a registered
          pool, and computes grants at {DEFAULT_RATE} ITC per block.
          {tip !== null && <> Current tip: <span className="mono">{formatNumber(tip)}</span>.</>}
        </p>
      </div>

      <form onSubmit={run} className="card p-6 space-y-5">
        <label className="block">
          <span className="text-xs text-[var(--color-text-dim)]">Snapshot name *</span>
          <input className={input} value={form.snapshot_name} onChange={(e) => setForm({ ...form, snapshot_name: e.target.value })} placeholder="Week 23 (Jun 1–7)" />
        </label>
        <div className="grid grid-cols-2 gap-4">
          <label className="block">
            <span className="text-xs text-[var(--color-text-dim)]">Start height *</span>
            <input className={`${input} mono`} type="number" value={form.start_height} onChange={(e) => setForm({ ...form, start_height: e.target.value })} placeholder="0" />
          </label>
          <label className="block">
            <span className="text-xs text-[var(--color-text-dim)]">End height *</span>
            <input className={`${input} mono`} type="number" value={form.end_height} onChange={(e) => setForm({ ...form, end_height: e.target.value })} placeholder="0" />
          </label>
        </div>
        <label className="block">
          <span className="text-xs text-[var(--color-text-dim)]">Reward per block (ITC)</span>
          <input className={`${input} mono`} value={form.reward_per_block} onChange={(e) => setForm({ ...form, reward_per_block: e.target.value })} />
        </label>
        <label className="block">
          <span className="text-xs text-[var(--color-text-dim)]">Notes (optional)</span>
          <textarea className={input} rows={3} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
        </label>
        {error && <div className="text-sm text-[var(--color-danger)]">{error}</div>}
        <button type="submit" disabled={running} className="bg-[var(--color-accent)] text-black font-semibold rounded-lg px-4 py-2.5 text-sm disabled:opacity-50 hover:opacity-90 transition">
          {running ? 'Scanning blocks…' : 'Run snapshot'}
        </button>
      </form>
    </div>
  );
}
