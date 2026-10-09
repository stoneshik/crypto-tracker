import { createApp } from './app';
import { JwtTokens } from './auth/jwt';
import { AuthRepository } from './auth/repository';
import { AuthService } from './auth/service';
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
import { SettingsService } from './settings/service';
import type { RuntimeOptions } from './types';

export function createRuntime(config: Config, options: RuntimeOptions = {}) {
    const db = openDatabase(config);
    try {
        const clock = options.clock ?? Date.now;
        const logger = createLogger(config.logLevel);
        const authRepository = new AuthRepository(db);
        const currencyRepository = new CurrencyRepository(db);
        const priceRepository = new PriceRepository(db);
        const settingsRepository = new SettingsRepository(db);
        settingsRepository.initialize(config.defaultRetentionDays, clock());
        currencyRepository.initialize(config, clock());

        const tokens = new JwtTokens(config);
        const cursors = new CursorCodec(config.jwtSecret);
        const client = new CoinMarketCapClient(config, undefined, clock);
        const provider = options.provider ?? client;
        const catalogProvider = options.catalogProvider ?? client;
        const requests = new AbortController();
        const auth = new AuthService(authRepository, tokens, config, clock);
        const currencies = new CurrencyService(
            currencyRepository,
            settingsRepository,
            cursors,
            provider,
            catalogProvider,
            config,
            requests.signal,
            clock,
        );
        const prices = new PriceService(priceRepository, currencyRepository, cursors, clock);
        const settings = new SettingsService(settingsRepository, clock);
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
            authRepository,
            priceRepository,
            synchronization,
            config,
            logger,
            clock,
        );
        const app = createApp({
            config,
            db,
            auth,
            prices,
            currencies,
            settings,
            logger,
        });

        return {
            app,
            db,
            worker,
            auth,
            prices,
            currencies,
            settings,
            authRepository,
            currencyRepository,
            priceRepository,
            settingsRepository,
            tokens,
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
