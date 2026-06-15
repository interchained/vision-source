'use client';

import Link from 'next/link';
import { useState } from 'react';
import { api } from '@/lib/api';
import { CopyButton } from '@/components/copy-button';
import { formatItc } from '@/lib/format';

type Step = 'form' | 'review' | 'confirmed';

export default function DeployPage() {
  const [step, setStep] = useState<Step>('form');
  const [form, setForm] = useState({
    name: '',
    symbol: '',
    decimals: 8,
    amount: '1000000',
    wif_key: '',
    witness: true,
  });
  const [estimate, setEstimate] = useState<any>(null);
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const review = async () => {
    setError(null);
    setLoading(true);
    try {
      const e = await api.estimateDeploy({
        name: form.name,
        symbol: form.symbol,
        decimals: form.decimals,
        amount: form.amount,
      });
      setEstimate(e);
      setStep('review');
    } catch (err: any) {
      const p = err?.payload;
      setError(p?.message || err.message || 'Estimate failed.');
    } finally {
      setLoading(false);
    }
  };

  const broadcast = async () => {
    setError(null);
    setLoading(true);
    try {
      const r = await api.deploy(form);
      setResult(r);
      setStep('confirmed');
    } catch (err: any) {
      const p = err?.payload;
      // Build a readable message: node error message + code hint if present.
      const base = p?.message || err.message || 'Broadcast failed.';
      const detail = p?.code ? ` (${p.code}${p?.hint ? ` · ${p.hint}` : ''})` : '';
      setError(base + detail);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl lg:text-3xl font-bold">Deploy an ITSL Token</h1>
        <p className="text-sm text-[var(--color-text-dim)] mt-1">
          Issue a new native token on the Interchained network. Your WIF key signs the
          transaction client-side via the node — Vision never stores it.
        </p>
      </div>

      <div className="card p-6 space-y-5">
        {step === 'form' && (
          <>
            <Field label="Token Name" hint="Display name (e.g., Interchained Gold)">
              <input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                maxLength={64}
                className={input}
                placeholder="Interchained Gold"
              />
            </Field>
            <Field label="Symbol" hint="Short ticker (e.g., IGOLD)">
              <input
                value={form.symbol}
                onChange={(e) => setForm({ ...form, symbol: e.target.value.toUpperCase() })}
                maxLength={16}
                className={`${input} uppercase`}
                placeholder="IGOLD"
              />
            </Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Decimals" hint="0 – 18">
                <input
                  type="number"
                  min={0}
                  max={18}
                  value={form.decimals}
                  onChange={(e) => setForm({ ...form, decimals: Number(e.target.value) })}
                  className={input}
                />
              </Field>
              <Field label="Initial Supply" hint="Total tokens to mint (in smallest unit)">
                <input
                  value={form.amount}
                  onChange={(e) => setForm({ ...form, amount: e.target.value })}
                  className={input}
                  placeholder="1000000"
                />
              </Field>
            </div>
            <Field
              label="WIF Private Key"
              hint="Used for signing. Forwarded directly to the node, never stored."
            >
              <input
                type="password"
                value={form.wif_key}
                onChange={(e) => setForm({ ...form, wif_key: e.target.value })}
                className={`${input} mono`}
                placeholder="K…"
              />
            </Field>
            <label className="flex items-center gap-2 text-xs text-[var(--color-text-dim)]">
              <input
                type="checkbox"
                checked={form.witness}
                onChange={(e) => setForm({ ...form, witness: e.target.checked })}
                className="accent-[var(--color-accent)]"
              />
              Use witness signature (recommended)
            </label>
            {error && <div className="text-xs text-[var(--color-danger)]">{error}</div>}
            <button
              disabled={!form.name || !form.symbol || !form.wif_key || loading}
              onClick={review}
              className="w-full py-3 bg-[var(--color-accent)] hover:bg-[var(--color-accent-glow)] text-black font-semibold rounded-lg disabled:opacity-40 disabled:cursor-not-allowed transition"
            >
              {loading ? 'Estimating…' : 'Review →'}
            </button>
          </>
        )}

        {step === 'review' && estimate && (
          <>
            <h2 className="text-lg font-semibold mb-2">Review your deployment</h2>
            <Row label="Token" value={`${form.name} (${form.symbol})`} />
            <Row label="Decimals" value={String(form.decimals)} />
            <Row label="Initial Supply" value={form.amount} />
            <Row label="Witness Signature" value={form.witness ? 'Yes' : 'No'} />
            <div className="border-t border-[var(--color-border)] pt-3">
              <Row label="Estimated Fee" value={<span className="text-[var(--color-gold)]">{formatItc(estimate.estimated_fee_sats)}</span>} />
              <Row label="Estimated vSize" value={`${estimate.estimated_vbytes} vB`} />
              <p className="text-[11px] text-[var(--color-text-faint)] mt-2">{estimate.note}</p>
            </div>
            {error && <div className="text-xs text-[var(--color-danger)]">{error}</div>}
            <div className="grid grid-cols-2 gap-3">
              <button onClick={() => setStep('form')} className="py-3 border border-[var(--color-border)] rounded-lg text-sm hover:border-[var(--color-accent)]">
                ← Edit
              </button>
              <button
                disabled={loading}
                onClick={broadcast}
                className="py-3 bg-[var(--color-gold)] hover:bg-[var(--color-gold-soft)] text-black font-semibold rounded-lg disabled:opacity-40"
              >
                {loading ? 'Broadcasting…' : 'Confirm & Deploy'}
              </button>
            </div>
          </>
        )}

        {step === 'confirmed' && result && (
          <div className="text-center space-y-4">
            <div className="text-5xl">✨</div>
            <h2 className="text-lg font-semibold">Token deployed!</h2>
            <div className="text-sm text-[var(--color-text-dim)]">
              Your <span className="text-[var(--color-gold)] font-semibold">{form.symbol}</span> token has been broadcast to the network.
            </div>
            {result.txid && (
              <div className="card p-3 mono text-xs flex items-center justify-between gap-2 break-all">
                <Link href={`/tx/${result.txid}`} className="text-[var(--color-accent)] truncate">{result.txid}</Link>
                <CopyButton value={result.txid} />
              </div>
            )}
            {result.token_id && (
              <Link href={`/token/${result.token_id}`} className="inline-block px-4 py-2 bg-[var(--color-accent)]/15 text-[var(--color-accent)] rounded-lg text-sm">
                View token →
              </Link>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

const input = 'w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[var(--color-accent)]';

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs uppercase tracking-wider text-[var(--color-text-faint)] mb-1.5">{label}</label>
      {children}
      {hint && <p className="mt-1 text-[11px] text-[var(--color-text-dim)]">{hint}</p>}
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between py-1.5 text-sm">
      <span className="text-[var(--color-text-dim)]">{label}</span>
      <span className="mono">{value}</span>
    </div>
  );
}
