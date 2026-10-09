const { createTestContext, TEST_TIME } = require('../../support/test-context.cjs');
const { loginAdmin } = require('../../support/admin.cjs');
const { quoteBatch } = require('../../support/prices.cjs');

describe('Retention settings', () => {
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

    it('returns the global retention policy', async () => {
        const response = await context.http
            .get('/api/v1/settings')
            .set('Authorization', authorization)
            .expect(200);

        expect(response.body).toMatchObject({
            quoteCurrency: 'USD',
            defaultRetentionPolicy: { mode: 'days', days: 30 },
        });
    });

    it('changes the global policy without overwriting individual settings', async () => {
        context.currencyRepository.update(
            2,
            { retentionPolicy: { mode: 'days', days: 7 } },
            TEST_TIME,
        );

        const response = await context.http
            .patch('/api/v1/settings')
            .set('Authorization', authorization)
            .send({ defaultRetentionPolicy: { mode: 'forever' } })
            .expect(200);

        expect(response.body.defaultRetentionPolicy).toEqual({ mode: 'forever' });
        expect(context.currencies.get(1).effectiveRetentionPolicy).toEqual({ mode: 'forever' });
        expect(context.currencies.get(2).effectiveRetentionPolicy).toEqual({
            mode: 'days',
            days: 7,
        });
    });

    it('rejects an inherited global policy', async () => {
        await context.http
            .patch('/api/v1/settings')
            .set('Authorization', authorization)
            .send({ defaultRetentionPolicy: { mode: 'inherit' } })
            .expect(422);
    });

    it('rejects an unknown settings query', async () => {
        await context.http
            .get('/api/v1/settings')
            .set('Authorization', authorization)
            .query({ extra: 1 })
            .expect(400);
    });

    it('changes all currencies, including paused ones', async () => {
        context.currencyRepository.update(2, { trackingEnabled: false }, TEST_TIME);

        const response = await context.http
            .patch('/api/v1/cryptocurrencies')
            .set('Authorization', authorization)
            .send({
                selection: { scope: 'all' },
                changes: { retentionPolicy: { mode: 'forever' } },
            })
            .expect(200);

        expect(response.body.updatedCount).toBe(2);
        expect(context.currencies.get(1)).toMatchObject({
            retentionPolicy: { mode: 'forever' },
            trackingEnabled: true,
            pollingIntervalSeconds: 300,
            nextSyncAt: new Date(TEST_TIME).toISOString(),
        });
        expect(context.currencies.get(2)).toMatchObject({
            retentionPolicy: { mode: 'forever' },
            trackingEnabled: false,
            pollingIntervalSeconds: 300,
            nextSyncAt: null,
        });
    });

    it('returns zero when there are no currencies to update', async () => {
        context.currencies.delete(1);
        context.currencies.delete(2);

        const response = await context.http
            .patch('/api/v1/cryptocurrencies')
            .set('Authorization', authorization)
            .send({
                selection: { scope: 'all' },
                changes: { retentionPolicy: { mode: 'forever' } },
            })
            .expect(200);

        expect(response.body.updatedCount).toBe(0);
    });

    it('resets selected currencies to the global policy', async () => {
        context.currencyRepository.update(1, { retentionPolicy: { mode: 'forever' } }, TEST_TIME);

        await context.http
            .patch('/api/v1/cryptocurrencies')
            .set('Authorization', authorization)
            .send({
                selection: { scope: 'selected', cryptocurrencyIds: [1] },
                changes: { retentionPolicy: { mode: 'inherit' } },
            })
            .expect(200);

        expect(context.currencies.get(1).retentionPolicy).toEqual({ mode: 'inherit' });
        expect(context.currencies.get(1).effectiveRetentionPolicy).toEqual({
            mode: 'days',
            days: 30,
        });
    });

    it('rejects the entire bulk update if any ID is unknown', async () => {
        await context.http
            .patch('/api/v1/cryptocurrencies')
            .set('Authorization', authorization)
            .send({
                selection: { scope: 'selected', cryptocurrencyIds: [1, 999] },
                changes: { retentionPolicy: { mode: 'forever' } },
            })
            .expect(404);

        expect(context.currencies.get(1).retentionPolicy).toEqual({ mode: 'inherit' });
    });

    it.each([
        { name: 'duplicate IDs', selection: { scope: 'selected', cryptocurrencyIds: [1, 1] } },
        { name: 'empty IDs', selection: { scope: 'selected', cryptocurrencyIds: [] } },
        { name: 'IDs with all scope', selection: { scope: 'all', cryptocurrencyIds: [1] } },
        { name: 'string ID', selection: { scope: 'selected', cryptocurrencyIds: ['1'] } },
    ])('rejects $name', async ({ selection }) => {
        await context.http
            .patch('/api/v1/cryptocurrencies')
            .set('Authorization', authorization)
            .send({ selection, changes: { retentionPolicy: { mode: 'forever' } } })
            .expect(422);
    });
});
