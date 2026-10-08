const { createTestContext } = require('../../support/test-context.cjs');
const { bearer, loginUser, registerAndLogin } = require('../../support/users.cjs');

describe('DELETE /api/v1/auth/sessions/current', () => {
    let context;

    beforeEach(() => {
        context = createTestContext();
    });

    afterEach(async () => {
        await context.dispose();
    });

    it('revokes the current session and preserves other sessions', async () => {
        const session = await registerAndLogin(context);
        const other = await loginUser(context);

        const response = await context.http
            .delete('/api/v1/auth/sessions/current')
            .set('Authorization', bearer(session.token))
            .set('Cookie', session.cookie)
            .expect(204);

        expect(response.headers['set-cookie'][0]).toMatch(/Expires=Thu, 01 Jan 1970/);
        await context.http
            .get('/api/v1/users/me')
            .set('Authorization', bearer(session.token))
            .expect(401);
        await context.http.post('/api/v1/auth/tokens').set('Cookie', session.cookie).expect(401);
        await context.http
            .get('/api/v1/users/me')
            .set('Authorization', bearer(other.token))
            .expect(200);
    });

    it('accepts the refresh cookie after JWT expiry', async () => {
        const { token, cookie } = await registerAndLogin(context);
        context.clock.advanceBy(901000);

        await context.http
            .delete('/api/v1/auth/sessions/current')
            .set('Authorization', bearer(token))
            .set('Cookie', cookie)
            .expect(204);
    });

    it('rejects conflicting JWT and cookie sessions', async () => {
        const first = await registerAndLogin(context);
        const second = await registerAndLogin(context, { email: 'other@example.com' });

        await context.http
            .delete('/api/v1/auth/sessions/current')
            .set('Authorization', bearer(first.token))
            .set('Cookie', second.cookie)
            .expect(409);
    });

    it('rejects a request without credentials', async () => {
        await context.http.delete('/api/v1/auth/sessions/current').expect(401);
    });
});
