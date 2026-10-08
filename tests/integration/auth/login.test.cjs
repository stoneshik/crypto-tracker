const { createTestContext } = require('../../support/test-context.cjs');
const { DEFAULT_USER, registerUser, loginUser } = require('../../support/users.cjs');

describe('POST /api/v1/auth/sessions', () => {
    let context;

    beforeEach(() => {
        context = createTestContext();
    });

    afterEach(async () => {
        await context.dispose();
    });

    it('returns a JWT and a restricted refresh cookie', async () => {
        await registerUser(context);

        const { response, token } = await loginUser(context);

        expect(token.split('.')).toHaveLength(3);
        expect(response.body.expiresIn).toBe(900);
        expect(response.body.refreshToken).toBeUndefined();
        expect(response.headers['cache-control']).toBe('no-store');
        expect(response.headers['set-cookie'][0]).toMatch(/HttpOnly/);
        expect(response.headers['set-cookie'][0]).toMatch(/SameSite=Strict/);
        expect(response.headers['set-cookie'][0]).toMatch(/Path=\/api\/v1\/auth/);
    });

    it('stores only the hash of the refresh token', async () => {
        await registerUser(context);

        const { cookie } = await loginUser(context);

        const row = context.db.prepare('SELECT token_hash FROM refresh_tokens').get();
        expect(row.token_hash).not.toBe(cookie.split('=')[1]);
        expect(row.token_hash).toHaveLength(64);
    });

    it.each([
        { name: 'wrong password', email: DEFAULT_USER.email },
        { name: 'unknown email', email: 'absent@example.com' },
    ])('rejects $name with the same error', async ({ email }) => {
        await registerUser(context);

        const response = await context.http
            .post('/api/v1/auth/sessions')
            .send({ email, password: 'incorrect' })
            .expect(401);

        expect(response.body.code).toBe('INVALID_CREDENTIALS');
    });
});
