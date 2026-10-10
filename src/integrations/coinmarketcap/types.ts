import type { Quote } from '../../prices/types';
import type { UpstreamError } from '../../errors';

export interface QuoteBatch {
    quotes: Quote[];
    errors: Map<number, UpstreamError>;
}

export interface QuoteProvider {
    fetchQuotes(ids: number[], signal: AbortSignal): Promise<QuoteBatch>;
}

export interface CatalogCurrency {
    cmcId: number;
    symbol: string;
    name: string;
    slug: string;
    isActive: boolean;
}

export interface CatalogProvider {
    findBySymbol(symbol: string, signal: AbortSignal): Promise<CatalogCurrency[]>;
}
