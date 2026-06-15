'use client';

import { useEffect, useState } from 'react';
import { adminApi } from '@/lib/api';
import { Sk, SKELETON_ROWS } from '@/components/skeleton';
import { shortHash } from '@/lib/utils';

const input =
  'w-full bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[var(--color-accent)]';

type PoolForm = {
  pool_name: string;
  payout_address: string;
  coinbase_tag: string;
  website: string;
  contact_email: string;
  discord: string;
  telegram: string;
  status: string;
};

const EMPTY: PoolForm = {
  pool_name: '', payout_address: '', coinbase_tag: '', website: '',
  contact_email: '', discord: '', telegram: '', status: 'active',
};

function StatusChip({ status }: { status: string }) {
  const map: Record<string, string> = {
    active: 'chip-success',
    disabled: 'chip-danger',
    rejected: 'chip-danger',
    pending: 'chip-gold',
  };
  return <span className={`chip ${map[status] || 'chip'}`}>{status}</span>;
}

export default function AdminPoolsPage() {
  const [pools, setPools] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState<PoolForm>(EMPTY);
  const [editId, setEditId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    adminApi
      .listPools()
      .then((r) => setPools(r.pools || []))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const startEdit = (p: any) => {
    setEditId(p.id);
    setForm({
      pool_name: p.pool_name || '',
      payout_address: p.payout_address || '',
      coinbase_tag: p.coinbase_tag || '',
      website: p.website || '',
      contact_email: p.contact_email || '',
      discord: p.discord || '',
      telegram: p.telegram || '',
      status: p.status || 'active',
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const reset = () => {
    setEditId(null);
    setForm(EMPTY);
    setError(null);
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!form.pool_name.trim()) {
      setError('Pool name is required.');
      return;
    }
    setSaving(true);
    try {
      if (editId) await adminApi.updatePool(editId, form);
      else await adminApi.createPool(form);
      reset();
      load();
    } catch (err: any) {
      setError(err?.payload?.detail || err?.message || 'Save failed.');
    } finally {
      setSaving(false);
    }
  };

  const toggleStatus = async (p: any) => {
    const next = p.status === 'active' ? 'disabled' : 'active';
    setError(null);
    try {
      await adminApi.updatePool(p.id, { status: next });
      load();
    } catch (err: any) {
      setError(err?.payload?.detail || err?.message || 'Update failed.');
    }
  };

  const setStatus = async (p: any, status: string) => {
    setError(null);
    try {
      await adminApi.updatePool(p.id, { status });
      load();
    } catch (err: any) {
      setError(err?.payload?.detail || err?.message || 'Update failed.');
    }
  };

  const pending = pools.filter((p) => p.status === 'pending');
  const reviewed = pools.filter((p) => p.status !== 'pending');

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold">Mining Pools</h1>

      <form onSubmit={save} className="card p-5 space-y-4">
        <div className="text-sm font-semibold">{editId ? 'Edit pool' : 'Register a pool'}</div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <label className="block">
            <span className="text-xs text-[var(--color-text-dim)]">Pool name *</span>
            <input className={input} value={form.pool_name} onChange={(e) => setForm({ ...form, pool_name: e.target.value })} placeholder="Acme Pool" />
          </label>
          <label className="block">
            <span className="text-xs text-[var(--color-text-dim)]">Payout address (coinbase)</span>
            <input className={`${input} mono`} value={form.payout_address} onChange={(e) => setForm({ ...form, payout_address: e.target.value })} placeholder="itc1q…" />
          </label>
          <label className="block">
            <span className="text-xs text-[var(--color-text-dim)]">Coinbase tag (optional)</span>
            <input className={input} value={form.coinbase_tag} onChange={(e) => setForm({ ...form, coinbase_tag: e.target.value })} placeholder="/AcmePool/" />
          </label>
          <label className="block">
            <span className="text-xs text-[var(--color-text-dim)]">Website</span>
            <input className={input} value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} placeholder="https://…" />
          </label>
          <label className="block">
            <span className="text-xs text-[var(--color-text-dim)]">Contact email</span>
            <input className={input} value={form.contact_email} onChange={(e) => setForm({ ...form, contact_email: e.target.value })} />
          </label>
          <label className="block">
            <span className="text-xs text-[var(--color-text-dim)]">Discord</span>
            <input className={input} value={form.discord} onChange={(e) => setForm({ ...form, discord: e.target.value })} />
          </label>
          <label className="block">
            <span className="text-xs text-[var(--color-text-dim)]">Telegram</span>
            <input className={input} value={form.telegram} onChange={(e) => setForm({ ...form, telegram: e.target.value })} />
          </label>
          <label className="block">
            <span className="text-xs text-[var(--color-text-dim)]">Status</span>
            <select className={input} value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
              <option value="active">active</option>
              <option value="disabled">disabled</option>
              <option value="pending">pending</option>
              <option value="rejected">rejected</option>
            </select>
          </label>
        </div>
        {error && <div className="text-sm text-[var(--color-danger)]">{error}</div>}
        <div className="flex gap-2">
          <button type="submit" disabled={saving} className="bg-[var(--color-accent)] text-black font-semibold rounded-lg px-4 py-2 text-sm disabled:opacity-50 hover:opacity-90 transition">
            {saving ? 'Saving…' : editId ? 'Update pool' : 'Add pool'}
          </button>
          {editId && (
            <button type="button" onClick={reset} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg px-4 py-2 text-sm hover:bg-white/5 transition">
              Cancel
            </button>
          )}
        </div>
      </form>

      {!loading && pending.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold">Pending applications</h2>
            <span className="chip chip-gold">{pending.length}</span>
          </div>
          <div className="card overflow-hidden border border-[var(--color-gold)]/30">
            <div className="divide-y divide-[var(--color-border-soft)]">
              {pending.map((p) => (
                <div key={p.id} className="px-5 py-4 space-y-2">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm font-medium">{p.pool_name}</div>
                      <div className="text-xs mono text-[var(--color-text-dim)] break-all">{p.payout_address || '—'}</div>
                      <div className="text-xs text-[var(--color-text-faint)] mt-1 space-x-3">
                        {p.contact_email && <span>✉ {p.contact_email}</span>}
                        {p.website && <span>🌐 {p.website}</span>}
                        {p.discord && <span>discord: {p.discord}</span>}
                        {p.telegram && <span>tg: {p.telegram}</span>}
                      </div>
                    </div>
                    <div className="flex gap-2 shrink-0">
                      <button
                        onClick={() => setStatus(p, 'active')}
                        className="text-xs px-3 py-1.5 rounded bg-[var(--color-accent)] text-black font-semibold hover:opacity-90 transition"
                      >
                        Approve
                      </button>
                      <button
                        onClick={() => setStatus(p, 'rejected')}
                        className="text-xs px-3 py-1.5 rounded border border-[var(--color-border)] hover:bg-white/5 transition"
                      >
                        Reject
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <h2 className="text-sm font-semibold pt-2">Registered pools</h2>
      {loading ? (
        <div className="card p-5 space-y-2">
          {SKELETON_ROWS.slice(0, 4).map((i) => (
            <Sk.TableRow key={i} cols={['w-40', 'w-48', 'w-20', 'w-24']} />
          ))}
        </div>
      ) : reviewed.length === 0 ? (
        <div className="card p-8 text-center text-sm text-[var(--color-text-dim)]">No pools registered yet.</div>
      ) : (
        <div className="card overflow-hidden">
          <div className="hidden md:grid grid-cols-[1fr_1fr_120px_160px] gap-3 px-5 py-3 text-[11px] uppercase tracking-wider text-[var(--color-text-faint)] border-b border-[var(--color-border)]">
            <div>Pool</div>
            <div>Payout address</div>
            <div className="text-right">Status</div>
            <div className="text-right">Actions</div>
          </div>
          <div className="divide-y divide-[var(--color-border-soft)]">
            {reviewed.map((p) => (
              <div key={p.id} className="grid grid-cols-1 md:grid-cols-[1fr_1fr_120px_160px] gap-3 px-5 py-3 items-center">
                <div className="min-w-0">
                  <div className="text-sm font-medium truncate">{p.pool_name}</div>
                  {p.coinbase_tag && <div className="text-xs text-[var(--color-text-dim)] truncate">tag: {p.coinbase_tag}</div>}
                </div>
                <div className="text-xs mono text-[var(--color-text-dim)] truncate">
                  {p.payout_address ? shortHash(p.payout_address, 12, 10) : '—'}
                </div>
                <div className="text-right"><StatusChip status={p.status} /></div>
                <div className="flex md:justify-end gap-2">
                  <button onClick={() => startEdit(p)} className="text-xs px-2.5 py-1 rounded border border-[var(--color-border)] hover:bg-white/5 transition">Edit</button>
                  <button onClick={() => toggleStatus(p)} className="text-xs px-2.5 py-1 rounded border border-[var(--color-border)] hover:bg-white/5 transition">
                    {p.status === 'active' ? 'Disable' : 'Enable'}
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
