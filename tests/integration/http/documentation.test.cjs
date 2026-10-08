const { createTestContext } = require('../../support/test-context.cjs');

describe('Public endpoints', () => {
    let context;

    beforeEach(() => {
        context = createTestContext();
    });

    afterEach(async () => {
        await context.dispose();
    });

    it('reports a healthy database', async () => {
        const response = await context.http.get('/health').expect(200);

        expect(response.body).toEqual({ status: 'ok' });
    });

    it('serves the implemented OpenAPI contract without provider secrets', async () => {
        const response = await context.http.get('/openapi.json').expect(200);

        expect(response.body.openapi).toBe('3.0.3');
        expect(Object.keys(response.body.paths)).toHaveLength(17);
        expect(JSON.stringify(response.body)).not.toContain(context.config.cmcApiKey);
    });

    it('serves the Swagger page', async () => {
        await context.http.get('/docs').expect(200).expect('Content-Type', /html/);
    });

    it('serves the Swagger initialization script', async () => {
        await context.http
            .get('/docs/init.js')
            .expect(200)
            .expect('Content-Type', /javascript/);
    });

    it('serves Swagger styles', async () => {
        await context.http.get('/docs/assets/swagger-ui.css').expect(200);
    });

    it('returns 404 for a missing asset', async () => {
        await context.http.get('/docs/assets/missing.css').expect(404);
    });

    it.each(['/health', '/openapi.json', '/docs', '/docs/init.js'])(
        'rejects unknown query parameters on %s',
        async (path) => {
            await context.http.get(path).query({ unknown: 1 }).expect(400);
        },
    );
});
