import type { AddressStats, Block, EventType, FeeEstimate, IndexerStatus, MempoolSummary, MempoolTx, NetworkStats, PriceInfo, ProjectedBlock, SearchResult, Tip, TokenMeta, TokenTransfer, Transaction, UTXO, VisionClientOptions, VisionEvent, Webhook } from './types';
export declare class VisionClient {
    private base;
    private fetchImpl;
    constructor(opts: VisionClientOptions);
    private req;
    private qs;
    health: () => Promise<{
        status: string;
        rpc: boolean;
        electrumx: boolean;
    }>;
    getNetworkStats: () => Promise<NetworkStats>;
    getPrice: () => Promise<PriceInfo>;
    getIndexerStatus: () => Promise<IndexerStatus>;
    getTip: () => Promise<Tip>;
    listBlocks: (opts?: {
        limit?: number;
        before_height?: number;
    }) => Promise<{
        items: BlockSummaryItem[];
        tip_height: number;
        next_before_height: number | null;
    }>;
    getBlock: (id: string | number) => Promise<Block>;
    getTransaction: (txid: string) => Promise<Transaction>;
    broadcast: (hex: string) => Promise<{
        txid: string;
    }>;
    getAddress: (addr: string) => Promise<AddressStats>;
    getAddressTxs: (addr: string, opts?: {
        limit?: number;
        offset?: number;
    }) => Promise<{
        items: any[];
        total: number;
    }>;
    getAddressUtxos: (addr: string) => Promise<{
        items: UTXO[];
        total: number;
    }>;
    getAddressTokens: (addr: string) => Promise<{
        items: any[];
        total: number;
    }>;
    getMempool: () => Promise<MempoolSummary>;
    getMempoolTxs: (limit?: number) => Promise<{
        items: MempoolTx[];
        total: number;
    }>;
    getProjectedBlocks: (blocks?: number) => Promise<{
        blocks: ProjectedBlock[];
    }>;
    listTokens: (opts?: {
        sort?: string;
        q?: string;
        verified?: boolean;
        limit?: number;
        offset?: number;
    }) => Promise<{
        items: TokenMeta[];
        total: number;
    }>;
    getToken: (id: string) => Promise<TokenMeta>;
    getTokenHistory: (id: string, opts?: {
        address?: string;
        limit?: number;
    }) => Promise<{
        items: TokenTransfer[];
        total: number;
    }>;
    getTokenBalance: (id: string, addr: string) => Promise<{
        balance: string;
        address: string;
        token_id: string;
    }>;
    search: (q: string) => Promise<SearchResult>;
    estimateDeploy: (body: {
        name: string;
        symbol: string;
        decimals: number;
        amount: string;
    }) => Promise<FeeEstimate>;
    deployToken: (body: {
        name: string;
        symbol: string;
        decimals: number;
        amount: string;
        wif_key: string;
        witness?: boolean;
    }) => Promise<{
        txid: string;
        token_id?: string;
    }>;
    listWebhooks: () => Promise<{
        items: Webhook[];
    }>;
    createWebhook: (body: {
        url: string;
        events: string[];
        address_filter?: string;
    }) => Promise<Webhook>;
    deleteWebhook: (id: string) => Promise<{
        deleted: boolean;
    }>;
    /**
     * Subscribe to server-sent events. Works in browsers; in Node use an
     * `eventsource` polyfill or prefer `openWebSocket()`.
     * Returns an unsubscribe function.
     */
    subscribe(event: EventType | 'all', handler: (e: VisionEvent) => void): () => void;
    /**
     * Open a WebSocket connection. Works in any environment with the standard
     * `WebSocket` global (browsers, Deno, Bun, Node 22+).
     */
    openWebSocket(handler: (e: VisionEvent) => void): {
        close: () => void;
    };
}
/** @internal */
interface BlockSummaryItem {
    height: number;
    hash: string;
    time: number;
    tx_count: number;
    size: number;
    weight?: number;
    miner?: {
        name: string;
        url?: string;
        color?: string;
    };
}
export {};
