const { createTestContext, TEST_TIME } = require('../../support/test-context.cjs');
const { HISTORY_PERIOD, savePrice } = require('../../support/prices.cjs');

describe('GET price-history', () => {
    let context;

    beforeEach(() => {
        context = createTestContext();
    });

    afterEach(async () => {
        await context.dispose();
    });

    it('includes from and excludes to', async () => {
        savePrice(context, { price: 10, receivedAt: TEST_TIME - 3600000 });
        savePrice(context, { price: 20, receivedAt: TEST_TIME });
        savePrice(context, { price: 30, receivedAt: TEST_TIME + 3600000 });

        const response = await context.http
            .get('/api/v1/cryptocurrencies/1/price-history')
            .set('Authorization', context.serviceAuthorization)
            .query(HISTORY_PERIOD)
            .expect(200);

        expect(response.body.data.map((row) => row.price)).toEqual([10, 20]);
    });

    it('keeps pagination stable for equal timestamps and later inserts', async () => {
        savePrice(context, { price: 10 });
        savePrice(context, { price: 20 });
        savePrice(context, { price: 30 });
        const first = await context.http
            .get('/api/v1/cryptocurrencies/1/price-history')
            .set('Authorization', context.serviceAuthorization)
            .query({ ...HISTORY_PERIOD, limit: 2 })
            .expect(200);
        savePrice(context, { price: 99, receivedAt: TEST_TIME + 1000 });

        const next = await context.http
            .get('/api/v1/cryptocurrencies/1/price-history')
            .set('Authorization', context.serviceAuthorization)
            .query({ ...HISTORY_PERIOD, cursor: first.body.page.nextCursor })
            .expect(200);

        expect(first.body.data.map((row) => row.price)).toEqual([10, 20]);
        expect(next.body.data.map((row) => row.price)).toEqual([30]);
        expect(next.body.page.hasMore).toBe(false);
    });

    it('rejects a tampered cursor', async () => {
        savePrice(context, { price: 10 });
        savePrice(context, { price: 20 });
        const first = await context.http
            .get('/api/v1/cryptocurrencies/1/price-history')
            .set('Authorization', context.serviceAuthorization)
            .query({ ...HISTORY_PERIOD, limit: 1 })
            .expect(200);

        await context.http
            .get('/api/v1/cryptocurrencies/1/price-history')
            .set('Authorization', context.serviceAuthorization)
            .query({ ...HISTORY_PERIOD, cursor: `${first.body.page.nextCursor}x` })
            .expect(400);
    });

    it.each([
        { name: 'missing period', query: {}, status: 400 },
        {
            name: 'nonexistent date',
            query: { ...HISTORY_PERIOD, from: '2026-02-30T00:00:00Z' },
            status: 400,
        },
        {
            name: 'date without timezone',
            query: { ...HISTORY_PERIOD, from: '2026-10-08T11:00:00' },
            status: 400,
        },
        {
            name: 'reversed period',
            query: { from: HISTORY_PERIOD.to, to: HISTORY_PERIOD.from },
            status: 422,
        },
        {
            name: 'period longer than a year',
            query: { ...HISTORY_PERIOD, from: '2024-01-01T00:00:00Z' },
            status: 422,
        },
        { name: 'excessive page size', query: { ...HISTORY_PERIOD, limit: '1001' }, status: 400 },
        { name: 'unknown parameter', query: { ...HISTORY_PERIOD, unknown: 'x' }, status: 400 },
    ])('rejects $name', async ({ query, status }) => {
        await context.http
            .get('/api/v1/cryptocurrencies/1/price-history')
            .set('Authorization', context.serviceAuthorization)
            .query(query)
            .expect(status);
    });
});
