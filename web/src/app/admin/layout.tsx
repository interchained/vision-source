'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { adminToken, adminApi } from '@/lib/api';

const ADMIN_NAV = [
  { href: '/admin', label: 'Dashboard' },
  { href: '/admin/pools', label: 'Pools' },
  { href: '/admin/snapshots/new', label: 'New Snapshot' },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [ready, setReady] = useState(false);
  const [authed, setAuthed] = useState(false);
  const [tokenInput, setTokenInput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    const t = adminToken.get();
    if (t) setAuthed(true);
    setReady(true);
  }, []);

  const signIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const t = tokenInput.trim();
    if (!t) return;
    setChecking(true);
    adminToken.set(t);
    try {
      // Validate by hitting a guarded endpoint.
      await adminApi.listPools();
      setAuthed(true);
    } catch (err: any) {
      adminToken.clear();
      const status = err?.status;
      if (status === 401) setError('Invalid admin token.');
      else if (status === 503) setError('Admin access is locked (ADMIN_TOKEN not configured on the server).');
      else setError(err?.payload?.detail || err?.message || 'Sign-in failed.');
    } finally {
      setChecking(false);
    }
  };

  const signOut = () => {
    adminToken.clear();
    setAuthed(false);
    setTokenInput('');
  };

  if (!ready) return null;

  if (!authed) {
    return (
      <div className="max-w-md mx-auto mt-10">
        <div className="card p-6 space-y-5">
          <div>
            <h1 className="text-xl font-bold">Admin Access</h1>
            <p className="text-sm text-[var(--color-text-dim)] mt-1">
              Enter the admin token to manage pools and reward snapshots. The token is stored
              only in your browser.
            </p>
          </div>
          <form onSubmit={signIn} className="space-y-4">
            <input
              type="password"
              value={tokenInput}
              onChange={(e) => setTokenInput(e.target.value)}
              placeholder="Admin token"
              className="w-full bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-[var(--color-accent)]"
              autoFocus
            />
            {error && <div className="text-sm text-[var(--color-danger)]">{error}</div>}
            <button
              type="submit"
              disabled={checking || !tokenInput.trim()}
              className="w-full bg-[var(--color-accent)] text-black font-semibold rounded-lg px-4 py-2.5 text-sm disabled:opacity-50 hover:opacity-90 transition"
            >
              {checking ? 'Verifying…' : 'Unlock'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 border-b border-[var(--color-border)] pb-3">
        <div className="flex gap-1 flex-wrap">
          {ADMIN_NAV.map((n) => {
            const active = pathname === n.href;
            return (
              <Link
                key={n.href}
                href={n.href}
                className={`px-3 py-1.5 text-sm rounded ${
                  active
                    ? 'bg-[var(--color-accent)]/15 text-[var(--color-accent)]'
                    : 'text-[var(--color-text-dim)] hover:text-white'
                }`}
              >
                {n.label}
              </Link>
            );
          })}
        </div>
        <button
          onClick={signOut}
          className="text-xs text-[var(--color-text-dim)] hover:text-[var(--color-danger)] transition"
        >
          Sign out
        </button>
      </div>
      {children}
    </div>
  );
}
