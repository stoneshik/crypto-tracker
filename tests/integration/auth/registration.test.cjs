const { createTestContext, TEST_TIME } = require('../../support/test-context.cjs');
const { DEFAULT_USER, registerUser } = require('../../support/users.cjs');

describe('POST /api/v1/users', () => {
    let context;

    beforeEach(() => {
        context = createTestContext();
    });

    afterEach(async () => {
        await context.dispose();
    });

    it('normalizes email and returns only public user fields', async () => {
        const response = await context.http
            .post('/api/v1/users')
            .send({ ...DEFAULT_USER, email: ' Reader@Example.COM ' })
            .expect(201);

        expect(response.body).toEqual({
            id: expect.any(String),
            email: DEFAULT_USER.email,
            role: 'USER',
            createdAt: new Date(TEST_TIME).toISOString(),
        });
    });

    it('stores a salted password hash', async () => {
        await registerUser(context);

        const row = context.authRepository.findUser(DEFAULT_USER.email);

        expect(row.password_hash).not.toBe(DEFAULT_USER.password);
        expect(row.password_hash).toHaveLength(128);
        expect(row.password_salt).toHaveLength(32);
    });

    it('rejects a duplicate email regardless of case', async () => {
        await registerUser(context);

        const response = await context.http
            .post('/api/v1/users')
            .send({ ...DEFAULT_USER, email: 'READER@example.com' })
            .expect(409);

        expect(response.body.code).toBe('EMAIL_ALREADY_EXISTS');
    });

    it.each([
        { name: 'invalid email', body: { ...DEFAULT_USER, email: 'invalid' }, status: 422 },
        { name: 'short password', body: { ...DEFAULT_USER, password: 'short' }, status: 422 },
        { name: 'missing password', body: { email: DEFAULT_USER.email }, status: 422 },
        {
            name: 'long password',
            body: { ...DEFAULT_USER, password: 'a'.repeat(129) },
            status: 422,
        },
        { name: 'unknown field', body: { ...DEFAULT_USER, ignored: true }, status: 400 },
        { name: 'admin role', body: { ...DEFAULT_USER, role: 'ADMIN' }, status: 400 },
    ])('rejects $name', async ({ body, status }) => {
        const response = await context.http.post('/api/v1/users').send(body).expect(status);

        expect(response.headers['content-type']).toMatch(/application\/problem\+json/);
        expect(response.body).toMatchObject({
            status,
            code: 'VALIDATION_FAILED',
            requestId: expect.any(String),
        });
    });
});
