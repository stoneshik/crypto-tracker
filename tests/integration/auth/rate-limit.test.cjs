const { createTestContext } = require('../../support/test-context.cjs');

describe('Authentication rate limit', () => {
    let context;

    beforeEach(() => {
        context = createTestContext({
            env: { AUTH_RATE_LIMIT_MAX: '2', AUTH_RATE_LIMIT_WINDOW_SECONDS: '60' },
        });
    });

    afterEach(async () => {
        await context.dispose();
    });

    function attemptLogin() {
        return context.http
            .post('/api/v1/auth/sessions')
            .send({ email: 'x@example.com', password: 'bad' });
    }

    it('persists attempts and returns Retry-After', async () => {
        await attemptLogin().expect(401);
        await attemptLogin().expect(401);

        const response = await attemptLogin().expect(429);

        expect(response.headers['retry-after']).toBe('60');
        expect(context.db.prepare('SELECT hits FROM rate_limits').get().hits).toBe(3);
    });

    it('allows requests after the window expires', async () => {
        await attemptLogin().expect(401);
        await attemptLogin().expect(401);
        await attemptLogin().expect(429);
        context.clock.advanceBy(60000);

        await attemptLogin().expect(401);

        expect(context.db.prepare('SELECT hits FROM rate_limits').get().hits).toBe(1);
    });
});
