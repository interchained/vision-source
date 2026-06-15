/**
 * address-portfolio.ts
 *
 * Print a full portfolio summary for one or more ITC addresses:
 *   - Confirmed + unconfirmed balance
 *   - Transaction count + first/last activity
 *   - UTXO set with total
 *   - ITSL token holdings
 *
 * Run:
 *   npx tsx sdk/examples/address-portfolio.ts <addr1> [addr2] …
 *
 * Example:
 *   npx tsx sdk/examples/address-portfolio.ts itc1qexample1 itc1qexample2
 */

import { VisionClient } from '../src/index.js';

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:8080';

const client = new VisionClient({ baseUrl: BASE_URL });

const SATS = 1e8;

function itc(sats: number): string {
  return (sats / SATS).toFixed(8);
}

async function printPortfolio(addr: string) {
  console.log(`\n${'═'.repeat(60)}`);
  console.log(`📬  ${addr}`);
  console.log('═'.repeat(60));

  // Parallel: stats + utxos + tokens
  const [stats, utxoRes, tokenRes] = await Promise.all([
    client.getAddress(addr),
    client.getAddressUtxos(addr),
    client.getAddressTokens(addr),
  ]);

  if (!stats.valid) {
    console.log('  ⚠️  Invalid address');
    return;
  }

  const confirmed = stats.balance.confirmed_sats;
  const unconfirmed = stats.balance.unconfirmed_sats;
  const total = confirmed + unconfirmed;

  console.log(`  Label          : ${stats.label ?? '—'}`);
  console.log(`  Balance        : ${itc(confirmed)} ITC confirmed`);
  if (unconfirmed !== 0) {
    const sign = unconfirmed > 0 ? '+' : '';
    console.log(`                   ${sign}${itc(unconfirmed)} ITC unconfirmed`);
    console.log(`                   =${itc(total)} ITC total`);
  }
  console.log(`  Transactions   : ${stats.tx_count.toLocaleString()}`);
  if (stats.first_seen_height) console.log(`  First seen     : block #${stats.first_seen_height}`);
  if (stats.last_seen_height)  console.log(`  Last active    : block #${stats.last_seen_height}`);

  // UTXOs
  const utxos = utxoRes.items ?? [];
  if (utxos.length > 0) {
    console.log(`\n  UTXOs (${utxos.length}):`);
    for (const u of utxos.slice(0, 10)) {
      const conf = u.confirmations !== undefined ? `  ${u.confirmations} conf` : '';
      console.log(`    ${u.txid.slice(0, 12)}…:${u.vout}  ${itc(u.value_sats)} ITC${conf}`);
    }
    if (utxos.length > 10) console.log(`    … and ${utxos.length - 10} more`);
  } else {
    console.log('\n  UTXOs: none');
  }

  // Token holdings
  const tokens = tokenRes.items ?? [];
  if (tokens.length > 0) {
    console.log(`\n  Token holdings (${tokens.length}):`);
    for (const t of tokens) {
      const balance = t.balance ?? t.amount ?? '?';
      const sym = t.symbol ?? t.token_id ?? '?';
      console.log(`    ${sym.padEnd(10)}  ${balance}`);
    }
  } else {
    console.log('\n  Token holdings: none');
  }
}

async function main() {
  const addrs = process.argv.slice(2);
  if (addrs.length === 0) {
    console.error('Usage: npx tsx sdk/examples/address-portfolio.ts <addr1> [addr2] …');
    process.exit(1);
  }

  const tip = await client.getTip();
  console.log(`\nConnected to ${BASE_URL}  (tip #${tip.height})`);

  for (const addr of addrs) {
    await printPortfolio(addr);
  }
  console.log();
}

main().catch((err) => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
