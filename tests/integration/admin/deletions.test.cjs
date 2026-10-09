const { createTestContext, TEST_TIME } = require('../../support/test-context.cjs');
const { loginAdmin } = require('../../support/admin.cjs');
const { savePrice, quoteBatch } = require('../../support/prices.cjs');

describe('History deletion jobs', () => {
    let context;
    let authorization;
    let provider;
    let catalogProvider;

    beforeEach(async () => {
        provider = { fetchQuotes: jest.fn().mockResolvedValue(quoteBatch()) };
        catalogProvider = { findBySymbol: jest.fn().mockResolvedValue([]) };
        context = createTestContext({
            env: { SYNC_ENABLED: 'false', CLEANUP_BATCH_SIZE: '1' },
            provider,
            catalogProvider,
        });
        authorization = await loginAdmin(context);
    });

    afterEach(async () => {
        await context.dispose();
    });

    it('deletes only the selected period and preserves latest quotes and new observations', async () => {
        savePrice(context, { price: 10, receivedAt: TEST_TIME - 3600000 });
        savePrice(context, { price: 20, receivedAt: TEST_TIME - 1000 });
        savePrice(context, { price: 30, receivedAt: TEST_TIME });
        savePrice(context, { currencyId: 2, price: 40, receivedAt: TEST_TIME - 1000 });
        const created = await context.http
            .post('/api/v1/price-history-deletions')
            .set('Authorization', authorization)
            .send({
                selection: { scope: 'selected', cryptocurrencyIds: [1] },
                from: new Date(TEST_TIME - 3600000).toISOString(),
                to: new Date(TEST_TIME).toISOString(),
            })
            .expect(202);
        savePrice(context, { price: 99, receivedAt: TEST_TIME - 2000 });

        await context.worker.runOnce();
        const response = await context.http
            .get(created.headers.location)
            .set('Authorization', authorization)
            .expect(200);

        expect(response.body).toMatchObject({
            status: 'succeeded',
            deletedRows: 2,
            cryptocurrencyIds: [1],
        });
        expect(
            context.db
                .prepare('SELECT price FROM price_history WHERE cryptocurrency_id = 1 ORDER BY id')
                .all()
                .map((row) => row.price),
        ).toEqual([30, 99]);
        expect(context.prices.latest(1).price).toBe(99);
        expect(context.prices.latest(2).price).toBe(40);
    });

    it('fixes the all-currencies selection at creation time', async () => {
        savePrice(context, { receivedAt: TEST_TIME - 1000 });
        savePrice(context, { currencyId: 2, receivedAt: TEST_TIME - 1000 });
        const created = context.operations.createDeletion({
            selection: { scope: 'all' },
            from: new Date(TEST_TIME - 3600000).toISOString(),
            to: new Date(TEST_TIME).toISOString(),
        });
        const added = context.currencyRepository.create(
            {
                cmcId: 5426,
                trackingEnabled: false,
                pollingIntervalSeconds: 300,
                retentionPolicy: { mode: 'forever' },
            },
            { symbol: 'SOL', name: 'Solana' },
            TEST_TIME,
        );
        savePrice(context, { currencyId: added.id, price: 999, receivedAt: TEST_TIME - 1000 });

        await context.worker.runOnce();

        expect(context.operations.getDeletion(created.id)).toMatchObject({
            status: 'succeeded',
            deletedRows: 2,
            cryptocurrencyIds: [1, 2],
        });
        expect(context.db.prepare('SELECT price FROM price_history').all()).toEqual([
            expect.objectContaining({ price: 999 }),
        ]);
    });

    it('rejects overlapping deletion jobs', async () => {
        const body = {
            selection: { scope: 'all' },
            from: new Date(TEST_TIME - 3600000).toISOString(),
            to: new Date(TEST_TIME).toISOString(),
        };
        context.operations.createDeletion(body);

        await context.http
            .post('/api/v1/price-history-deletions')
            .set('Authorization', authorization)
            .send(body)
            .expect(409);
    });

    it('permits adjacent deletion periods', async () => {
        const selection = { scope: 'all' };
        context.operations.createDeletion({
            selection,
            from: new Date(TEST_TIME - 7200000).toISOString(),
            to: new Date(TEST_TIME - 3600000).toISOString(),
        });

        await context.http
            .post('/api/v1/price-history-deletions')
            .set('Authorization', authorization)
            .send({
                selection,
                from: new Date(TEST_TIME - 3600000).toISOString(),
                to: new Date(TEST_TIME).toISOString(),
            })
            .expect(202);
    });

    it('rejects a future period', async () => {
        await context.http
            .post('/api/v1/price-history-deletions')
            .set('Authorization', authorization)
            .send({
                selection: { scope: 'all' },
                from: new Date(TEST_TIME - 1000).toISOString(),
                to: new Date(TEST_TIME + 1000).toISOString(),
            })
            .expect(422);
    });

    it('rejects an unknown selected currency', async () => {
        await context.http
            .post('/api/v1/price-history-deletions')
            .set('Authorization', authorization)
            .send({
                selection: { scope: 'selected', cryptocurrencyIds: [999] },
                from: new Date(TEST_TIME - 1000).toISOString(),
                to: new Date(TEST_TIME).toISOString(),
            })
            .expect(404);
    });

    it('returns 404 for an unknown job', async () => {
        await context.http
            .get('/api/v1/price-history-deletions/00000000-0000-4000-8000-000000000000')
            .set('Authorization', authorization)
            .expect(404);
    });

    it('rejects a malformed job ID', async () => {
        await context.http
            .get('/api/v1/price-history-deletions/bad-id')
            .set('Authorization', authorization)
            .expect(400);
    });
});
