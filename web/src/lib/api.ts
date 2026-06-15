/** Lightweight fetch-based API client. */

// Browser: always use '' so requests go to the same HTTPS origin (no mixed content).
// Server (SSR/RSC): use the private internal address; API_BASE_INTERNAL is never
// baked into the client bundle because it has no NEXT_PUBLIC_ prefix.
const BASE =
  typeof window === 'undefined'
    ? (process.env.API_BASE_INTERNAL || 'http://127.0.0.1:8080')
    : '';

export class ApiError extends Error {
  constructor(public status: number, public payload: any) {
    super(payload?.message || `HTTP ${status}`);
  }
}

/* ── Sync bus ─────────────────────────────────────────────────────────────
   Module-level observable: any component can subscribe to node sync state.

   Rules:
   - 503 response  → syncing = true  immediately (node is loading)
   - 200 response  → schedule clearing after CLEAR_DELAY ms; cancel if
                     another 503 arrives before the timer fires
   - This prevents flickering when some endpoints return 200 (empty) while
     others still return 503 during the same node startup window.
──────────────────────────────────────────────────────────────────────────── */
type SyncListener = (syncing: boolean) => void;
const _syncListeners = new Set<SyncListener>();
let _syncing = false;
let _clearTimer: ReturnType<typeof setTimeout> | null = null;
const CLEAR_DELAY = 6000; // ms of uninterrupted 200s before declaring "ready"

export const syncBus = {
  get current() { return _syncing; },
  subscribe(l: SyncListener): () => void {
    _syncListeners.add(l);
    return () => _syncListeners.delete(l);
  },
  _emit(v: boolean) {
    if (v) {
      // 503: go syncing immediately and cancel any pending clear
      if (_clearTimer) { clearTimeout(_clearTimer); _clearTimer = null; }
      if (!_syncing) {
        _syncing = true;
        _syncListeners.forEach((l) => l(true));
      }
    } else {
      // 200: only clear after CLEAR_DELAY of no 503s
      if (!_syncing) return;          // already clear — nothing to do
      if (_clearTimer) return;        // timer already running — let it ride
      _clearTimer = setTimeout(() => {
        _clearTimer = null;
        _syncing = false;
        _syncListeners.forEach((l) => l(false));
      }, CLEAR_DELAY);
    }
  },
};

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const url = path.startsWith('http') ? path : `${BASE}${path.startsWith('/api') ? path : `/api${path}`}`;
  const r = await fetch(url, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) },
    cache: 'no-store',
  });
  if (!r.ok) {
    let body: any;
    try { body = await r.json(); } catch (_e) { body = null; }
    if (r.status === 503) syncBus._emit(true);
    throw new ApiError(r.status, body);
  }
  syncBus._emit(false);
  return r.json();
}

export const api = {
  health: () => request<any>('/health'),
  networkStats: () => request<any>('/stats/network'),
  price: () => request<any>('/stats/price'),
  supply: () => request<any>('/stats/supply'),
  indexerStatus: () => request<any>('/stats/indexer'),
  tip: () => request<any>('/blocks/tip'),
  blocks: (opts?: { limit?: number; before_height?: number }) => {
    const p = new URLSearchParams();
    if (opts?.limit) p.set('limit', String(opts.limit));
    if (opts?.before_height !== undefined) p.set('before_height', String(opts.before_height));
    return request<any>(`/blocks${p.toString() ? `?${p}` : ''}`);
  },
  block: (id: string | number) => request<any>(`/block/${id}`),
  tx: (txid: string) => request<any>(`/tx/${txid}`),
  broadcast: (hex: string) => request<any>('/tx/broadcast', { method: 'POST', body: JSON.stringify({ hex }) }),
  address: (addr: string) => request<any>(`/address/${addr}`),
  addressTxs: (addr: string, opts?: { limit?: number; offset?: number }) => {
    const p = new URLSearchParams();
    if (opts?.limit) p.set('limit', String(opts.limit));
    if (opts?.offset) p.set('offset', String(opts.offset));
    return request<any>(`/address/${addr}/txs${p.toString() ? `?${p}` : ''}`);
  },
  addressUtxos: (addr: string) => request<any>(`/address/${addr}/utxos`),
  addressTokens: (addr: string) => request<any>(`/address/${addr}/tokens`),
  mempoolSummary: () => request<any>('/mempool/summary'),
  mempoolTxs: (limit = 50) => request<any>(`/mempool/txs?limit=${limit}`),
  mempoolProjected: (blocks = 8) => request<any>(`/mempool/projected?blocks=${blocks}`),
  tokens: (opts?: { sort?: string; q?: string; verified?: boolean; limit?: number; offset?: number }) => {
    const p = new URLSearchParams();
    if (opts?.sort) p.set('sort', opts.sort);
    if (opts?.q) p.set('q', opts.q);
    if (opts?.verified !== undefined) p.set('verified', String(opts.verified));
    if (opts?.limit) p.set('limit', String(opts.limit));
    if (opts?.offset) p.set('offset', String(opts.offset));
    return request<any>(`/tokens${p.toString() ? `?${p}` : ''}`);
  },
  token: (id: string) => request<any>(`/token/${id}`),
  tokenHistory: (id: string, opts?: { address?: string; limit?: number }) => {
    const p = new URLSearchParams();
    if (opts?.address) p.set('address', opts.address);
    if (opts?.limit) p.set('limit', String(opts.limit));
    return request<any>(`/token/${id}/history${p.toString() ? `?${p}` : ''}`);
  },
  search: (q: string) => request<any>(`/search?q=${encodeURIComponent(q)}`),
  estimateDeploy: (body: any) => request<any>('/deploy/estimate', { method: 'POST', body: JSON.stringify(body) }),
  deploy: (body: any) => request<any>('/deploy', { method: 'POST', body: JSON.stringify(body) }),

  // ── Pool Operator Snapshot Rewards (public) ──
  poolSnapshots: (opts?: { limit?: number; offset?: number }) => {
    const p = new URLSearchParams();
    if (opts?.limit) p.set('limit', String(opts.limit));
    if (opts?.offset) p.set('offset', String(opts.offset));
    return request<any>(`/pools/snapshots${p.toString() ? `?${p}` : ''}`);
  },
  poolSnapshot: (id: number | string) => request<any>(`/pools/snapshots/${id}`),
  // Public grant application by a pool operator (creates a pending pool).
  applyPool: (body: {
    pool_name: string;
    payout_address: string;
    coinbase_tag?: string;
    website?: string;
    contact_email?: string;
    discord?: string;
    telegram?: string;
  }) => request<any>('/pools/apply', { method: 'POST', body: JSON.stringify(body) }),
};

