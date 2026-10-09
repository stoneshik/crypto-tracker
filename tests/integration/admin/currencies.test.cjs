const { createTestContext, TEST_TIME } = require('../../support/test-context.cjs');
const { loginAdmin } = require('../../support/admin.cjs');
const { savePrice, quoteBatch } = require('../../support/prices.cjs');
const { UpstreamError } = require('../../../dist/errors');

describe('Admin cryptocurrency CRUD', () => {
    let context;
    let authorization;
    let provider;
    let catalogProvider;

    beforeEach(async () => {
        provider = { fetchQuotes: jest.fn().mockResolvedValue(quoteBatch()) };
        catalogProvider = { findBySymbol: jest.fn().mockResolvedValue([]) };
        context = createTestContext({ env: { SYNC_ENABLED: 'false' }, provider, catalogProvider });
        authorization = await loginAdmin(context);
    });

    afterEach(async () => {
        await context.dispose();
    });

    it('adds a currency with metadata from CoinMarketCap', async () => {
        provider.fetchQuotes.mockResolvedValue({
            quotes: [
                {
                    cmcId: 5426,
                    symbol: 'SOL',
                    name: 'Solana',
                    price: 140,
                    sourceUpdatedAt: TEST_TIME,
                },
            ],
            errors: new Map(),
        });

        const response = await context.http
            .post('/api/v1/cryptocurrencies')
            .set('Authorization', authorization)
            .send({
                cmcId: 5426,
                pollingIntervalSeconds: 600,
                retentionPolicy: { mode: 'days', days: 7 },
            })
            .expect(201);

        expect(response.headers.location).toBe(`/api/v1/cryptocurrencies/${response.body.id}`);
        expect(response.body).toMatchObject({
            cmcId: 5426,
            symbol: 'SOL',
            name: 'Solana',
            trackingEnabled: true,
            pollingIntervalSeconds: 600,
            retentionPolicy: { mode: 'days', days: 7 },
            effectiveRetentionPolicy: { mode: 'days', days: 7 },
            nextSyncAt: new Date(TEST_TIME).toISOString(),
        });
        expect(provider.fetchQuotes).toHaveBeenCalledWith([5426], expect.any(AbortSignal));
    });

    it('rejects a duplicate before calling the provider', async () => {
        await context.http
            .post('/api/v1/cryptocurrencies')
            .set('Authorization', authorization)
            .send({ cmcId: 1 })
            .expect(409);

        expect(provider.fetchQuotes).not.toHaveBeenCalled();
    });

    it('rejects an unsupported CMC ID', async () => {
        provider.fetchQuotes.mockResolvedValue({
            quotes: [],
            errors: new Map([[999, new UpstreamError('QUOTE_MISSING', 'Missing')]]),
        });

        await context.http
            .post('/api/v1/cryptocurrencies')
            .set('Authorization', authorization)
            .send({ cmcId: 999 })
            .expect(422);

        expect(context.currencyRepository.findByCmcId(999)).toBeUndefined();
    });

    it('does not create a record if the provider times out', async () => {
        provider.fetchQuotes.mockRejectedValue(new UpstreamError('UPSTREAM_TIMEOUT', 'Timeout'));

        const response = await context.http
            .post('/api/v1/cryptocurrencies')
            .set('Authorization', authorization)
            .send({ cmcId: 5426 })
            .expect(504);

        expect(response.body.code).toBe('UPSTREAM_TIMEOUT');
        expect(context.currencyRepository.findByCmcId(5426)).toBeUndefined();
    });

    it('pauses tracking without deleting prices or history', async () => {
        savePrice(context);

        const response = await context.http
            .patch('/api/v1/cryptocurrencies/1')
            .set('Authorization', authorization)
            .send({ trackingEnabled: false })
            .expect(200);

        expect(response.body).toMatchObject({
            trackingEnabled: false,
            nextSyncAt: null,
            syncState: 'disabled',
        });
        expect(context.prices.latest(1).price).toBe(100);
        expect(context.db.prepare('SELECT COUNT(*) AS count FROM price_history').get().count).toBe(
            1,
        );
    });

    it('resumes a paused currency immediately', async () => {
        context.currencyRepository.update(1, { trackingEnabled: false }, TEST_TIME);
        context.clock.advanceBy(10000);

        const response = await context.http
            .patch('/api/v1/cryptocurrencies/1')
            .set('Authorization', authorization)
            .send({ trackingEnabled: true })
            .expect(200);

        expect(response.body.nextSyncAt).toBe(new Date(context.clock.now()).toISOString());
    });

    it('recalculates the schedule when the interval changes', async () => {
        savePrice(context);
        context.clock.advanceBy(10000);

        const response = await context.http
            .patch('/api/v1/cryptocurrencies/1')
            .set('Authorization', authorization)
            .send({ pollingIntervalSeconds: 600 })
            .expect(200);

        expect(response.body.nextSyncAt).toBe(new Date(TEST_TIME + 600000).toISOString());
    });

    it('removes the currency, its history and its latest price', async () => {
        savePrice(context);
        savePrice(context, { currencyId: 2 });

        await context.http
            .delete('/api/v1/cryptocurrencies/1')
            .set('Authorization', authorization)
            .expect(204);

        expect(context.currencyRepository.find(1)).toBeUndefined();
        expect(
            context.db
                .prepare('SELECT COUNT(*) AS count FROM price_history WHERE cryptocurrency_id = 1')
                .get().count,
        ).toBe(0);
        expect(
            context.db
                .prepare('SELECT COUNT(*) AS count FROM latest_prices WHERE cryptocurrency_id = 1')
                .get().count,
        ).toBe(0);
        expect(context.prices.latest(2).price).toBe(100);
    });

    it('rejects deletion while a manual synchronization is queued', async () => {
        context.operations.createSynchronization({
            selection: { scope: 'selected', cryptocurrencyIds: [1] },
        });

        await context.http
            .delete('/api/v1/cryptocurrencies/1')
            .set('Authorization', authorization)
            .expect(409);

        expect(context.currencyRepository.find(1)).toBeDefined();
    });

    it('returns 404 when updating an unknown currency', async () => {
        await context.http
            .patch('/api/v1/cryptocurrencies/999')
            .set('Authorization', authorization)
            .send({ trackingEnabled: false })
            .expect(404);
    });

    it('returns 404 when deleting an unknown currency', async () => {
        await context.http
            .delete('/api/v1/cryptocurrencies/999')
            .set('Authorization', authorization)
            .expect(404);
    });

    it.each([
        { name: 'empty update', body: {}, status: 422 },
        { name: 'immutable CMC ID', body: { cmcId: 2 }, status: 400 },
        { name: 'string boolean', body: { trackingEnabled: 'true' }, status: 422 },
        { name: 'short interval', body: { pollingIntervalSeconds: 59 }, status: 422 },
        { name: 'fractional interval', body: { pollingIntervalSeconds: 60.5 }, status: 422 },
        {
            name: 'zero retention',
            body: { retentionPolicy: { mode: 'days', days: 0 } },
            status: 422,
        },
        {
            name: 'days for unlimited retention',
            body: { retentionPolicy: { mode: 'forever', days: 1 } },
            status: 422,
        },
    ])('rejects $name', async ({ body, status }) => {
        await context.http
            .patch('/api/v1/cryptocurrencies/1')
            .set('Authorization', authorization)
            .send(body)
            .expect(status);
    });
});
