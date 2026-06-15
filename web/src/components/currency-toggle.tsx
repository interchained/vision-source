'use client';

import { useCurrency } from '@/hooks/use-currency';
import type { Currency } from '@/lib/format';

const OPTIONS: Currency[] = ['ITC', 'sats', 'USD'];

export function CurrencyToggle() {
  const [currency, setCurrency] = useCurrency();
  return (
    <div className="inline-flex items-center bg-[var(--color-surface)] border border-[var(--color-border)] rounded-md p-0.5">
      {OPTIONS.map((c) => (
        <button
          key={c}
          onClick={() => setCurrency(c)}
          className={`px-2.5 py-1 text-[11px] font-semibold rounded mono transition ${
            currency === c
              ? 'bg-[var(--color-accent)]/15 text-[var(--color-accent)]'
              : 'text-[var(--color-text-dim)] hover:text-white'
          }`}
        >
          {c}
        </button>
      ))}
    </div>
  );
}
