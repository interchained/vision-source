export const metadata = { title: 'Documentation' };

export default function DocsPage() {
  return (
    <div className="prose-vision max-w-3xl mx-auto space-y-8">
      <h1 className="text-2xl lg:text-3xl font-bold">Documentation</h1>

      <section className="card p-6 space-y-3">
        <h2 className="text-lg font-semibold">What is Interchained Vision?</h2>
        <p className="text-sm text-[var(--color-text-dim)]">
          Vision is the official block + token explorer for the Interchained (ITC) network.
          It surfaces real-time blockchain activity, an ITSL token registry, and a self-serve
          token deployer. The entire stack is open source and self-hostable.
        </p>
      </section>

      <section className="card p-6 space-y-3">
        <h2 className="text-lg font-semibold">Architecture</h2>
        <ul className="text-sm text-[var(--color-text-dim)] list-disc pl-5 space-y-1">
          <li><b className="text-white">Frontend:</b> Next.js 15 + React 19 + Tailwind v4</li>
          <li><b className="text-white">Backend:</b> FastAPI + Redis + httpx (async)</li>
          <li><b className="text-white">Address index:</b> any ElectrumX server</li>
          <li><b className="text-white">Token index:</b> built-in indexer using `all_tokens` + `token_history`</li>
          <li><b className="text-white">Real-time:</b> SSE for browsers, WebSocket for SDK clients</li>
        </ul>
      </section>

      <section className="card p-6 space-y-3">
        <h2 className="text-lg font-semibold">Deploy your own ITSL token</h2>
        <ol className="text-sm text-[var(--color-text-dim)] list-decimal pl-5 space-y-1">
          <li>Hold enough ITC in a wallet to cover the createtoken fee.</li>
          <li>Export the WIF private key for that wallet (Bitcoin Core: <code className="mono text-xs">dumpprivkey</code>).</li>
          <li>Visit <a href="/deploy" className="text-[var(--color-accent)]">/deploy</a> and fill in the form.</li>
          <li>Review the fee estimate, then confirm to broadcast.</li>
          <li>You'll be redirected to the new token's page once it's mined.</li>
        </ol>
        <p className="text-xs text-[var(--color-text-faint)] mt-2">
          ⚠ Vision forwards the WIF directly to the node RPC and never persists it. For maximum safety
          self-host Vision and your node side-by-side.
        </p>
      </section>

      <section className="card p-6 space-y-3">
        <h2 className="text-lg font-semibold">Self-hosting</h2>
        <pre className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded p-4 text-xs mono overflow-x-auto">{`git clone https://github.com/interchained/vision
cd vision
cp .env.example .env  # fill in RPC + ElectrumX
docker compose up -d`}</pre>
      </section>

      <section className="card p-6 space-y-3">
        <h2 className="text-lg font-semibold">Currency display</h2>
        <p className="text-sm text-[var(--color-text-dim)]">
          The toggle in the navbar switches all amounts between <b>ITC</b>, raw <b>sats</b>, and
          <b>USD</b>. The selection is stored locally in your browser. USD requires a configured
          price oracle on the backend.
        </p>
      </section>

      <section className="card p-6 space-y-3">
        <h2 className="text-lg font-semibold">Decentralization</h2>
        <p className="text-sm text-[var(--color-text-dim)]">
          Anyone can mirror Vision. No accounts, no analytics, no tracking cookies, no API keys —
          just IP-based rate limiting. The full source code is MIT-licensed.
        </p>
      </section>
    </div>
  );
}
