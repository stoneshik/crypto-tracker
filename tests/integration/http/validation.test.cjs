const { createTestContext } = require('../../support/test-context.cjs');
const { DEFAULT_USER } = require('../../support/users.cjs');

describe('Request bodies', () => {
    let context;

    beforeEach(() => {
        context = createTestContext();
    });

    afterEach(async () => {
        await context.dispose();
    });

    it('rejects malformed JSON', async () => {
        const response = await context.http
            .post('/api/v1/users')
            .set('Content-Type', 'application/json')
            .send('{')
            .expect(400);

        expect(response.body.code).toBe('INVALID_JSON');
    });

    it('rejects form submissions', async () => {
        await context.http.post('/api/v1/users').type('form').send(DEFAULT_USER).expect(415);
    });

    it('rejects oversized JSON', async () => {
        await context.http
            .post('/api/v1/users')
            .send({ password: 'a'.repeat(20000) })
            .expect(413);
    });
});
