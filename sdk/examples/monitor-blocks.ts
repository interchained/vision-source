/**
 * monitor-blocks.ts
 *
 * Live block monitor using the WebSocket feed.
 * Prints each new block as it arrives, along with chain tip and a
 * running total of transactions seen since the script started.
 *
 * Run (Node 22+, no build needed via tsx):
 *   npx tsx sdk/examples/monitor-blocks.ts
 *
 * Or with a custom endpoint:
 *   BASE_URL=http://localhost:8080 npx tsx sdk/examples/monitor-blocks.ts
 */

import { VisionClient } from '../src/index.js';

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:8080';

const client = new VisionClient({ baseUrl: BASE_URL });

let txSeen = 0;
let blocksSeen = 0;
const startTime = Date.now();

function fmt(sats: number): string {
  return (sats / 1e8).toFixed(8) + ' ITC';
}

function elapsed(): string {
  const s = Math.floor((Date.now() - startTime) / 1000);
  const m = Math.floor(s / 60);
  return m > 0 ? `${m}m${s % 60}s` : `${s}s`;
}

async function main() {
  // Pull the current tip first so we have context
  const tip = await client.getTip();
  console.log(`\n🔗 Connected to ${BASE_URL}`);
  console.log(`   Chain tip: #${tip.height}  ${tip.hash.slice(0, 16)}…`);
  console.log(`   Waiting for new blocks…\n`);

  // Open WebSocket — works in Node 22+ natively; or install `ws` and set
  // globalThis.WebSocket = require('ws') before this line.
  const { close } = client.openWebSocket((event) => {
    if (event.type === 'block') {
      const b = event.data;
      blocksSeen++;
      txSeen += b.tx_count ?? 0;

      console.log(
        `🧱 Block #${b.height}` +
        `  txs=${b.tx_count ?? '?'}` +
        `  size=${b.size ? (b.size / 1000).toFixed(1) + 'kB' : '?'}` +
        `  [${blocksSeen} blocks / ${txSeen} txs in ${elapsed()}]`,
      );

      if (b.coinbase) {
        const cb = b.coinbase;
        console.log(
          `   ↳ reward ${fmt(cb.subsidy_sats)}` +
          `  fees ${fmt(cb.fee_sats)}` +
          `  miner=${cb.miner?.name ?? cb.address?.slice(0, 12) ?? 'unknown'}`,
        );
      }
    }

    if (event.type === 'mempool') {
      const m = event.data;
      // Silently track mempool churn — only log big txs
      if (m.top_tx && m.top_tx.value_sats > 100_000 * 1e8) {
        console.log(
          `🐋 Whale mempool tx  ${fmt(m.top_tx.value_sats)}` +
          `  fee_rate=${m.top_tx.fee_rate_sat_vbyte?.toFixed(1) ?? '?'} sat/vB`,
        );
      }
    }
  });

  // Graceful shutdown
  process.on('SIGINT', () => {
    console.log(`\n👋 Closing after ${blocksSeen} blocks, ${txSeen} txs in ${elapsed()}`);
    close();
    process.exit(0);
  });
}

main().catch((err) => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
