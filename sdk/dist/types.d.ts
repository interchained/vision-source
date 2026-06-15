export interface Tip {
    height: number;
    hash: string;
}
export interface BlockSummary {
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
export interface Block extends BlockSummary {
    confirmations: number;
    version: number;
    merkleroot: string;
    nonce: number;
    bits: string;
    difficulty: number;
    n_tx: number;
    previousblockhash?: string;
    nextblockhash?: string;
    txids: string[];
    coinbase?: {
        address?: string;
        scriptsig_hex: string;
        scriptsig_text: string;
        miner?: {
            name: string;
            url?: string;
            color?: string;
        };
        subsidy_sats: number;
        fee_sats: number;
        total_sats: number;
        maturity: {
            matured: boolean;
            confirmations: number;
            needed: number;
            blocks_remaining: number;
        };
    };
}
export interface TxInput {
    txid?: string;
    vout?: number;
    scriptsig_hex?: string;
    scriptsig_asm?: string;
    sequence?: number;
    txinwitness?: string[];
    coinbase?: string;
    prevout?: {
        value_sats: number;
        address?: string;
        script_type?: string;
    };
}
export interface TxOutput {
    n: number;
    value_sats: number;
    script_pubkey_hex: string;
    script_pubkey_asm?: string;
    script_pubkey_type?: string;
    address?: string;
}
export interface Transaction {
    txid: string;
    hash?: string;
    version: number;
    locktime: number;
    size: number;
    vsize: number;
    weight?: number;
    fee_sats?: number;
    fee_rate_sat_vbyte?: number;
    block_hash?: string;
    block_height?: number;
    block_time?: number;
    confirmations?: number;
    in_mempool: boolean;
    is_coinbase: boolean;
    inputs: TxInput[];
    outputs: TxOutput[];
    raw_hex?: string;
}
export interface AddressStats {
    address: string;
    valid: boolean;
    balance: {
        confirmed_sats: number;
        unconfirmed_sats: number;
    };
    tx_count: number;
    label?: string;
    is_special: boolean;
    first_seen_height?: number;
    last_seen_height?: number;
}
export interface UTXO {
    txid: string;
    vout: number;
    value_sats: number;
    block_height?: number;
    confirmations?: number;
    script_pubkey_hex?: string;
}
export interface TokenMeta {
    id: string;
    name: string;
    symbol: string;
    decimals: number;
    total_supply?: string;
    creator?: string;
    created_height?: number;
    created_time?: number;
    create_txid?: string;
    transfer_count?: number;
    verified: boolean;
    logo_url?: string;
}
export interface TokenTransfer {
    txid: string;
    block_height?: number;
    block_time?: number;
    from_address?: string;
    to_address?: string;
    amount: string;
    confirmations?: number;
}
export interface MempoolSummary {
    tx_count: number;
    vsize_total: number;
    fee_total_sats: number;
    fee_rate_min: number;
    fee_rate_median: number;
    fee_rate_max: number;
    fee_categories: {
        low: number;
        medium: number;
        high: number;
    };
    fee_histogram: [number, number][];
}
export interface MempoolTx {
    txid: string;
    vsize: number;
    fee_sats: number;
    fee_rate_sat_vbyte: number;
    inputs: number;
    outputs: number;
}
export interface ProjectedBlock {
    index: number;
    tx_count: number;
    vsize: number;
    fee_sats: number;
    fee_rate_min: number;
    fee_rate_max: number;
    fee_rate_median: number;
}
export interface NetworkStats {
    height: number;
    hash: string;
    time?: number;
    difficulty: number;
    hashrate_hps?: number;
    mempool_tx_count?: number;
    mempool_vsize?: number;
    connections?: number;
    chain?: string;
    reward_sats?: number;
}
export interface PriceInfo {
    symbol: string;
    price_usd?: number;
    price_btc?: number;
    volume_24h_usd?: number;
    market_cap_usd?: number;
    change_24h_pct?: number;
    source?: string;
    updated_at?: number;
}
export interface IndexerStatus {
    phase: string;
    last_height: number;
    tip_height?: number;
    lag?: number;
    blocks_per_second?: number;
    is_synced: boolean;
}
export interface SearchResult {
    type: 'block' | 'tx' | 'address' | 'token';
    value: string;
    label?: string;
}
export interface Webhook {
    id: string;
    url: string;
    events: string[];
    address_filter?: string;
    created_at?: number;
    active?: boolean;
}
export interface FeeEstimate {
    fee_sats: number;
    fee_rate_sat_vbyte?: number;
    estimated_size_vbytes?: number;
}
export type EventType = 'snapshot' | 'block' | 'mempool' | 'tx' | 'token' | 'ping';
export interface VisionEvent {
    type: EventType;
    data: any;
}
export interface VisionClientOptions {
    baseUrl: string;
    fetch?: typeof globalThis.fetch;
}
