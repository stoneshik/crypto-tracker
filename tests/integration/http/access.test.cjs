const { createTestContext } = require('../../support/test-context.cjs');
const { bearer, registerAndLogin } = require('../../support/users.cjs');

describe('API access', () => {
    let context;

    beforeEach(() => {
        context = createTestContext();
    });

    afterEach(async () => {
        await context.dispose();
    });

    it.each([
        '/cryptocurrencies',
        '/cryptocurrencies/1',
        '/prices/latest',
        '/cryptocurrencies/1/prices/latest',
        '/cryptocurrencies/1/price-history',
        '/cryptocurrencies/1/price-aggregates',
    ])('requires authorization for GET %s', async (path) => {
        await context.http.get(`/api/v1${path}`).expect(401);
    });

    it.each([
        { method: 'post', path: '/cryptocurrencies' },
        { method: 'patch', path: '/cryptocurrencies/1' },
        { method: 'delete', path: '/cryptocurrencies/1' },
        { method: 'post', path: '/price-synchronizations' },
        { method: 'get', path: '/settings' },
        { method: 'post', path: '/price-history-deletions' },
    ])('forbids ordinary users from $method $path', async ({ method, path }) => {
        const { token } = await registerAndLogin(context);

        await context.http[method](`/api/v1${path}`)
            .set('Authorization', bearer(token))
            .expect(403);
    });
});
