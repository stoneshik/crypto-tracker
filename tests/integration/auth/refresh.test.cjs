const { createTestContext } = require('../../support/test-context.cjs');
const { bearer, refreshCookie, registerAndLogin } = require('../../support/users.cjs');

describe('POST /api/v1/auth/tokens', () => {
    let context;

    beforeEach(() => {
        context = createTestContext();
    });

    afterEach(async () => {
        await context.dispose();
    });

    it('rotates the cookie and issues a valid JWT', async () => {
        const session = await registerAndLogin(context);

        const response = await context.http
            .post('/api/v1/auth/tokens')
            .set('Cookie', session.cookie)
            .expect(200);

        expect(refreshCookie(response)).not.toBe(session.cookie);
        await context.http
            .get('/api/v1/users/me')
            .set('Authorization', bearer(response.body.accessToken))
            .expect(200);
    });

    it('revokes the session when a used refresh token is replayed', async () => {
        const session = await registerAndLogin(context);
        const rotated = await context.http
            .post('/api/v1/auth/tokens')
            .set('Cookie', session.cookie)
            .expect(200);

        await context.http.post('/api/v1/auth/tokens').set('Cookie', session.cookie).expect(401);

        await context.http
            .post('/api/v1/auth/tokens')
            .set('Cookie', refreshCookie(rotated))
            .expect(401);
        await context.http
            .get('/api/v1/users/me')
            .set('Authorization', bearer(session.token))
            .expect(401);
        await context.http
            .get('/api/v1/users/me')
            .set('Authorization', bearer(rotated.body.accessToken))
            .expect(401);
    });

    it('rejects a missing cookie', async () => {
        await context.http.post('/api/v1/auth/tokens').expect(401);
    });

    it('rejects duplicate refresh cookies', async () => {
        const { cookie } = await registerAndLogin(context);

        await context.http
            .post('/api/v1/auth/tokens')
            .set('Cookie', `${cookie}; ${cookie}`)
            .expect(400);
    });

    it('rejects a request body', async () => {
        const { cookie } = await registerAndLogin(context);

        await context.http.post('/api/v1/auth/tokens').set('Cookie', cookie).send({}).expect(400);
    });

    it('rejects a foreign origin', async () => {
        const { cookie } = await registerAndLogin(context);

        await context.http
            .post('/api/v1/auth/tokens')
            .set('Cookie', cookie)
            .set('Origin', 'https://evil.example')
            .expect(403);
    });

    it('rejects an expired session', async () => {
        const { cookie } = await registerAndLogin(context);
        context.clock.advanceBy(context.config.refreshTokenTtlSeconds * 1000);

        await context.http.post('/api/v1/auth/tokens').set('Cookie', cookie).expect(401);
    });
});
