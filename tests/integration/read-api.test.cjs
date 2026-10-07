const { createTestContext } = require('../support/test-context.cjs');
const { savePrice, HISTORY_PERIOD } = require('../support/prices.cjs');

describe('Reading prices', () => {
    let context;

    beforeEach(() => { context = createTestContext(); });
    afterEach(async () => { await context.dispose(); });

    it('returns the tracked currencies', async () => {
        const response = await context.http.get('/api/v1/cryptocurrencies')
            .set('Authorization', context.serviceAuthorization).expect(200);
        expect(response.body.data.map(currency => currency.symbol)).toEqual(['BTC', 'ETH']);
    });

    it('requires a valid key', async () => {
        await context.http.get('/api/v1/cryptocurrencies').expect(401);
    });

    it('returns the latest saved price', async () => {
        savePrice(context, { price: 150 });
        const response = await context.http.get('/api/v1/prices/latest')
            .set('Authorization', context.serviceAuthorization).expect(200);
        expect(response.body.data[0].price).toBe(150);
    });

    it('rejects an invalid limit', async () => {
        await context.http.get('/api/v1/prices/latest').query({ limit: -1 })
            .set('Authorization', context.serviceAuthorization).expect(400);
    });

    it('returns observations for the selected period', async () => {
        savePrice(context, { price: 150 });
        const response = await context.http.get('/api/v1/cryptocurrencies/1/price-history')
            .query(HISTORY_PERIOD).set('Authorization', context.serviceAuthorization).expect(200);
        expect(response.body.data).toHaveLength(1);
        expect(response.body.data[0].price).toBe(150);
    });

    it('rejects an invalid period', async () => {
        await context.http.get('/api/v1/cryptocurrencies/1/price-history')
            .query({ from: 'invalid', to: HISTORY_PERIOD.to })
            .set('Authorization', context.serviceAuthorization).expect(400);
    });
});
