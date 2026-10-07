import type { CurrencyRow } from '../currencies/types';

export interface Quote {
    cmcId: number;
    symbol: string;
    name: string;
    price: number;
    sourceUpdatedAt: number;
}

export interface HistoryRow {
    id: number;
    cryptocurrency_id: number;
    price: number;
    received_at: number;
    source_updated_at: number;
}

export interface LatestRow extends CurrencyRow {
    price: number | null;
    received_at: number | null;
    source_updated_at: number | null;
}
