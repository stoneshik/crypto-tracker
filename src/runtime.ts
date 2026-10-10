import { createApp } from './app';
import type { Config } from './config/types';
import type { RuntimeOptions } from './types';
import { openDatabase } from './database';
import { createLogger } from './logger';
import { AuthRepository } from './auth/repository';
import { AuthService } from './auth/service';
import { JwtTokens } from './auth/jwt';
import { CurrencyRepository } from './currencies/repository';
import { CurrencyService } from './currencies/service';
import { PriceRepository } from './prices/repository';
import { PriceService } from './prices/service';
import { CursorCodec } from './prices/cursor';
import { SettingsRepository } from './settings/repository';
import { SettingsService } from './settings/service';
import { OperationRepository } from './operations/repository';
import { OperationService } from './operations/service';
import { CoinMarketCapClient } from './integrations/coinmarketcap/client';
import { SynchronizationService } from './jobs/synchronization.service';
import { SyncWorker } from './jobs/sync.worker';

export function createRuntime(config: Config, options: RuntimeOptions = {}) {
    const db = openDatabase(config);
    try {
        const clock = options.clock ?? Date.now;
        const logger = createLogger(config.logLevel);
        const authRepository = new AuthRepository(db);
        const currencyRepository = new CurrencyRepository(db);
        const priceRepository = new PriceRepository(db);
        const settingsRepository = new SettingsRepository(db);
        const operationRepository = new OperationRepository(db, currencyRepository);
        settingsRepository.initialize(config.defaultRetentionDays, clock());
        currencyRepository.initialize(config, clock());
        operationRepository.recover(clock());

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
        const operations = new OperationService(
            operationRepository,
            Boolean(config.cmcApiKey),
            clock,
        );
        const synchronization = new SynchronizationService(
            db,
            currencyRepository,
            priceRepository,
            operationRepository,
            provider,
            config,
            clock,
        );
        const worker = new SyncWorker(
            currencyRepository,
            authRepository,
            operationRepository,
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
            operations,
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
            operations,
            authRepository,
            currencyRepository,
            priceRepository,
            settingsRepository,
            operationRepository,
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
