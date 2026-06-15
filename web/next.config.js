/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  transpilePackages: ['@interchained/vision-sdk'],
  experimental: {
    optimizePackageImports: ['lucide-react'],
  },
  async rewrites() {
    const apiBase = process.env.API_BASE_INTERNAL || 'http://127.0.0.1:8080';
    return [
      { source: '/api/:path*', destination: `${apiBase}/api/:path*` },
    ];
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          // X-Frame-Options intentionally omitted so the Replit workspace
          // preview iframe can embed the dev server. In production, restore
          // via a reverse proxy (e.g. nginx) with `X-Frame-Options: SAMEORIGIN`.
        ],
      },
    ];
  },
};

module.exports = nextConfig;
