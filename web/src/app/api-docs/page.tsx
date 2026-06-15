export const metadata = { title: 'API Reference' };

export default function ApiDocsPage() {
  const sections: { title: string; endpoints: { method: string; path: string; desc: string }[] }[] = [
    {
      title: 'Health & Stats',
      endpoints: [
        { method: 'GET', path: '/api/health', desc: 'Liveness + connectivity to RPC, ElectrumX, DB' },
        { method: 'GET', path: '/api/stats/network', desc: 'Full chain stats: hashrate, difficulty, mempool, connections' },
        { method: 'GET', path: '/api/stats/price', desc: 'ITC/USD price oracle' },
        { method: 'GET', path: '/api/stats/supply', desc: 'Circulating supply with UTXO-set source + staleness flags' },
        { method: 'GET', path: '/api/stats/indexer', desc: 'Indexer phase + last indexed height' },
      ],
    },
    {
      title: 'Scriptable Stat Endpoints',
      endpoints: [
        { method: 'GET', path: '/api/hashrate', desc: '120-block rolling hashrate — { hashrate, label, window_blocks }' },
        { method: 'GET', path: '/api/difficulty', desc: 'Current PoW difficulty — { difficulty, tip_height }' },
        { method: 'GET', path: '/api/blockcount', desc: 'Current tip height as a plain integer (widget-friendly)' },
        { method: 'GET', path: '/api/circulatingsupply', desc: 'Circulating ITC as a plain decimal number (CMC/CoinGecko-compatible)' },
      ],
    },
    {
      title: 'Blocks',
      endpoints: [
        { method: 'GET', path: '/api/blocks/tip', desc: 'Current chain tip { height, hash }' },
        { method: 'GET', path: '/api/blocks?limit=&before_height=', desc: 'Paginated block list (newest first)' },
        { method: 'GET', path: '/api/block/{hashOrHeight}', desc: 'Block detail with coinbase + miner detection' },
      ],
    },
    {
      title: 'Transactions',
      endpoints: [
        { method: 'GET', path: '/api/tx/{txid}', desc: 'Transaction with input enrichment + fee calc' },
        { method: 'POST', path: '/api/tx/broadcast', desc: 'Broadcast a raw hex transaction' },
      ],
    },
    {
      title: 'Addresses',
      endpoints: [
        { method: 'GET', path: '/api/address/{addr}', desc: 'Balance + label + first/last seen' },
        { method: 'GET', path: '/api/address/{addr}/txs', desc: 'Transaction history (offset/limit)' },
        { method: 'GET', path: '/api/address/{addr}/utxos', desc: 'Unspent outputs' },
        { method: 'GET', path: '/api/address/{addr}/tokens', desc: 'ITSL token holdings' },
      ],
    },
    {
      title: 'Mempool',
      endpoints: [
        { method: 'GET', path: '/api/mempool/summary', desc: 'Counts, fee categories, fee histogram' },
        { method: 'GET', path: '/api/mempool/txs', desc: 'Top mempool transactions by fee rate' },
        { method: 'GET', path: '/api/mempool/projected', desc: 'Projected upcoming blocks' },
      ],
    },
    {
      title: 'Tokens (ITSL)',
      endpoints: [
        { method: 'GET', path: '/api/tokens', desc: 'Registry list with sort/filter/search' },
        { method: 'GET', path: '/api/token/{id}', desc: 'Token metadata + supply' },
        { method: 'GET', path: '/api/token/{id}/history', desc: 'Token transfer history' },
        { method: 'GET', path: '/api/token/{id}/balance/{addr}', desc: 'Balance lookup' },
      ],
    },
    {
      title: 'Deploy',
      endpoints: [
        { method: 'POST', path: '/api/deploy/estimate', desc: 'Estimate the create-token fee' },
        { method: 'POST', path: '/api/deploy', desc: 'Sign + broadcast a createtoken (WIF in body)' },
      ],
    },
    {
      title: 'Search',
      endpoints: [
        { method: 'GET', path: '/api/search?q=', desc: 'Disambiguating search: block height, tx hash, address, token' },
      ],
    },
    {
      title: 'Treasury Grant — Pool Rewards',
      endpoints: [
        { method: 'GET', path: '/api/pools/snapshots', desc: 'Public list of approved reward snapshots (limit/offset)' },
        { method: 'GET', path: '/api/pools/snapshots/{id}', desc: 'Snapshot detail with per-pool entries' },
        { method: 'POST', path: '/api/pools/apply', desc: 'Apply as a pool operator (creates a pending application)' },
      ],
    },
    {
      title: 'Real-time & Feeds',
      endpoints: [
        { method: 'GET', path: '/api/sse', desc: 'Server-sent events: snapshot, block, mempool, ping' },
        { method: 'WS', path: '/api/ws', desc: 'WebSocket firehose (same payloads as SSE)' },
        { method: 'GET', path: '/api/feed/blocks.xml', desc: 'Atom feed of recent blocks' },
      ],
    },
    {
      title: 'Webhooks',
      endpoints: [
        { method: 'GET', path: '/api/webhooks', desc: 'List active subscriptions' },
        { method: 'POST', path: '/api/webhooks', desc: 'Register a subscription { url, events[], secret? }' },
        { method: 'DELETE', path: '/api/webhooks/{id}', desc: 'Remove a subscription' },
      ],
    },
  ];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl lg:text-3xl font-bold">API Reference</h1>
        <p className="text-sm text-[var(--color-text-dim)] mt-2">
          OpenAPI schema at{' '}
          <a href="/api/openapi.json" className="text-[var(--color-accent)]">/api/openapi.json</a>
          {' · '}
          Interactive docs at{' '}
          <a href="/api/docs" className="text-[var(--color-accent)]">/api/docs</a>
        </p>
        <p className="text-xs text-[var(--color-text-dim)] mt-1">
          Rate limit: 120 req/min per IP. All endpoints return JSON unless noted.
          Admin endpoints require <code className="mono text-[var(--color-accent)]">X-Admin-Token</code> header.
        </p>
      </div>

      {sections.map((sec) => (
        <section key={sec.title} className="card overflow-hidden">
          <div className="px-5 py-3 border-b border-[var(--color-border)] bg-white/[0.02]">
            <h2 className="text-sm font-semibold uppercase tracking-wider">{sec.title}</h2>
          </div>
          <div className="divide-y divide-[var(--color-border-soft)]">
            {sec.endpoints.map((e) => (
              <div key={e.path} className="px-5 py-3 grid grid-cols-[60px_1fr] sm:grid-cols-[60px_1fr_2fr] gap-3 items-center">
                <span className={`chip ${e.method === 'GET' ? '' : e.method === 'WS' ? 'chip-dim' : 'chip-gold'}`}>{e.method}</span>
                <code className="text-xs mono text-[var(--color-accent)] break-all">{e.path}</code>
                <span className="text-xs text-[var(--color-text-dim)] hidden sm:block">{e.desc}</span>
              </div>
            ))}
          </div>
        </section>
      ))}

      <section className="card p-6">
        <h2 className="text-sm font-semibold mb-3">SDK</h2>
        <pre className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded p-4 text-xs mono overflow-x-auto">{`npm install @interchained/vision-sdk

import { VisionClient } from '@interchained/vision-sdk'
const v = new VisionClient({ baseUrl: 'https://vision.interchained.org' })
const tip = await v.getTip()
v.subscribe('block', (b) => console.log('New block:', b.height))`}</pre>
      </section>
    </div>
  );
}
