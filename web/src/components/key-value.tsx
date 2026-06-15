import { CopyButton } from './copy-button';
import type { ReactNode } from 'react';

export function KeyValue({
  label,
  value,
  copy,
  mono = true,
}: {
  label: string;
  value: ReactNode;
  copy?: string;
  mono?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-4 py-2.5 border-b border-[var(--color-border-soft)] last:border-0">
      <div className="text-xs uppercase tracking-wider text-[var(--color-text-faint)] pt-0.5 shrink-0">{label}</div>
      <div className="flex items-center gap-2 min-w-0">
        <div className={`text-sm text-right break-all ${mono ? 'mono' : ''}`}>{value}</div>
        {copy && <CopyButton value={copy} />}
      </div>
    </div>
  );
}
