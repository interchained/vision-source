import { cn } from '@/lib/utils';
import type { ReactNode } from 'react';
import { Sk } from './skeleton';

export function StatCard({
  label,
  value,
  sub,
  accent = 'blue',
  className,
  loading = false,
}: {
  label: string;
  value?: ReactNode;
  sub?: ReactNode;
  accent?: 'blue' | 'gold' | 'green' | 'red';
  className?: string;
  loading?: boolean;
}) {
  const accentMap = {
    blue: 'text-[var(--color-accent)]',
    gold: 'text-[var(--color-gold)]',
    green: 'text-[var(--color-success)]',
    red: 'text-[var(--color-danger)]',
  } as const;

  return (
    <div className={cn('card p-4 lg:p-5', className)}>
      <div className="text-[10px] uppercase tracking-[0.18em] text-[var(--color-text-faint)] font-semibold">{label}</div>
      {loading ? (
        <>
          <Sk.Line w="w-28" h="h-7" className="mt-2 mb-2" />
          <Sk.Line w="w-20" h="h-2.5" />
        </>
      ) : (
        <>
          <div className={cn('mt-2 text-xl lg:text-2xl mono font-semibold', accentMap[accent])}>{value}</div>
          {sub && <div className="mt-1 text-xs text-[var(--color-text-dim)]">{sub}</div>}
        </>
      )}
    </div>
  );
}
