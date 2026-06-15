'use client';

import { Check, Copy } from 'lucide-react';
import { useState } from 'react';

export function CopyButton({ value, label }: { value: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      onClick={async (e) => {
        e.preventDefault();
        e.stopPropagation();
        try {
          await navigator.clipboard.writeText(value);
          setDone(true);
          setTimeout(() => setDone(false), 1200);
        } catch (_e) { /* ignore */ }
      }}
      title={label || 'Copy'}
      className="inline-flex items-center justify-center w-6 h-6 rounded text-[var(--color-text-faint)] hover:text-[var(--color-accent)] hover:bg-white/5 transition"
    >
      {done ? <Check className="w-3 h-3 text-[var(--color-success)]" /> : <Copy className="w-3 h-3" />}
    </button>
  );
}
