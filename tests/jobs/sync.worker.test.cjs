const { createTestContext, TEST_TIME } = require('../support/test-context.cjs');
const { quoteBatch, savePrice } = require('../support/prices.cjs');
const { registerAndLogin } = require('../support/users.cjs');

const { UpstreamError } = require('../../dist/errors');
const { openDatabase } = require('../../dist/database');

describe('SyncWorker', () => {
    let context;
    let provider;

    beforeEach(() => {
        provider = { fetchQuotes: jest.fn().mockResolvedValue(quoteBatch()) };
        context = createTestContext({ provider });
    });

    afterEach(async () => {
        await context.dispose();
        jest.useRealTimers();
    });

    describe('polling', () => {
        it('saves the latest quote, history and synchronization state', async () => {
            await context.worker.runOnce();

            expect(provider.fetchQuotes).toHaveBeenCalledWith([1, 1027], expect.any(AbortSignal));
            expect(context.prices.latest(1)).toMatchObject({ price: 100, status: 'fresh' });
            expect(
                context.db.prepare('SELECT COUNT(*) AS count FROM price_history').get().count,
            ).toBe(2);
            expect(context.currencyRepository.get(1)).toMatchObject({
                syncing: 0,
                failure_count: 0,
                last_successful_sync_at: TEST_TIME,
                next_sync_at: TEST_TIME + 300000,
            });
        });

        it('skips currencies until their next scheduled update', async () => {
            await context.worker.runOnce();

            await context.worker.runOnce();

            expect(provider.fetchQuotes).toHaveBeenCalledTimes(1);
        });

        it('collects the next observation when currencies become due', async () => {
            await context.worker.runOnce();
            context.clock.advanceBy(300000);

            await context.worker.runOnce();

            expect(provider.fetchQuotes).toHaveBeenCalledTimes(2);
            expect(
                context.db.prepare('SELECT COUNT(*) AS count FROM price_history').get().count,
            ).toBe(4);
        });

        it('shares one job between concurrent ticks', async () => {
            let complete;
            provider.fetchQuotes.mockImplementation(
                () =>
                    new Promise((resolve) => {
                        complete = resolve;
                    }),
            );

            const first = context.worker.runOnce();
            const second = context.worker.runOnce();

            expect(first).toBe(second);
            expect(provider.fetchQuotes).toHaveBeenCalledTimes(1);
            complete(quoteBatch());
            await first;
        });

        it('makes no provider requests when synchronization is disabled', async () => {
            await context.dispose();
            context = createTestContext({
                env: { SYNC_ENABLED: 'false', CMC_API_KEY: '' },
                provider,
            });

            await context.worker.runOnce();

            expect(provider.fetchQuotes).not.toHaveBeenCalled();
            expect(context.currencies.get(1).symbol).toBe('BTC');
        });
    });

    describe('failure recovery', () => {
        it('preserves saved prices and records a failed attempt', async () => {
            savePrice(context, { price: 42, receivedAt: TEST_TIME - 300000 });
            provider.fetchQuotes.mockRejectedValue(
                new UpstreamError('UPSTREAM_UNAVAILABLE', 'CoinMarketCap временно недоступен'),
            );

            await context.worker.runOnce();

            expect(context.prices.latest(1).price).toBe(42);
            expect(
                context.db.prepare('SELECT COUNT(*) AS count FROM price_history').get().count,
            ).toBe(1);
            expect(context.currencyRepository.get(1)).toMatchObject({
                syncing: 0,
                failure_count: 1,
                next_sync_at: TEST_TIME + 60000,
                last_error_code: 'UPSTREAM_UNAVAILABLE',
            });
        });

        it('increases the delay after consecutive failures', async () => {
            provider.fetchQuotes.mockRejectedValue(
                new UpstreamError('UPSTREAM_UNAVAILABLE', 'Unavailable'),
            );
            await context.worker.runOnce();
            context.clock.advanceBy(60000);

            await context.worker.runOnce();

            expect(context.currencyRepository.get(1).next_sync_at).toBe(TEST_TIME + 180000);
        });

        it('clears the failure state after a successful retry', async () => {
            provider.fetchQuotes.mockRejectedValueOnce(
                new UpstreamError('UPSTREAM_UNAVAILABLE', 'Unavailable'),
            );
            await context.worker.runOnce();
            context.clock.advanceBy(60000);
            provider.fetchQuotes.mockResolvedValue(quoteBatch({ price: 80 }));

            await context.worker.runOnce();

            expect(context.currencyRepository.get(1)).toMatchObject({
                failure_count: 0,
                last_error_code: null,
            });
            expect(context.prices.latest(1).price).toBe(80);
        });

        it('saves a valid quote when another currency is missing', async () => {
            const batch = quoteBatch({ ids: [1] });
            batch.errors.set(1027, new UpstreamError('QUOTE_MISSING', 'Котировка отсутствует'));
            provider.fetchQuotes.mockResolvedValue(batch);

            await context.worker.runOnce();

            expect(context.prices.latest(1).status).toBe('fresh');
            expect(context.prices.latest(2).status).toBe('pending');
            expect(context.currencyRepository.get(2).last_error_code).toBe('QUOTE_MISSING');
        });

        it('preserves Retry-After across configuration reloads', async () => {
            provider.fetchQuotes.mockRejectedValue(
                new UpstreamError('UPSTREAM_RATE_LIMITED', 'Лимит', false, 600),
            );
            await context.worker.runOnce();

            context.currencyRepository.initialize(context.config, TEST_TIME + 1000);

            expect(context.currencyRepository.get(1).next_sync_at).toBe(TEST_TIME + 600000);
            context.clock.set(TEST_TIME + 599000);
            await context.worker.runOnce();
            expect(provider.fetchQuotes).toHaveBeenCalledTimes(1);
            context.clock.set(TEST_TIME + 600000);
            await context.worker.runOnce();
            expect(provider.fetchQuotes).toHaveBeenCalledTimes(2);
        });
    });

    describe('lifecycle', () => {
        it('aborts an active request and clears the persisted running state on stop', async () => {
            let signal;
            provider.fetchQuotes.mockImplementation((_ids, abortSignal) => {
                signal = abortSignal;
                return new Promise((_resolve, reject) => {
                    signal.addEventListener('abort', () => reject(signal.reason), { once: true });
                });
            });
            const running = context.worker.runOnce();
            expect(context.currencyRepository.get(1).syncing).toBe(1);

            await context.worker.stop();
            await running;

            expect(signal.aborted).toBe(true);
            expect(context.currencyRepository.get(1)).toMatchObject({
                syncing: 0,
                last_error_code: null,
            });
            expect(
                context.db.prepare('SELECT COUNT(*) AS count FROM price_history').get().count,
            ).toBe(0);
            await context.worker.runOnce();
            expect(provider.fetchQuotes).toHaveBeenCalledTimes(1);
        });

        it('schedules recurring work and removes its timer on stop', async () => {
            jest.useFakeTimers();
            context.worker.start();
            context.worker.start();
            await jest.advanceTimersByTimeAsync(0);
            expect(provider.fetchQuotes).toHaveBeenCalledTimes(1);
            context.clock.advanceBy(300000);
            await jest.advanceTimersByTimeAsync(context.config.syncTickMs);
            expect(provider.fetchQuotes).toHaveBeenCalledTimes(2);

            await context.worker.stop();
            await jest.advanceTimersByTimeAsync(600000);

            expect(provider.fetchQuotes).toHaveBeenCalledTimes(2);
            expect(jest.getTimerCount()).toBe(0);
        });
    });

    describe('persistence and cleanup', () => {
        it('keeps paused currencies and history across configuration reloads', async () => {
            savePrice(context);
            context.currencyRepository.update(1, { trackingEnabled: false }, TEST_TIME + 1000);
            context.clock.advanceBy(1000);

            context.currencyRepository.initialize(
                { ...context.config, trackedCurrencies: [] },
                context.clock.now(),
            );
            await context.worker.runOnce();

            expect(provider.fetchQuotes).toHaveBeenCalledWith([1027], expect.any(AbortSignal));
            expect(context.currencyRepository.get(1)).toMatchObject({
                tracking_enabled: 0,
                next_sync_at: null,
            });
            const reopened = openDatabase(context.config);
            try {
                expect(
                    reopened
                        .prepare(
                            'SELECT COUNT(*) AS count FROM price_history WHERE cryptocurrency_id = 1',
                        )
                        .get().count,
                ).toBe(1);
                expect(
                    reopened
                        .prepare('SELECT tracking_enabled FROM cryptocurrencies WHERE id = 1')
                        .get().tracking_enabled,
                ).toBe(0);
            } finally {
                reopened.close();
            }
        });

        it('removes expired sessions and rate limits without deleting users', async () => {
            await registerAndLogin(context);
            context.auth.checkRateLimit('login', '127.0.0.1');
            context.clock.advanceBy(context.config.refreshTokenTtlSeconds * 1000);

            await context.worker.runOnce();

            expect(context.db.prepare('SELECT COUNT(*) AS count FROM sessions').get().count).toBe(
                0,
            );
            expect(
                context.db.prepare('SELECT COUNT(*) AS count FROM refresh_tokens').get().count,
            ).toBe(0);
            expect(
                context.db.prepare('SELECT COUNT(*) AS count FROM rate_limits').get().count,
            ).toBe(0);
            expect(context.db.prepare('SELECT COUNT(*) AS count FROM users').get().count).toBe(1);
        });
    });
});
