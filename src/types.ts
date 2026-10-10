import type { DatabaseSync } from 'node:sqlite';
import type { Config } from './config/types';
import type { AuthService } from './auth/service';
import type { PriceService } from './prices/service';
import type { CurrencyService } from './currencies/service';
import type { SettingsService } from './settings/service';
import type { OperationService } from './operations/service';
import type { QuoteProvider, CatalogProvider } from './integrations/coinmarketcap/types';

export interface AppDependencies {
    config: Config;
    db: DatabaseSync;
    auth: AuthService;
    prices: PriceService;
    currencies: CurrencyService;
    settings: SettingsService;
    operations: OperationService;
    logger: Logger;
}

export interface RuntimeOptions {
    provider?: QuoteProvider;
    catalogProvider?: CatalogProvider;
    clock?: () => number;
}

export interface Logger {
    info(event: string, data?: Record<string, unknown>): void;
    error(event: string, data?: Record<string, unknown>): void;
}
