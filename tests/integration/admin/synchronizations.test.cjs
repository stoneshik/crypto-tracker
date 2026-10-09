const { createTestContext, TEST_TIME } = require('../../support/test-context.cjs');
const { loginAdmin } = require('../../support/admin.cjs');
const { quoteBatch } = require('../../support/prices.cjs');
const { UpstreamError } = require('../../../dist/errors');

describe('Manual synchronizations', () => {
    let context;
    let authorization;
    let provider;
    let catalogProvider;

    beforeEach(async () => {
        provider = { fetchQuotes: jest.fn().mockResolvedValue(quoteBatch()) };
        catalogProvider = { findBySymbol: jest.fn().mockResolvedValue([]) };
        context = createTestContext({ env: { SYNC_ENABLED: 'false' }, provider, catalogProvider });
        authorization = await loginAdmin(context);
    });

    afterEach(async () => {
        await context.dispose();
    });

    it('accepts a job and exposes its final result', async () => {
        const created = await context.http
            .post('/api/v1/price-synchronizations')
            .set('Authorization', authorization)
            .send({ selection: { scope: 'all' } })
            .expect(202);
        expect(created.body).toMatchObject({
            status: 'queued',
            totalCount: 2,
            succeededCount: 0,
            failedCount: 0,
        });

        await context.worker.runOnce();
        const completed = await context.http
            .get(created.headers.location)
            .set('Authorization', authorization)
            .expect(200);

        expect(completed.body).toMatchObject({
            status: 'succeeded',
            succeededCount: 2,
            failedCount: 0,
        });
        expect(context.prices.latest(1).price).toBe(100);
    });

    it('synchronizes a paused currency without resuming automatic polling', async () => {
        context.currencyRepository.update(1, { trackingEnabled: false }, TEST_TIME);
        const created = await context.http
            .post('/api/v1/price-synchronizations')
            .set('Authorization', authorization)
            .send({ selection: { scope: 'selected', cryptocurrencyIds: [1] } })
            .expect(202);

        await context.worker.runOnce();

        expect(context.operations.getSynchronization(created.body.id).status).toBe('succeeded');
        expect(context.currencyRepository.get(1)).toMatchObject({
            tracking_enabled: 0,
            next_sync_at: null,
        });
        expect(context.prices.latest(1).price).toBe(100);
    });

    it('records partial success without discarding valid quotes', async () => {
        provider.fetchQuotes.mockResolvedValue({
            quotes: quoteBatch({ ids: [1] }).quotes,
            errors: new Map([[1027, new UpstreamError('QUOTE_MISSING', 'Missing')]]),
        });
        const job = context.operations.createSynchronization({ selection: { scope: 'all' } });

        await context.worker.runOnce();
        const response = await context.http
            .get(`/api/v1/price-synchronizations/${job.id}`)
            .set('Authorization', authorization)
            .expect(200);

        expect(response.body).toMatchObject({
            status: 'partially_succeeded',
            succeededCount: 1,
            failedCount: 1,
        });
        expect(response.body.items[1].error.code).toBe('QUOTE_MISSING');
    });

    it('returns a failed job with HTTP 200 when the provider is unavailable', async () => {
        provider.fetchQuotes.mockRejectedValue(
            new UpstreamError('UPSTREAM_UNAVAILABLE', 'Unavailable'),
        );
        const job = context.operations.createSynchronization({ selection: { scope: 'all' } });

        await context.worker.runOnce();
        const response = await context.http
            .get(`/api/v1/price-synchronizations/${job.id}`)
            .set('Authorization', authorization)
            .expect(200);

        expect(response.body).toMatchObject({
            status: 'failed',
            succeededCount: 0,
            failedCount: 2,
        });
    });

    it('rejects overlapping active jobs', async () => {
        context.operations.createSynchronization({
            selection: { scope: 'selected', cryptocurrencyIds: [1] },
        });

        await context.http
            .post('/api/v1/price-synchronizations')
            .set('Authorization', authorization)
            .send({ selection: { scope: 'all' } })
            .expect(409);
    });

    it('rejects an unknown selected currency', async () => {
        await context.http
            .post('/api/v1/price-synchronizations')
            .set('Authorization', authorization)
            .send({ selection: { scope: 'selected', cryptocurrencyIds: [999] } })
            .expect(404);
    });

    it('returns 404 for an unknown job', async () => {
        await context.http
            .get('/api/v1/price-synchronizations/00000000-0000-4000-8000-000000000000')
            .set('Authorization', authorization)
            .expect(404);
    });

    it('rejects a malformed job ID', async () => {
        await context.http
            .get('/api/v1/price-synchronizations/not-a-uuid')
            .set('Authorization', authorization)
            .expect(400);
    });
});
