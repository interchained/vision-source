/**
 * whale-alert.ts
 *
 * Watches the mempool in real time via WebSocket and alerts whenever a
 * transaction moves more than WHALE_ITC coins.
 *
 * Also polls the mempool summary every 30 s and prints a stats line.
 *
 * Run:
 *   npx tsx sdk/examples/whale-alert.ts
 *
 * Options (env vars):
 *   BASE_URL   — API base URL (default: http://localhost:8080)
 *   WHALE_ITC  — threshold in whole ITC coins (default: 10000)
 */

import { VisionClient } from '../src/index.js';

const BASE_URL   = process.env.BASE_URL  ?? 'http://localhost:8080';
const WHALE_SATS = Number(process.env.WHALE_ITC ?? 10_000) * 1e8;
const POLL_MS    = 30_000;

const client = new VisionClient({ baseUrl: BASE_URL });

function itc(sats: number): string {
  return (sats / 1e8).toLocaleString('en-US', { maximumFractionDigits: 2 }) + ' ITC';
}

function ts(): string {
  return new Date().toISOString().slice(11, 19);
}

async function printMempoolStats() {
  try {
    const m = await client.getMempool();
    console.log(
      `[${ts()}] mempool: ${m.tx_count} txs` +
      `  fee_median=${m.fee_rate_median?.toFixed(1) ?? '?'} sat/vB` +
      `  size=${(m.vsize_total / 1000).toFixed(0)}kB`,
    );
  } catch { /* swallow — node may be restarting */ }
}

async function main() {
  const tip = await client.getTip();
  console.log(`\n🐋  Whale Alert — threshold: ${itc(WHALE_SATS)}`);
  console.log(`   API: ${BASE_URL}  |  tip #${tip.height}`);
  console.log(`   Watching mempool WebSocket…\n`);

  // Initial mempool stats
  await printMempoolStats();

  // Periodic stats banner
  const statsInterval = setInterval(printMempoolStats, POLL_MS);

  const { close } = client.openWebSocket((event) => {
    // Individual tx events carry full transaction data
    if (event.type === 'tx') {
      const tx = event.data;
      const totalOut: number = (tx.outputs ?? []).reduce(
        (sum: number, o: any) => sum + (o.value_sats ?? 0),
        0,
      );
      if (totalOut >= WHALE_SATS) {
        const addrs = (tx.outputs ?? [])
          .filter((o: any) => o.address)
          .map((o: any) => `${o.address!.slice(0, 14)}…`)
          .slice(0, 3)
          .join(', ');
        console.log(
          `[${ts()}] 🐋 WHALE  ${itc(totalOut).padStart(22)}` +
          `  txid=${tx.txid?.slice(0, 16) ?? '?'}…` +
          `  → [${addrs}]`,
        );
      }
    }

    // mempool summary snapshots
    if (event.type === 'mempool') {
      const m = event.data;
      if (m.top_tx && (m.top_tx.value_sats ?? 0) >= WHALE_SATS) {
        console.log(
          `[${ts()}] 🐋 MEMPOOL WHALE  ${itc(m.top_tx.value_sats).padStart(22)}` +
          `  fee_rate=${m.top_tx.fee_rate_sat_vbyte?.toFixed(1) ?? '?'} sat/vB`,
        );
      }
    }
  });

  process.on('SIGINT', () => {
    console.log('\n👋  Shutting down…');
    clearInterval(statsInterval);
    close();
    process.exit(0);
  });
}

main().catch((err) => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
