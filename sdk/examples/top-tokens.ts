/**
 * top-tokens.ts
 *
 * Fetches the full token registry and prints a leaderboard table sorted by
 * transfer count, then enriches the top-N entries with recent transfer history.
 *
 * Run:
 *   npx tsx sdk/examples/top-tokens.ts
 *
 * Options (env vars):
 *   BASE_URL  — API base URL (default: http://localhost:8080)
 *   TOP       — how many tokens to show (default: 10)
 *   HISTORY   — recent transfers per token (default: 3)
 */

import { VisionClient, type TokenMeta, type TokenTransfer } from '../src/index.js';

const BASE_URL  = process.env.BASE_URL ?? 'http://localhost:8080';
const TOP       = Number(process.env.TOP     ?? 10);
const HISTORY_N = Number(process.env.HISTORY ?? 3);

const client = new VisionClient({ baseUrl: BASE_URL });

function pad(s: string | number, n: number, right = false): string {
  const str = String(s);
  return right ? str.padEnd(n) : str.padStart(n);
}

function age(ts?: number): string {
  if (!ts) return '—';
  const s = Math.floor((Date.now() / 1000) - ts);
  if (s < 60)  return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

async function main() {
  const tip = await client.getTip();
  console.log(`\nConnected: ${BASE_URL}  (tip #${tip.height})\n`);

  // Load all tokens sorted by transfer count
  const { items, total } = await client.listTokens({ sort: 'transfers', limit: TOP });

  console.log(`Token Leaderboard — top ${items.length} of ${total} total\n`);
  console.log(
    '  #  ' +
    pad('Symbol', 10, true) +
    pad('Name', 20, true) +
    pad('Decimals', 10) +
    pad('Transfers', 12) +
    pad('Verified', 10) +
    '  Created',
  );
  console.log('─'.repeat(80));

  items.forEach((tok: TokenMeta, i: number) => {
    console.log(
      `${pad(i + 1, 3)}.` +
      `  ${pad(tok.symbol, 10, true)}` +
      `  ${pad(tok.name.slice(0, 18), 18, true)}` +
      `  ${pad(tok.decimals, 8)}` +
      `  ${pad(tok.transfer_count ?? 0, 10)}` +
      `  ${pad(tok.verified ? '✓' : '—', 9)}` +
      `  ${age(tok.created_time)}`,
    );
  });

  if (HISTORY_N <= 0 || items.length === 0) return;

  // Fetch recent history for the top tokens in parallel
  console.log(`\nRecent transfers (last ${HISTORY_N} per token):\n`);

  const histories = await Promise.all(
    items.slice(0, Math.min(TOP, 5)).map((tok: TokenMeta) =>
      client.getTokenHistory(tok.id, { limit: HISTORY_N }).then((r) => ({ tok, items: r.items })),
    ),
  );

  for (const { tok, items: transfers } of histories) {
    console.log(`  ${tok.symbol} (${tok.id.slice(0, 12)}…)`);
    if (!transfers || transfers.length === 0) {
      console.log('    — no history yet\n');
      continue;
    }
    for (const t of transfers as TokenTransfer[]) {
      const from = t.from_address ? t.from_address.slice(0, 14) + '…' : 'coinbase';
      const to   = t.to_address   ? t.to_address.slice(0, 14)   + '…' : '?';
      console.log(
        `    ${age(t.block_time).padEnd(10)}  ${from} → ${to}  amt=${t.amount}`,
      );
    }
    console.log();
  }
}

main().catch((err) => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
