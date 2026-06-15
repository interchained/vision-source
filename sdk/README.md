# @interchained/vision-sdk

Official TypeScript SDK for the [Interchained Vision](https://explorer.interchained.org) blockchain explorer API.

## Install

```bash
npm install @interchained/vision-sdk
```

## Quick start

```typescript
import { VisionClient } from '@interchained/vision-sdk'

const v = new VisionClient({ baseUrl: 'https://explorer.interchained.org' })

// Chain tip
const tip = await v.getTip()                   // { height, hash }

// Blocks
const block  = await v.getBlock(tip.height)    // Block
const blocks = await v.listBlocks({ limit: 10 })

// Transactions
const tx = await v.getTransaction('abc123…')
await v.broadcast(rawHex)

// Addresses
const addr   = await v.getAddress('itc1q…')
const txs    = await v.getAddressTxs('itc1q…', { limit: 20, offset: 0 })
const utxos  = await v.getAddressUtxos('itc1q…')
const tokens = await v.getAddressTokens('itc1q…')

// Mempool
const mempool  = await v.getMempool()           // MempoolSummary
const mempTxs  = await v.getMempoolTxs(50)      // top txs by fee rate
const projected = await v.getProjectedBlocks(8) // projected upcoming blocks

// Tokens
const list    = await v.listTokens({ sort: 'transfers', limit: 20 })
const token   = await v.getToken('TOKEN_ID')
const history = await v.getTokenHistory('TOKEN_ID', { limit: 10 })
const balance = await v.getTokenBalance('TOKEN_ID', 'itc1q…')

// Stats
const network = await v.getNetworkStats()       // NetworkStats
const price   = await v.getPrice()              // PriceInfo
const indexer = await v.getIndexerStatus()      // IndexerStatus

// Search
const result = await v.search('itc1q…')         // SearchResult

// Webhooks
const hooks = await v.listWebhooks()
const hook  = await v.createWebhook({ url: 'https://…', events: ['block', 'tx'] })
await v.deleteWebhook(hook.id)
```

## Real-time events

### Browser (SSE)

```typescript
// Subscribe to all events
const off = v.subscribe('all', (e) => {
  if (e.type === 'block')   console.log('New block:', e.data.height)
  if (e.type === 'mempool') console.log('Mempool update')
  if (e.type === 'tx')      console.log('New tx:', e.data.txid)
})

// Unsubscribe
off()
```

### Node / any environment (WebSocket)

```typescript
// Node 22+ has WebSocket built in. For older Node, install `ws`:
//   npm install ws
//   import { WebSocket } from 'ws'; (globalThis as any).WebSocket = WebSocket;

const { close } = v.openWebSocket((e) => {
  console.log(e.type, e.data)
})

// Close when done
close()
```

## Token deployment

```typescript
// Estimate fees first
const estimate = await v.estimateDeploy({
  name: 'My Token', symbol: 'MYT', decimals: 8, amount: '1000000',
})
console.log('Estimated fee:', estimate.fee_sats, 'sats')

// Deploy (WIF is forwarded to your own node — never persisted on the server)
const { txid, token_id } = await v.deployToken({
  name: 'My Token',
  symbol: 'MYT',
  decimals: 8,
  amount: '1000000',
  wif_key: process.env.WIF!,
})
console.log('Deployed:', token_id, 'txid:', txid)
```

## Examples

Runnable examples live in `sdk/examples/`. They require [tsx](https://github.com/privatenumber/tsx):

```bash
npm install -g tsx
```

| Script | Description |
|--------|-------------|
| `monitor-blocks.ts` | Live block monitor with coinbase reward + whale alerts |
| `address-portfolio.ts` | Full portfolio report — balance, UTXOs, token holdings |
| `whale-alert.ts` | Mempool watcher that alerts on large transactions |
| `top-tokens.ts` | Token leaderboard with recent transfer history |

```bash
# Watch live blocks (WebSocket)
BASE_URL=http://localhost:8080 npx tsx sdk/examples/monitor-blocks.ts

# Portfolio for one or more addresses
BASE_URL=http://localhost:8080 npx tsx sdk/examples/address-portfolio.ts itc1qYOURADDRESS

# Whale alerts (threshold in ITC, default 10 000)
WHALE_ITC=5000 BASE_URL=http://localhost:8080 npx tsx sdk/examples/whale-alert.ts

# Token leaderboard (top 10, 3 recent transfers each)
TOP=10 HISTORY=3 BASE_URL=http://localhost:8080 npx tsx sdk/examples/top-tokens.ts
```

## TypeScript types

All response shapes are exported from the package:

```typescript
import type {
  AddressStats, Block, BlockSummary, FeeEstimate,
  IndexerStatus, MempoolSummary, MempoolTx,
  NetworkStats, PriceInfo, ProjectedBlock,
  SearchResult, Tip, TokenMeta, TokenTransfer,
  Transaction, UTXO, VisionEvent, Webhook,
} from '@interchained/vision-sdk'
```

## License

MIT
