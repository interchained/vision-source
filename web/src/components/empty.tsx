import type { ReactNode } from 'react';

export function Empty({ title, hint, children }: { title: string; hint?: string; children?: ReactNode }) {
  return (
    <div className="card p-12 text-center">
      <div className="text-base font-semibold mb-1">{title}</div>
      {hint && <div className="text-sm text-[var(--color-text-dim)]">{hint}</div>}
      {children && <div className="mt-4">{children}</div>}
    </div>
  );
}
