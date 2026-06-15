export class VisionClient {
    base;
    fetchImpl;
    constructor(opts) {
        this.base = opts.baseUrl.replace(/\/+$/, '');
        this.fetchImpl = opts.fetch || globalThis.fetch.bind(globalThis);
    }
    async req(path, init) {
        const r = await this.fetchImpl(`${this.base}/api${path}`, {
            ...init,
            headers: { 'Content-Type': 'application/json', ...init?.headers },
        });
        if (!r.ok) {
            let body;
            try {
                body = await r.json();
            }
            catch {
                body = null;
            }
            throw new Error(body?.message || `HTTP ${r.status}`);
        }
        return r.json();
    }
    qs(opts) {
        const p = new URLSearchParams();
        for (const [k, v] of Object.entries(opts)) {
            if (v !== undefined)
                p.set(k, String(v));
        }
        const s = p.toString();
        return s ? `?${s}` : '';
    }
    // ── Health & Stats ──────────────────────────────────────────────────────────
    health = () => this.req('/health');
    getNetworkStats = () => this.req('/stats/network');
    getPrice = () => this.req('/stats/price');
    getIndexerStatus = () => this.req('/stats/indexer');
    // ── Blocks ──────────────────────────────────────────────────────────────────
    getTip = () => this.req('/blocks/tip');
    listBlocks = (opts) => this.req(`/blocks${this.qs({ limit: opts?.limit, before_height: opts?.before_height })}`);
    getBlock = (id) => this.req(`/block/${id}`);
    // ── Transactions ────────────────────────────────────────────────────────────
    getTransaction = (txid) => this.req(`/tx/${txid}`);
    broadcast = (hex) => this.req('/tx/broadcast', { method: 'POST', body: JSON.stringify({ hex }) });
    // ── Addresses ───────────────────────────────────────────────────────────────
    getAddress = (addr) => this.req(`/address/${addr}`);
    getAddressTxs = (addr, opts) => this.req(`/address/${addr}/txs${this.qs({ limit: opts?.limit, offset: opts?.offset })}`);
    getAddressUtxos = (addr) => this.req(`/address/${addr}/utxos`);
    getAddressTokens = (addr) => this.req(`/address/${addr}/tokens`);
    // ── Mempool ─────────────────────────────────────────────────────────────────
    getMempool = () => this.req('/mempool/summary');
    getMempoolTxs = (limit = 50) => this.req(`/mempool/txs?limit=${limit}`);
    getProjectedBlocks = (blocks = 8) => this.req(`/mempool/projected?blocks=${blocks}`);
    // ── Tokens ──────────────────────────────────────────────────────────────────
    listTokens = (opts) => this.req(`/tokens${this.qs({ sort: opts?.sort, q: opts?.q, verified: opts?.verified, limit: opts?.limit, offset: opts?.offset })}`);
    getToken = (id) => this.req(`/token/${id}`);
    getTokenHistory = (id, opts) => this.req(`/token/${id}/history${this.qs({ address: opts?.address, limit: opts?.limit })}`);
    getTokenBalance = (id, addr) => this.req(`/token/${id}/balance/${addr}`);
    // ── Search ──────────────────────────────────────────────────────────────────
    search = (q) => this.req(`/search?q=${encodeURIComponent(q)}`);
    // ── Token deployment ────────────────────────────────────────────────────────
    estimateDeploy = (body) => this.req('/deploy/estimate', { method: 'POST', body: JSON.stringify(body) });
    deployToken = (body) => this.req('/deploy', { method: 'POST', body: JSON.stringify(body) });
    // ── Webhooks ────────────────────────────────────────────────────────────────
    listWebhooks = () => this.req('/webhooks');
    createWebhook = (body) => this.req('/webhooks', { method: 'POST', body: JSON.stringify(body) });
    deleteWebhook = (id) => this.req(`/webhooks/${id}`, { method: 'DELETE' });
    // ── Real-time ───────────────────────────────────────────────────────────────
    /**
     * Subscribe to server-sent events. Works in browsers; in Node use an
     * `eventsource` polyfill or prefer `openWebSocket()`.
     * Returns an unsubscribe function.
     */
    subscribe(event, handler) {
        const url = `${this.base}/api/sse`;
        const ES = globalThis.EventSource;
        if (!ES)
            throw new Error('EventSource not available — use openWebSocket() in Node, or install an eventsource polyfill.');
        const es = new ES(url);
        const types = event === 'all' ? ['snapshot', 'block', 'mempool', 'tx', 'token', 'ping'] : [event];
        types.forEach((t) => {
            es.addEventListener(t, (m) => {
                try {
                    handler({ type: t, data: JSON.parse(m.data) });
                }
                catch { /* ignore */ }
            });
        });
        return () => es.close();
    }
    /**
     * Open a WebSocket connection. Works in any environment with the standard
     * `WebSocket` global (browsers, Deno, Bun, Node 22+).
     */
    openWebSocket(handler) {
        const url = `${this.base.replace(/^http/, 'ws')}/api/ws`;
        const WS = globalThis.WebSocket;
        if (!WS)
            throw new Error('WebSocket not available — install `ws` and set globalThis.WebSocket before calling openWebSocket().');
        const sock = new WS(url);
        sock.onmessage = (m) => {
            try {
                handler(JSON.parse(m.data));
            }
            catch { /* ignore */ }
        };
        return { close: () => sock.close() };
    }
}
