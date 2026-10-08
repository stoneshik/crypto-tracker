const { createTestContext, TEST_TIME } = require('../../support/test-context.cjs');
const { savePrice } = require('../../support/prices.cjs');

describe('Latest prices', () => {
    let context;

    beforeEach(() => {
        context = createTestContext();
    });

    afterEach(async () => {
        await context.dispose();
    });

    it('returns pending until a quote has been received', async () => {
        const response = await context.http
            .get('/api/v1/prices/latest')
            .set('Authorization', context.serviceAuthorization)
            .expect(200);

        expect(response.body.data).toHaveLength(2);
        expect(response.body.data[0]).toEqual({
            cryptocurrencyId: 1,
            quoteCurrency: 'USD',
            status: 'pending',
        });
    });

    it('returns a fresh quote filtered by currency ID', async () => {
        savePrice(context, { price: 123.456789 });

        const response = await context.http
            .get('/api/v1/prices/latest')
            .set('Authorization', context.serviceAuthorization)
            .query({ cryptocurrencyIds: '1' })
            .expect(200);

        expect(response.body.data).toHaveLength(1);
        expect(response.body.data[0]).toMatchObject({ status: 'fresh', price: 123.456789 });
    });

    it('marks a saved quote stale after two polling intervals', async () => {
        savePrice(context);
        context.clock.advanceBy(600001);

        const response = await context.http
            .get('/api/v1/cryptocurrencies/1/prices/latest')
            .set('Authorization', context.serviceAuthorization)
            .expect(200);

        expect(response.body.status).toBe('stale');
    });

    it('marks a newly received quote stale when its source timestamp is old', async () => {
        savePrice(context, { sourceUpdatedAt: TEST_TIME - 600001 });

        const response = await context.http
            .get('/api/v1/cryptocurrencies/1/prices/latest')
            .set('Authorization', context.serviceAuthorization)
            .expect(200);

        expect(response.body.status).toBe('stale');
    });

    it('rejects duplicate currency IDs', async () => {
        await context.http
            .get('/api/v1/prices/latest')
            .set('Authorization', context.serviceAuthorization)
            .query({ cryptocurrencyIds: '1,1' })
            .expect(400);
    });

    it('rejects an unknown ID in the filter', async () => {
        await context.http
            .get('/api/v1/prices/latest')
            .set('Authorization', context.serviceAuthorization)
            .query({ cryptocurrencyIds: '999' })
            .expect(404);
    });

    it('rejects an unknown currency on the detail route', async () => {
        await context.http
            .get('/api/v1/cryptocurrencies/999/prices/latest')
            .set('Authorization', context.serviceAuthorization)
            .expect(404);
    });
});
