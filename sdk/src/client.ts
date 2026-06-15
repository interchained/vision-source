import type {
  AddressStats,
  Block,
  EventType,
  FeeEstimate,
  IndexerStatus,
  MempoolSummary,
  MempoolTx,
  NetworkStats,
  PriceInfo,
  ProjectedBlock,
  SearchResult,
  Tip,
  TokenMeta,
  TokenTransfer,
  Transaction,
  UTXO,
  VisionClientOptions,
  VisionEvent,
  Webhook,
} from './types';

export class VisionClient {
  private base: string;
  private fetchImpl: typeof globalThis.fetch;

  constructor(opts: VisionClientOptions) {
    this.base = opts.baseUrl.replace(/\/+$/, '');
    this.fetchImpl = opts.fetch || globalThis.fetch.bind(globalThis);
  }

  private async req<T>(path: string, init?: RequestInit): Promise<T> {
    const r = await this.fetchImpl(`${this.base}/api${path}`, {
      ...init,
      headers: { 'Content-Type': 'application/json', ...(init?.headers as any) },
    });
    if (!r.ok) {
      let body: any;
      try { body = await r.json(); } catch { body = null; }
      throw new Error(body?.message || `HTTP ${r.status}`);
    }
    return r.json() as Promise<T>;
  }

