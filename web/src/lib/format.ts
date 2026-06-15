/**
 * Currency conversion + display helpers.
 *
 * All values are passed around as integer satoshis (the chain's native unit).
 * The active display currency is read from localStorage by `useCurrency`.
 */
export type Currency = 'ITC' | 'sats' | 'USD';

const SATS_PER_ITC = 100_000_000;

export function satsToItc(sats: number | string): number {
  const n = typeof sats === 'string' ? Number(sats) : sats;
  return n / SATS_PER_ITC;
}

export function formatSats(sats: number, opts: { decimals?: number } = {}): string {
  const d = opts.decimals ?? 0;
  return `${sats.toLocaleString('en-US', { maximumFractionDigits: d })} sats`;
}

export function formatItc(sats: number, opts: { decimals?: number } = {}): string {
  const itc = satsToItc(sats);
  return `${itc.toLocaleString('en-US', { minimumFractionDigits: opts.decimals ?? 8, maximumFractionDigits: 8 })} ITC`;
}

/** Compact ITC display: "21.00M ITC", "1.05K ITC", "850 ITC". For large
 * supply / circulation figures where exact sats are noise. */
export function humanItc(sats: number | string, opts: { decimals?: number } = {}): string {
  const n = typeof sats === 'string' ? Number(sats) : sats;
  if (!Number.isFinite(n) || n === 0) return '0 ITC';
  const itc = n / SATS_PER_ITC;
  const d = opts.decimals ?? 2;
  const abs = Math.abs(itc);
  if (abs >= 1e9) return `${(itc / 1e9).toFixed(d)}B ITC`;
  if (abs >= 1e6) return `${(itc / 1e6).toFixed(d)}M ITC`;
  if (abs >= 1e3) return `${(itc / 1e3).toFixed(d)}K ITC`;
  return `${itc.toLocaleString('en-US', { maximumFractionDigits: d })} ITC`;
}

export function formatUsd(sats: number, priceUsd: number): string {
  if (!priceUsd) return '—';
  const usd = satsToItc(sats) * priceUsd;
  return usd.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function formatAmount(sats: number, currency: Currency, priceUsd?: number): string {
  switch (currency) {
    case 'ITC': return formatItc(sats);
    case 'sats': return formatSats(sats);
    case 'USD': return formatUsd(sats, priceUsd ?? 0);
  }
}

export function formatFeeRate(satVbyte: number): string {
  if (!Number.isFinite(satVbyte)) return '—';
  return `${satVbyte.toFixed(satVbyte < 10 ? 2 : 1)} sat/vB`;
}
