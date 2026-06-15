'use client';

import { useEffect, useState } from 'react';
import { api, friendlyError } from '@/lib/api';
import { Empty } from '@/components/empty';
import { Sk, SKELETON_ROWS } from '@/components/skeleton';
import { formatNumber, shortHash } from '@/lib/utils';

function StatusChip({ status }: { status: string }) {
  const map: Record<string, string> = {
    paid: 'chip-success',
    approved: 'chip-gold',
    generated: 'chip',
    rejected: 'chip-danger',
    pending: 'chip',
  };
  return <span className={`chip ${map[status] || 'chip'}`}>{status}</span>;
}

function fmtItc(s: string | number | null | undefined): string {
  if (s === null || s === undefined || s === '') return '—';
  return `${s} ITC`;
}

function fmtDate(unix?: number | null): string {
  if (!unix) return '—';
  return new Date(unix * 1000).toLocaleDateString('en-US', {
    year: 'numeric', month: 'short', day: 'numeric',
  });
}

const applyInput =
  'w-full bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[var(--color-accent)]';

type ApplyForm = {
  pool_name: string;
  payout_address: string;
  website: string;
  contact_email: string;
  discord: string;
  telegram: string;
};

const EMPTY_APPLY: ApplyForm = {
  pool_name: '', payout_address: '', website: '', contact_email: '', discord: '', telegram: '',
};

function ApplySection() {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<ApplyForm>(EMPTY_APPLY);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!form.pool_name.trim()) { setError('Pool name is required.'); return; }
    if (!form.payout_address.trim()) { setError('Payout address is required.'); return; }
    setSubmitting(true);
    try {
      await api.applyPool({
        pool_name: form.pool_name.trim(),
        payout_address: form.payout_address.trim(),
        website: form.website.trim() || undefined,
        contact_email: form.contact_email.trim() || undefined,
        discord: form.discord.trim() || undefined,
        telegram: form.telegram.trim() || undefined,
      });
      setDone(true);
      setForm(EMPTY_APPLY);
    } catch (err: any) {
      setError(friendlyError(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="card overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-3 px-5 py-4 hover:bg-white/5 transition text-left"
      >
        <div>
          <div className="font-semibold">Are you a pool operator? Apply for the grant</div>
          <div className="text-xs text-[var(--color-text-dim)] mt-0.5">
            Register your pool&apos;s coinbase payout address. Applications are reviewed before they
            start earning per-block grants.
          </div>
        </div>
        <span className="text-[var(--color-accent)] text-sm whitespace-nowrap">
          {open ? 'Close ▲' : 'Apply ▼'}
        </span>
      </button>

      {open && (
        <div className="border-t border-[var(--color-border)] p-5">
          {done ? (
            <div className="space-y-3">
              <div className="text-sm text-[var(--color-success,#3ddc84)]">
                Application submitted. Your pool is now pending review — once approved it will start
                accruing grants on the next weekly snapshot.
              </div>
              <button
                onClick={() => setDone(false)}
                className="text-xs px-3 py-1.5 rounded border border-[var(--color-border)] hover:bg-white/5 transition"
              >
                Submit another
              </button>
            </div>
          ) : (
            <form onSubmit={submit} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <label className="block">
                  <span className="text-xs text-[var(--color-text-dim)]">Pool name *</span>
                  <input className={applyInput} value={form.pool_name} onChange={(e) => setForm({ ...form, pool_name: e.target.value })} placeholder="Acme Pool" />
                </label>
                <label className="block">
                  <span className="text-xs text-[var(--color-text-dim)]">Coinbase payout address *</span>
                  <input className={`${applyInput} mono`} value={form.payout_address} onChange={(e) => setForm({ ...form, payout_address: e.target.value })} placeholder="itc1q…" />
                </label>
                <label className="block">
                  <span className="text-xs text-[var(--color-text-dim)]">Website</span>
                  <input className={applyInput} value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} placeholder="https://…" />
                </label>
                <label className="block">
                  <span className="text-xs text-[var(--color-text-dim)]">Contact email</span>
                  <input className={applyInput} value={form.contact_email} onChange={(e) => setForm({ ...form, contact_email: e.target.value })} placeholder="ops@example.com" />
                </label>
                <label className="block">
                  <span className="text-xs text-[var(--color-text-dim)]">Discord</span>
                  <input className={applyInput} value={form.discord} onChange={(e) => setForm({ ...form, discord: e.target.value })} />
                </label>
                <label className="block">
                  <span className="text-xs text-[var(--color-text-dim)]">Telegram</span>
                  <input className={applyInput} value={form.telegram} onChange={(e) => setForm({ ...form, telegram: e.target.value })} />
                </label>
              </div>
              <p className="text-xs text-[var(--color-text-faint)]">
                Grants are matched by the coinbase payout address your pool mines to. Make sure it
                matches exactly, or your blocks won&apos;t be attributed.
              </p>
              {error && <div className="text-sm text-[var(--color-danger)]">{error}</div>}
              <button
                type="submit"
                disabled={submitting}
                className="bg-[var(--color-accent)] text-black font-semibold rounded-lg px-4 py-2 text-sm disabled:opacity-50 hover:opacity-90 transition"
              >
                {submitting ? 'Submitting…' : 'Submit application'}
              </button>
            </form>
          )}
        </div>
      )}
    </div>
  );
}

