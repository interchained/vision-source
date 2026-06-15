import { ImageResponse } from 'next/og';

export const runtime = 'nodejs';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default async function OG({ params }: { params: { addr: string } }) {
  const apiBase = process.env.API_BASE_INTERNAL || 'http://127.0.0.1:8080';
  let stats: any = null;
  try {
    const r = await fetch(`${apiBase}/api/address/${params.addr}`, { cache: 'no-store' });
    if (r.ok) stats = await r.json();
  } catch (_e) { /* ignore */ }

  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', background: 'linear-gradient(135deg,#050a14,#0f1a30)', padding: 64, color: '#e6ecf6', fontFamily: 'sans-serif' }}>
        <div style={{ fontSize: 24, color: '#8a98b3', letterSpacing: '0.2em', textTransform: 'uppercase' }}>Interchained · Vision</div>
        <div style={{ fontSize: 32, color: '#4dabff', marginTop: 24 }}>{stats?.label ? stats.label.toUpperCase() : 'ADDRESS'}</div>
        <div style={{ fontSize: 36, color: '#fff', marginTop: 12, fontFamily: 'monospace', wordBreak: 'break-all' }}>{params.addr}</div>
        <div style={{ display: 'flex', gap: 64, marginTop: 'auto', fontSize: 28, color: '#8a98b3' }}>
          <div><span style={{ color: '#56657f', fontSize: 18, textTransform: 'uppercase' }}>Balance</span><div style={{ color: '#f0b32b' }}>{stats ? (stats.balance.confirmed_sats / 1e8).toFixed(8) : '—'} ITC</div></div>
          <div><span style={{ color: '#56657f', fontSize: 18, textTransform: 'uppercase' }}>Tx Count</span><div style={{ color: '#fff' }}>{stats?.tx_count ?? '—'}</div></div>
        </div>
      </div>
    ),
    { ...size }
  );
}
