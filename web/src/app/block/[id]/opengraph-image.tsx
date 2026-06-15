import { ImageResponse } from 'next/og';

export const runtime = 'nodejs';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default async function OG({ params }: { params: { id: string } }) {
  const apiBase = process.env.API_BASE_INTERNAL || 'http://127.0.0.1:8080';
  let block: any = null;
  try {
    const r = await fetch(`${apiBase}/api/block/${params.id}`, { cache: 'no-store' });
    if (r.ok) block = await r.json();
  } catch (_e) { /* ignore */ }

  const heightLabel = block?.height !== undefined ? `#${block.height.toLocaleString('en-US')}` : `Block ${params.id.slice(0, 12)}…`;
  const tx = block?.n_tx ?? '—';
  const miner = block?.coinbase?.miner?.name ?? 'Unknown';

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          background: 'linear-gradient(135deg, #050a14 0%, #0f1a30 100%)',
          padding: 64,
          color: '#e6ecf6',
          fontFamily: 'sans-serif',
        }}
      >
        <div style={{ fontSize: 24, color: '#8a98b3', letterSpacing: '0.2em', textTransform: 'uppercase' }}>
          Interchained · Vision
        </div>
        <div style={{ fontSize: 32, color: '#f0b32b', marginTop: 24 }}>BLOCK</div>
        <div style={{ fontSize: 140, fontWeight: 700, color: '#f0b32b', lineHeight: 1.05 }}>{heightLabel}</div>
        <div style={{ display: 'flex', gap: 64, marginTop: 'auto', fontSize: 28, color: '#8a98b3' }}>
          <div><span style={{ color: '#56657f', fontSize: 18, textTransform: 'uppercase' }}>Transactions</span><div style={{ color: '#fff' }}>{tx}</div></div>
          <div><span style={{ color: '#56657f', fontSize: 18, textTransform: 'uppercase' }}>Miner</span><div style={{ color: '#fff' }}>{miner}</div></div>
          <div><span style={{ color: '#56657f', fontSize: 18, textTransform: 'uppercase' }}>Size</span><div style={{ color: '#fff' }}>{block?.size ? `${(block.size/1024).toFixed(1)} KB` : '—'}</div></div>
        </div>
      </div>
    ),
    { ...size }
  );
}
