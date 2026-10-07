import { createApp } from './app';
import type { Config } from './config/types';
import { CurrencyRepository } from './currencies/repository';
import { CurrencyService } from './currencies/service';
import { openDatabase } from './database';
import { CoinMarketCapClient } from './integrations/coinmarketcap/client';
import { SyncWorker } from './jobs/sync.worker';
import { SynchronizationService } from './jobs/synchronization.service';
import { createLogger } from './logger';
import { CursorCodec } from './prices/cursor';
import { PriceRepository } from './prices/repository';
import { PriceService } from './prices/service';
import { SettingsRepository } from './settings/repository';
import type { RuntimeOptions } from './types';

export function createRuntime(config: Config, options: RuntimeOptions = {}) {
    const db = openDatabase(config);
    try {
        const clock = options.clock ?? Date.now;
        const logger = createLogger(config.logLevel);
        const currencyRepository = new CurrencyRepository(db);
        const priceRepository = new PriceRepository(db);
        const settingsRepository = new SettingsRepository(db);
        settingsRepository.initialize(config.defaultRetentionDays, clock());
        currencyRepository.initialize(config, clock());

        const cursors = new CursorCodec(config.jwtSecret);
        const client = new CoinMarketCapClient(config, undefined, clock);
        const provider = options.provider ?? client;
        const requests = new AbortController();
        const currencies = new CurrencyService(currencyRepository, settingsRepository, cursors);
        const prices = new PriceService(priceRepository, currencyRepository, cursors, clock);
        const synchronization = new SynchronizationService(
            db,
            currencyRepository,
            priceRepository,
            provider,
            config,
            clock,
        );
        const worker = new SyncWorker(
            currencyRepository,
            priceRepository,
            synchronization,
            config,
            logger,
            clock,
        );
        const app = createApp({
            config,
            db,
            prices,
            currencies,
            logger,
        });

        return {
            app,
            db,
            worker,
            prices,
            currencies,
            currencyRepository,
            priceRepository,
            settingsRepository,
            logger,

            cancelRequests() {
                requests.abort(new Error('Server shutdown'));
            },
        };
    } catch (error) {
        db.close();
        throw error;
    }
}
