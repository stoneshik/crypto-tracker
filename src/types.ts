import type { DatabaseSync } from 'node:sqlite';
import type { Config } from './config/types';
import type { CurrencyService } from './currencies/service';
import type { CatalogProvider,QuoteProvider } from './integrations/coinmarketcap/types';
import type { PriceService } from './prices/service';

export interface AppDependencies {
    config: Config;
    db: DatabaseSync;
    logger: Logger;
    prices: PriceService;
    currencies: CurrencyService;
}

export interface Logger {
    info(event: string, data?: Record<string, unknown>): void;
    error(event: string, data?: Record<string, unknown>): void;
}

export interface RuntimeOptions {
    provider?: QuoteProvider;
    catalogProvider?: CatalogProvider;
    clock?: () => number;
}
