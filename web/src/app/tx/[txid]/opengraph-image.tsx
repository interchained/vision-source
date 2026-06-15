import { ImageResponse } from 'next/og';

export const runtime = 'nodejs';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default async function OG({ params }: { params: { txid: string } }) {
  const apiBase = process.env.API_BASE_INTERNAL || 'http://127.0.0.1:8080';
  let tx: any = null;
  try {
    const r = await fetch(`${apiBase}/api/tx/${params.txid}`, { cache: 'no-store' });
    if (r.ok) tx = await r.json();
  } catch (_e) { /* ignore */ }

  const totalOut = tx?.outputs?.reduce((s: number, o: any) => s + (o.value_sats || 0), 0) ?? 0;
  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', background: 'linear-gradient(135deg,#050a14,#0f1a30)', padding: 64, color: '#e6ecf6', fontFamily: 'sans-serif' }}>
        <div style={{ fontSize: 24, color: '#8a98b3', letterSpacing: '0.2em', textTransform: 'uppercase' }}>Interchained · Vision</div>
        <div style={{ fontSize: 32, color: '#4dabff', marginTop: 24 }}>TRANSACTION</div>
        <div style={{ fontSize: 60, fontWeight: 700, color: '#fff', marginTop: 16, fontFamily: 'monospace' }}>
          {params.txid.slice(0, 16)}…{params.txid.slice(-8)}
        </div>
        <div style={{ display: 'flex', gap: 64, marginTop: 'auto', fontSize: 28, color: '#8a98b3' }}>
          <div><span style={{ color: '#56657f', fontSize: 18, textTransform: 'uppercase' }}>Total Out</span><div style={{ color: '#f0b32b' }}>{(totalOut / 1e8).toFixed(8)} ITC</div></div>
          {tx?.fee_sats !== undefined && <div><span style={{ color: '#56657f', fontSize: 18, textTransform: 'uppercase' }}>Fee</span><div style={{ color: '#fff' }}>{tx.fee_sats} sats</div></div>}
          {tx?.block_height && <div><span style={{ color: '#56657f', fontSize: 18, textTransform: 'uppercase' }}>Block</span><div style={{ color: '#fff' }}>#{tx.block_height}</div></div>}
        </div>
      </div>
    ),
    { ...size }
  );
}
