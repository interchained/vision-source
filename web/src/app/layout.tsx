import type { Metadata, Viewport } from 'next';
import './globals.css';
import { NavBar } from '@/components/nav-bar';
import { FooterStats } from '@/components/footer-stats';
import { NodeSyncingBanner } from '@/components/node-syncing';
import { BlockToast } from '@/components/block-toast';
import { ChunkErrorReloader } from '@/components/chunk-error-reloader';

export const metadata: Metadata = {
  title: {
    default: 'Interchained Vision — ITC Blockchain Explorer',
    template: '%s · Interchained Vision',
  },
  description:
    'Production-grade explorer for the Interchained (ITC) blockchain. Real-time blocks, transactions, addresses, mempool, and ITSL token registry & deployer.',
  applicationName: 'Interchained Vision',
  manifest: '/manifest.json',
  appleWebApp: { capable: true, title: 'Vision', statusBarStyle: 'black-translucent' },
  icons: {
    icon: [{ url: '/favicon.svg', type: 'image/svg+xml' }],
    apple: '/icon-192.png',
  },
  openGraph: {
    type: 'website',
    title: 'Interchained Vision',
    description: 'Real-time ITC blockchain explorer & ITSL token registry.',
    siteName: 'Interchained Vision',
  },
  twitter: { card: 'summary_large_image', title: 'Interchained Vision' },
};

export const viewport: Viewport = {
  themeColor: '#050a14',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body suppressHydrationWarning>
        <ChunkErrorReloader />
        <NavBar />
        <NodeSyncingBanner />
        <main className="max-w-7xl mx-auto px-4 lg:px-6 py-6 lg:py-10 min-h-[calc(100vh-160px)]">
          {children}
        </main>
        <FooterStats />
        <BlockToast />
      </body>
    </html>
  );
}
