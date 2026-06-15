'use client';

import { useEffect } from 'react';

/**
 * Auto-recovers from ChunkLoadError. When a client-side navigation tries to load
 * a JS chunk that no longer exists (e.g. a stale cache after a deploy), Next.js
 * throws ChunkLoadError and the navigation silently fails — the page appears not
 * to switch. We detect that error and do a single hard reload (loop-guarded via
 * sessionStorage) so the browser fetches a fresh, consistent set of assets.
 */
export function ChunkErrorReloader() {
  useEffect(() => {
    const KEY = 'vision_chunk_reload_at';

    const isChunkError = (msg?: unknown): boolean => {
      if (typeof msg !== 'string') return false;
      return (
        msg.includes('ChunkLoadError') ||
        msg.includes('Loading chunk') ||
        msg.includes('Loading CSS chunk') ||
        msg.includes('dynamically imported module')
      );
    };

    const recover = () => {
      try {
        const last = Number(sessionStorage.getItem(KEY) || '0');
        if (Date.now() - last < 10_000) return; // avoid reload loops
        sessionStorage.setItem(KEY, String(Date.now()));
      } catch {
        /* sessionStorage may be unavailable — still attempt one reload */
      }
      window.location.reload();
    };

    const onError = (e: ErrorEvent) => {
      if (isChunkError(e?.message) || isChunkError((e?.error as Error)?.name) || isChunkError((e?.error as Error)?.message)) {
        recover();
      }
    };

    const onRejection = (e: PromiseRejectionEvent) => {
      const r = e?.reason;
      if (isChunkError(typeof r === 'string' ? r : (r as Error)?.name) || isChunkError((r as Error)?.message)) {
        recover();
      }
    };

    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onRejection);
    return () => {
      window.removeEventListener('error', onError);
      window.removeEventListener('unhandledrejection', onRejection);
    };
  }, []);

  return null;
}
