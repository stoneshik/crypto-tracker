const { createTestContext } = require('../../support/test-context.cjs');
const { DEFAULT_USER } = require('../../support/users.cjs');

describe('CORS', () => {
    let context;

    beforeEach(() => {
        context = createTestContext({ env: { FRONTEND_ORIGIN: 'http://localhost:5173' } });
    });

    afterEach(async () => {
        await context.dispose();
    });

    it('permits credentials from the configured frontend', async () => {
        const response = await context.http
            .options('/api/v1/auth/sessions')
            .set('Origin', context.config.frontendOrigin)
            .set('Access-Control-Request-Method', 'POST')
            .set('Access-Control-Request-Headers', 'content-type')
            .expect(204);

        expect(response.headers['access-control-allow-origin']).toBe(context.config.frontendOrigin);
        expect(response.headers['access-control-allow-credentials']).toBe('true');
    });

    it('permits registration from Swagger on the API origin', async () => {
        await context.http
            .post('/api/v1/users')
            .set('Origin', context.config.apiOrigin)
            .send(DEFAULT_USER)
            .expect(201);
    });

    it('rejects preflight from a foreign origin', async () => {
        await context.http
            .options('/api/v1/auth/sessions')
            .set('Origin', 'https://evil.example')
            .set('Access-Control-Request-Method', 'POST')
            .expect(403);
    });

    it('rejects an unsupported preflight method', async () => {
        await context.http
            .options('/api/v1/auth/sessions')
            .set('Origin', context.config.frontendOrigin)
            .set('Access-Control-Request-Method', 'PUT')
            .expect(400);
    });
});
