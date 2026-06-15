/**
 * Singleton VisionClient instance used throughout the web app.
 *
 * Import `vision` from here instead of reaching into raw fetch/api.ts
 * for any new features — this dogfoods the SDK end-to-end.
 *
 * The legacy `api` object in api.ts remains for existing server components
 * that rely on its syncBus + 503 handling; new client components should
 * prefer this client.
 */
import { VisionClient } from '@interchained/vision-sdk';

const baseUrl =
  typeof window !== 'undefined'
    ? '' // browser: same-origin (Next.js proxies /api → backend)
    : process.env.API_BASE_INTERNAL || 'http://127.0.0.1:8080';

export const vision = new VisionClient({ baseUrl });

// Re-export types for convenience so consumers only need one import
export type {
  AddressStats,
  Block,
  BlockSummary,
  EventType,
  FeeEstimate,
  IndexerStatus,
  MempoolSummary,
  MempoolTx,
  NetworkStats,
  PriceInfo,
  ProjectedBlock,
  SearchResult,
  Tip,
  TokenMeta,
  TokenTransfer,
  Transaction,
  UTXO,
  VisionEvent,
  Webhook,
} from '@interchained/vision-sdk';
