import { createApp } from './app';
import type { Config } from './config/types';
import { CurrencyRepository } from './currencies/repository';
import { openDatabase } from './database';
import { CoinMarketCapClient } from './integrations/coinmarketcap/client';
import { SyncWorker } from './jobs/sync.worker';
import { SynchronizationService } from './jobs/synchronization.service';
import { createLogger } from './logger';
import { PriceRepository } from './prices/repository';
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

        const client = new CoinMarketCapClient(config, undefined, clock);
        const provider = options.provider ?? client;
        const requests = new AbortController();
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
            logger,
        });

        return {
            app,
            db,
            worker,
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
