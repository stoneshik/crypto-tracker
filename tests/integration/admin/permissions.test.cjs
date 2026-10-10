const { createTestContext } = require('../../support/test-context.cjs');
const { registerAndLogin, bearer } = require('../../support/users.cjs');

const ADMIN_ROUTES = [
    { method: 'get', path: '/cryptocurrency-catalog' },
    { method: 'post', path: '/cryptocurrencies' },
    { method: 'patch', path: '/cryptocurrencies' },
    { method: 'patch', path: '/cryptocurrencies/1' },
    { method: 'delete', path: '/cryptocurrencies/1' },
    { method: 'get', path: '/settings' },
    { method: 'patch', path: '/settings' },
    { method: 'post', path: '/price-synchronizations' },
    { method: 'get', path: '/price-synchronizations/00000000-0000-4000-8000-000000000000' },
    { method: 'post', path: '/price-history-deletions' },
    { method: 'get', path: '/price-history-deletions/00000000-0000-4000-8000-000000000000' },
];

describe('Administrator access', () => {
    let context;

    beforeEach(() => {
        context = createTestContext({ env: { SYNC_ENABLED: 'false' } });
    });

    afterEach(async () => {
        await context.dispose();
    });

    it.each(ADMIN_ROUTES)('rejects anonymous $method $path', async ({ method, path }) => {
        await context.http[method](`/api/v1${path}`).expect(401);
    });

    it.each(ADMIN_ROUTES)('rejects a user JWT for $method $path', async ({ method, path }) => {
        const { token } = await registerAndLogin(context);

        await context.http[method](`/api/v1${path}`)
            .set('Authorization', bearer(token))
            .expect(403);
    });

    it.each(ADMIN_ROUTES)('rejects a service key for $method $path', async ({ method, path }) => {
        await context.http[method](`/api/v1${path}`)
            .set('Authorization', context.serviceAuthorization)
            .expect(403);
    });
});
