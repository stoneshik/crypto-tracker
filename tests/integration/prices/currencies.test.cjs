const { createTestContext } = require('../../support/test-context.cjs');
const { bearer, registerAndLogin } = require('../../support/users.cjs');

describe('Cryptocurrencies', () => {
    let context;

    beforeEach(() => {
        context = createTestContext();
    });

    afterEach(async () => {
        await context.dispose();
    });

    it('paginates the list in a stable order', async () => {
        const first = await context.http
            .get('/api/v1/cryptocurrencies')
            .set('Authorization', context.serviceAuthorization)
            .query({ limit: 1 })
            .expect(200);

        const second = await context.http
            .get('/api/v1/cryptocurrencies')
            .set('Authorization', context.serviceAuthorization)
            .query({ limit: 1, cursor: first.body.page.nextCursor })
            .expect(200);

        expect(first.body.data[0].symbol).toBe('BTC');
        expect(first.body.page.hasMore).toBe(true);
        expect(second.body.data[0].symbol).toBe('ETH');
        expect(second.body.page).toEqual({ hasMore: false, nextCursor: null });
    });

    it('rejects an invalid tracking filter', async () => {
        await context.http
            .get('/api/v1/cryptocurrencies')
            .set('Authorization', context.serviceAuthorization)
            .query({ trackingEnabled: 'yes' })
            .expect(400);
    });

    it('rejects a cursor reused with another filter', async () => {
        const first = await context.http
            .get('/api/v1/cryptocurrencies')
            .set('Authorization', context.serviceAuthorization)
            .query({ limit: 1 })
            .expect(200);

        await context.http
            .get('/api/v1/cryptocurrencies')
            .set('Authorization', context.serviceAuthorization)
            .query({ cursor: first.body.page.nextCursor, trackingEnabled: false })
            .expect(400);
    });

    it('returns currency details for a user JWT', async () => {
        const { token } = await registerAndLogin(context);

        const response = await context.http
            .get('/api/v1/cryptocurrencies/1')
            .set('Authorization', bearer(token))
            .expect(200);

        expect(response.body).toMatchObject({
            cmcId: 1,
            trackingEnabled: true,
            retentionPolicy: { mode: 'inherit' },
        });
    });

    it('rejects an unknown currency', async () => {
        await context.http
            .get('/api/v1/cryptocurrencies/999')
            .set('Authorization', context.serviceAuthorization)
            .expect(404);
    });

    it('rejects an ID containing SQL', async () => {
        await context.http
            .get('/api/v1/cryptocurrencies/1%20OR%201=1')
            .set('Authorization', context.serviceAuthorization)
            .expect(400);
    });
});