/* ── Admin API (Pool Operator Snapshot Rewards) ───────────────────────────
   All admin calls carry the operator's shared secret in the X-Admin-Token
   header. The token is held only in localStorage (browser) — never baked into
   the bundle. */

const ADMIN_TOKEN_KEY = 'vision_admin_token';

export const adminToken = {
  get(): string {
    if (typeof window === 'undefined') return '';
    return window.localStorage.getItem(ADMIN_TOKEN_KEY) || '';
  },
  set(token: string) {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(ADMIN_TOKEN_KEY, token);
  },
  clear() {
    if (typeof window === 'undefined') return;
    window.localStorage.removeItem(ADMIN_TOKEN_KEY);
  },
};

function adminRequest<T>(path: string, init?: RequestInit): Promise<T> {
  return request<T>(path, {
    ...init,
    headers: { 'X-Admin-Token': adminToken.get(), ...(init?.headers || {}) },
  });
}

/** Absolute URL for a CSV download (so the browser can navigate to it). The
 *  token is appended via a one-shot fetch + blob since downloads can't set
 *  custom headers from an <a>. */
export async function adminDownloadCsv(path: string, filename: string): Promise<void> {
  const url = `${BASE}${path.startsWith('/api') ? path : `/api${path}`}`;
  const r = await fetch(url, { headers: { 'X-Admin-Token': adminToken.get() }, cache: 'no-store' });
  if (!r.ok) {
    let body: any = null;
    try { body = await r.json(); } catch (_e) { /* noop */ }
    throw new ApiError(r.status, body);
  }
  const blob = await r.blob();
  const objectUrl = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = objectUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.URL.revokeObjectURL(objectUrl);
}

export const adminApi = {
  // Pools
  listPools: (status?: string) =>
    adminRequest<any>(`/admin/pools${status ? `?status=${status}` : ''}`),
  createPool: (body: any) =>
    adminRequest<any>('/admin/pools', { method: 'POST', body: JSON.stringify(body) }),
  updatePool: (id: number, body: any) =>
    adminRequest<any>(`/admin/pools/${id}`, { method: 'PUT', body: JSON.stringify(body) }),

  // Snapshots
  listSnapshots: (opts?: { limit?: number; offset?: number }) => {
    const p = new URLSearchParams();
    if (opts?.limit) p.set('limit', String(opts.limit));
    if (opts?.offset) p.set('offset', String(opts.offset));
    return adminRequest<any>(`/admin/snapshots${p.toString() ? `?${p}` : ''}`);
  },
  getSnapshot: (id: number | string) => adminRequest<any>(`/admin/snapshots/${id}`),
  createSnapshot: (body: any) =>
    adminRequest<any>('/admin/snapshots', { method: 'POST', body: JSON.stringify(body) }),
  setSnapshotStatus: (id: number, status: string) =>
    adminRequest<any>(`/admin/snapshots/${id}`, { method: 'PUT', body: JSON.stringify({ status }) }),
  deleteSnapshot: (id: number) =>
    adminRequest<any>(`/admin/snapshots/${id}`, { method: 'DELETE' }),
  cleanupSnapshots: (statuses: string[] = ['failed', 'draft']) =>
    adminRequest<any>('/admin/snapshots/cleanup', { method: 'POST', body: JSON.stringify({ statuses }) }),
  updateEntry: (snapshotId: number, entryId: number, body: { status?: string; txid?: string }) =>
    adminRequest<any>(`/admin/snapshots/${snapshotId}/entries/${entryId}`, {
      method: 'PUT',
      body: JSON.stringify(body),
    }),
  downloadResultsCsv: (id: number) =>
    adminDownloadCsv(`/admin/snapshots/${id}/export.csv`, `snapshot_${id}_results.csv`),
  downloadPayoutsCsv: (id: number) =>
    adminDownloadCsv(`/admin/snapshots/${id}/payouts.csv`, `snapshot_${id}_payouts.csv`),
};

export function friendlyError(e: any): string {
  const status = e?.status ?? 0;
  const msg: string = e?.payload?.detail || e?.payload?.message || e?.message || '';
  if (status === 404) return 'Not found.';
  if (status === 400) return msg || 'Invalid request.';
  if (status === 503 || status === 502)
    return 'The node is busy or unreachable — please try again in a moment.';
  if (status === 504) return 'Request timed out — the node took too long to respond. Please try again.';
  if (status === 500) return 'Server error — the node may be under load. Please try again.';
  if (msg.toLowerCase().includes('timeout')) return 'Request timed out — please try again.';
  return msg || 'Something went wrong. Please try again.';
}