export default function PoolRewardsPage() {
  const [snapshots, setSnapshots] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [details, setDetails] = useState<Record<number, any>>({});
  const [loadingDetail, setLoadingDetail] = useState<number | null>(null);

  useEffect(() => {
    setLoading(true);
    api
      .poolSnapshots({ limit: 100 })
      .then((r) => setSnapshots(r.snapshots || []))
      .finally(() => setLoading(false));
  }, []);

  const toggle = async (id: number) => {
    if (expanded === id) {
      setExpanded(null);
      return;
    }
    setExpanded(id);
    if (!details[id]) {
      setLoadingDetail(id);
      try {
        const r = await api.poolSnapshot(id);
        setDetails((d) => ({ ...d, [id]: r }));
      } finally {
        setLoadingDetail(null);
      }
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl lg:text-3xl font-bold">Interchained Treasury Infrastructure Grant</h1>
        <p className="text-sm text-[var(--color-text-dim)] mt-1">
          Weekly snapshot grants paid to mining pool operators who help secure the network — a
          fixed treasury grant per block mined, separate from the block subsidy. Matched by
          coinbase payout address.
        </p>
      </div>

      <ApplySection />

      {loading ? (
        <div className="space-y-3">
          {SKELETON_ROWS.slice(0, 6).map((i) => (
            <div key={i} className="card p-5">
              <Sk.TableRow cols={['w-48', 'w-32', 'w-24', 'w-20']} />
            </div>
          ))}
        </div>
      ) : snapshots.length === 0 ? (
        <Empty
          title="No reward snapshots yet"
          hint="Weekly pool reward snapshots will appear here once published."
        />
      ) : (
        <div className="space-y-3">
          {snapshots.map((s) => {
            const isOpen = expanded === s.id;
            const detail = details[s.id];
            return (
              <div key={s.id} className="card overflow-hidden">
                <button
                  onClick={() => toggle(s.id)}
                  className="w-full text-left px-5 py-4 hover:bg-white/5 transition"
                >
                  <div className="flex flex-col lg:flex-row lg:items-center gap-3 lg:gap-6">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold truncate">{s.snapshot_name}</span>
                        <StatusChip status={s.status} />
                      </div>
                      <div className="text-xs text-[var(--color-text-dim)] mt-0.5">
                        Blocks {formatNumber(s.start_height)}–{formatNumber(s.end_height)} · {fmtDate(s.created_at)}
                      </div>
                    </div>
                    <div className="flex items-center gap-6 text-sm">
                      <div className="text-right">
                        <div className="text-[var(--color-text-faint)] text-[11px] uppercase tracking-wider">Blocks</div>
                        <div className="mono">{formatNumber(s.total_blocks_matched)}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-[var(--color-text-faint)] text-[11px] uppercase tracking-wider">Total Paid</div>
                        <div className="mono text-[var(--color-gold)]">{fmtItc(s.total_reward)}</div>
                      </div>
                      <span className="text-[var(--color-text-dim)]">{isOpen ? '▲' : '▼'}</span>
                    </div>
                  </div>
                </button>

                {isOpen && (
                  <div className="border-t border-[var(--color-border)] bg-black/20">
                    {loadingDetail === s.id ? (
                      <div className="p-5 space-y-2">
                        {SKELETON_ROWS.slice(0, 3).map((i) => (
                          <Sk.TableRow key={i} cols={['w-40', 'w-16', 'w-24', 'w-20']} />
                        ))}
                      </div>
                    ) : detail && detail.entries?.length ? (
                      <div className="overflow-x-auto">
                        <div className="hidden md:grid grid-cols-[1fr_1fr_100px_140px_100px] gap-3 px-5 py-2.5 text-[11px] uppercase tracking-wider text-[var(--color-text-faint)] border-b border-[var(--color-border-soft)]">
                          <div>Pool</div>
                          <div>Payout Address</div>
                          <div className="text-right">Blocks</div>
                          <div className="text-right">Reward</div>
                          <div className="text-right">Status</div>
                        </div>
                        <div className="divide-y divide-[var(--color-border-soft)]">
                          {detail.entries.map((e: any, idx: number) => (
                            <div
                              key={idx}
                              className="grid grid-cols-2 md:grid-cols-[1fr_1fr_100px_140px_100px] gap-3 px-5 py-3 items-center"
                            >
                              <div className="text-sm font-medium truncate">{e.pool_name}</div>
                              <div className="text-xs mono text-[var(--color-text-dim)] truncate">
                                {e.payout_address ? shortHash(e.payout_address, 10, 8) : '—'}
                              </div>
                              <div className="text-right text-sm mono">{formatNumber(e.blocks_found)}</div>
                              <div className="text-right text-sm mono text-[var(--color-gold)]">{fmtItc(e.total_reward)}</div>
                              <div className="text-right"><StatusChip status={e.status} /></div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <div className="p-5 text-sm text-[var(--color-text-dim)]">
                        No pools were rewarded in this snapshot.
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
