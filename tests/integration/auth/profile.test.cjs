const { createTestContext } = require('../../support/test-context.cjs');
const { DEFAULT_USER, bearer, registerAndLogin } = require('../../support/users.cjs');

describe('GET /api/v1/users/me', () => {
    let context;

    beforeEach(() => {
        context = createTestContext();
    });

    afterEach(async () => {
        await context.dispose();
    });

    it('returns the authenticated user', async () => {
        const { token } = await registerAndLogin(context);

        const response = await context.http
            .get('/api/v1/users/me')
            .set('Authorization', bearer(token))
            .expect(200);

        expect(response.body.email).toBe(DEFAULT_USER.email);
    });

    it('rejects requests without authorization', async () => {
        await context.http.get('/api/v1/users/me').expect(401);
    });

    it('rejects a service key', async () => {
        await context.http
            .get('/api/v1/users/me')
            .set('Authorization', context.serviceAuthorization)
            .expect(401);
    });
});
