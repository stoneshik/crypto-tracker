const { createTestContext, TEST_TIME } = require('../../support/test-context.cjs');
const { HISTORY_PERIOD, savePrice } = require('../../support/prices.cjs');

describe('GET price-aggregates', () => {
    let context;

    beforeEach(() => {
        context = createTestContext();
    });

    afterEach(async () => {
        await context.dispose();
    });

    it('computes OHLC and average from observations, omitting gaps', async () => {
        savePrice(context, { price: 10 });
        savePrice(context, { price: 30 });
        savePrice(context, { price: 20, receivedAt: TEST_TIME + 30000 });
        savePrice(context, { price: 40, receivedAt: TEST_TIME + 120000 });

        const response = await context.http
            .get('/api/v1/cryptocurrencies/1/price-aggregates')
            .set('Authorization', context.serviceAuthorization)
            .query({ ...HISTORY_PERIOD, intervalSeconds: 60 })
            .expect(200);

        expect(response.body.data).toEqual([
            {
                bucketStart: '2026-10-08T12:00:00.000Z',
                bucketEnd: '2026-10-08T12:01:00.000Z',
                count: 3,
                open: 10,
                high: 30,
                low: 10,
                close: 20,
                average: 20,
            },
            {
                bucketStart: '2026-10-08T12:02:00.000Z',
                bucketEnd: '2026-10-08T12:03:00.000Z',
                count: 1,
                open: 40,
                high: 40,
                low: 40,
                close: 40,
                average: 40,
            },
        ]);
    });

    it('rejects an unsupported interval', async () => {
        await context.http
            .get('/api/v1/cryptocurrencies/1/price-aggregates')
            .set('Authorization', context.serviceAuthorization)
            .query({ ...HISTORY_PERIOD, intervalSeconds: 61 })
            .expect(422);
    });

    it('rejects a query with more than 2000 buckets', async () => {
        await context.http
            .get('/api/v1/cryptocurrencies/1/price-aggregates')
            .set('Authorization', context.serviceAuthorization)
            .query({ from: '2026-01-01T00:00:00Z', to: HISTORY_PERIOD.to, intervalSeconds: 60 })
            .expect(422);
    });
});