  private qs(opts: Record<string, string | number | boolean | undefined>): string {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(opts)) {
      if (v !== undefined) p.set(k, String(v));
    }
    const s = p.toString();
    return s ? `?${s}` : '';
  }

  // ── Health & Stats ──────────────────────────────────────────────────────────

  health = () => this.req<{ status: string; rpc: boolean; electrumx: boolean }>('/health');

  getNetworkStats = () => this.req<NetworkStats>('/stats/network');

  getPrice = () => this.req<PriceInfo>('/stats/price');

  getIndexerStatus = () => this.req<IndexerStatus>('/stats/indexer');

  // ── Blocks ──────────────────────────────────────────────────────────────────

  getTip = () => this.req<Tip>('/blocks/tip');

  listBlocks = (opts?: { limit?: number; before_height?: number }) =>
    this.req<{ items: BlockSummaryItem[]; tip_height: number; next_before_height: number | null }>(
      `/blocks${this.qs({ limit: opts?.limit, before_height: opts?.before_height })}`,
    );

  getBlock = (id: string | number) => this.req<Block>(`/block/${id}`);

  // ── Transactions ────────────────────────────────────────────────────────────

  getTransaction = (txid: string) => this.req<Transaction>(`/tx/${txid}`);

  broadcast = (hex: string) =>
    this.req<{ txid: string }>('/tx/broadcast', { method: 'POST', body: JSON.stringify({ hex }) });

  // ── Addresses ───────────────────────────────────────────────────────────────

  getAddress = (addr: string) => this.req<AddressStats>(`/address/${addr}`);

  getAddressTxs = (addr: string, opts?: { limit?: number; offset?: number }) =>
    this.req<{ items: any[]; total: number }>(
      `/address/${addr}/txs${this.qs({ limit: opts?.limit, offset: opts?.offset })}`,
    );

  getAddressUtxos = (addr: string) =>
    this.req<{ items: UTXO[]; total: number }>(`/address/${addr}/utxos`);

  getAddressTokens = (addr: string) =>
    this.req<{ items: any[]; total: number }>(`/address/${addr}/tokens`);

  // ── Mempool ─────────────────────────────────────────────────────────────────

  getMempool = () => this.req<MempoolSummary>('/mempool/summary');

  getMempoolTxs = (limit = 50) =>
    this.req<{ items: MempoolTx[]; total: number }>(`/mempool/txs?limit=${limit}`);

  getProjectedBlocks = (blocks = 8) =>
    this.req<{ blocks: ProjectedBlock[] }>(`/mempool/projected?blocks=${blocks}`);

  // ── Tokens ──────────────────────────────────────────────────────────────────

  listTokens = (opts?: { sort?: string; q?: string; verified?: boolean; limit?: number; offset?: number }) =>
    this.req<{ items: TokenMeta[]; total: number }>(
      `/tokens${this.qs({ sort: opts?.sort, q: opts?.q, verified: opts?.verified, limit: opts?.limit, offset: opts?.offset })}`,
    );

  getToken = (id: string) => this.req<TokenMeta>(`/token/${id}`);

  getTokenHistory = (id: string, opts?: { address?: string; limit?: number }) =>
    this.req<{ items: TokenTransfer[]; total: number }>(
      `/token/${id}/history${this.qs({ address: opts?.address, limit: opts?.limit })}`,
    );

  getTokenBalance = (id: string, addr: string) =>
    this.req<{ balance: string; address: string; token_id: string }>(`/token/${id}/balance/${addr}`);

  // ── Search ──────────────────────────────────────────────────────────────────

  search = (q: string) =>
    this.req<SearchResult>(`/search?q=${encodeURIComponent(q)}`);

  // ── Token deployment ────────────────────────────────────────────────────────

  estimateDeploy = (body: {
    name: string;
    symbol: string;
    decimals: number;
    amount: string;
  }) => this.req<FeeEstimate>('/deploy/estimate', { method: 'POST', body: JSON.stringify(body) });

  deployToken = (body: {
    name: string;
    symbol: string;
    decimals: number;
    amount: string;
    wif_key: string;
    witness?: boolean;
  }) => this.req<{ txid: string; token_id?: string }>('/deploy', { method: 'POST', body: JSON.stringify(body) });

  // ── Webhooks ────────────────────────────────────────────────────────────────

  listWebhooks = () => this.req<{ items: Webhook[] }>('/webhooks');

  createWebhook = (body: { url: string; events: string[]; address_filter?: string }) =>
    this.req<Webhook>('/webhooks', { method: 'POST', body: JSON.stringify(body) });

  deleteWebhook = (id: string) =>
    this.req<{ deleted: boolean }>(`/webhooks/${id}`, { method: 'DELETE' });

  // ── Real-time ───────────────────────────────────────────────────────────────

  /**
   * Subscribe to server-sent events. Works in browsers; in Node use an
   * `eventsource` polyfill or prefer `openWebSocket()`.
   * Returns an unsubscribe function.
   */
  subscribe(event: EventType | 'all', handler: (e: VisionEvent) => void): () => void {
    const url = `${this.base}/api/sse`;
    const ES: any = (globalThis as any).EventSource;
    if (!ES) throw new Error('EventSource not available — use openWebSocket() in Node, or install an eventsource polyfill.');
    const es = new ES(url);
    const types = event === 'all' ? ['snapshot', 'block', 'mempool', 'tx', 'token', 'ping'] : [event];
    types.forEach((t) => {
      es.addEventListener(t, (m: MessageEvent) => {
        try { handler({ type: t as EventType, data: JSON.parse(m.data) }); } catch { /* ignore */ }
      });
    });
    return () => es.close();
  }

  /**
   * Open a WebSocket connection. Works in any environment with the standard
   * `WebSocket` global (browsers, Deno, Bun, Node 22+).
   */
  openWebSocket(handler: (e: VisionEvent) => void): { close: () => void } {
    const url = `${this.base.replace(/^http/, 'ws')}/api/ws`;
    const WS: any = (globalThis as any).WebSocket;
    if (!WS) throw new Error('WebSocket not available — install `ws` and set globalThis.WebSocket before calling openWebSocket().');
    const sock = new WS(url);
    sock.onmessage = (m: MessageEvent) => {
      try { handler(JSON.parse(m.data)); } catch { /* ignore */ }
    };
    return { close: () => sock.close() };
  }
}

/** @internal */
interface BlockSummaryItem {
  height: number;
  hash: string;
  time: number;
  tx_count: number;
  size: number;
  weight?: number;
  miner?: { name: string; url?: string; color?: string };
}
