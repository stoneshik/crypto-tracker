const { createTestContext } = require('../../support/test-context.cjs');
const { loginAdmin } = require('../../support/admin.cjs');
const { quoteBatch } = require('../../support/prices.cjs');
const { UpstreamError } = require('../../../dist/errors');

describe('GET cryptocurrency-catalog', () => {
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

    it('looks up a symbol and preserves ambiguous matches', async () => {
        const matches = [
            { cmcId: 1, symbol: 'BTC', name: 'Bitcoin', slug: 'bitcoin', isActive: true },
            {
                cmcId: 99,
                symbol: 'BTC',
                name: 'Other Bitcoin',
                slug: 'other-bitcoin',
                isActive: false,
            },
        ];
        catalogProvider.findBySymbol.mockResolvedValue(matches);

        const response = await context.http
            .get('/api/v1/cryptocurrency-catalog')
            .set('Authorization', authorization)
            .query({ symbol: 'btc' })
            .expect(200);

        expect(response.body.data).toEqual(matches);
        expect(catalogProvider.findBySymbol).toHaveBeenCalledWith('BTC', expect.any(AbortSignal));
    });

    it('returns an empty list for an unknown symbol', async () => {
        const response = await context.http
            .get('/api/v1/cryptocurrency-catalog')
            .set('Authorization', authorization)
            .query({ symbol: 'UNKNOWN' })
            .expect(200);

        expect(response.body.data).toEqual([]);
    });

    it('rejects a missing symbol', async () => {
        await context.http
            .get('/api/v1/cryptocurrency-catalog')
            .set('Authorization', authorization)
            .expect(400);
    });

    it('returns a sanitized provider error', async () => {
        catalogProvider.findBySymbol.mockRejectedValue(
            new UpstreamError('UPSTREAM_RATE_LIMITED', 'Превышен лимит CoinMarketCap', false, 120),
        );

        const response = await context.http
            .get('/api/v1/cryptocurrency-catalog')
            .set('Authorization', authorization)
            .query({ symbol: 'BTC' })
            .expect(503);

        expect(response.headers['retry-after']).toBe('120');
        expect(JSON.stringify(response.body)).not.toContain(context.config.cmcApiKey);
    });
});
