const { createTestContext, TEST_TIME } = require('../support/test-context.cjs');
const { savePrice } = require('../support/prices.cjs');
const DAY = 86400000;

describe('Automatic history retention', () => {
    let context;

    beforeEach(() => {
        context = createTestContext({
            env: { SYNC_ENABLED: 'false', CLEANUP_BATCH_SIZE: '1', CLEANUP_INTERVAL_SECONDS: '60' },
        });
    });

    afterEach(async () => {
        await context.dispose();
    });
    it('cleans inherited history and keeps the exact retention boundary and latest quote', async () => {
        savePrice(context, { price: 10, receivedAt: TEST_TIME - 31 * DAY });
        savePrice(context, { price: 20, receivedAt: TEST_TIME - 30 * DAY });
        savePrice(context, { price: 30, receivedAt: TEST_TIME - 32 * DAY });

        await context.worker.runOnce();

        expect(context.db.prepare('SELECT price FROM price_history').all()).toEqual([
            expect.objectContaining({ price: 20 }),
        ]);
        expect(context.prices.latest(1).price).toBe(30);
    });

    it('applies a custom policy to paused currencies', async () => {
        context.currencyRepository.update(
            1,
            { trackingEnabled: false, retentionPolicy: { mode: 'days', days: 7 } },
            TEST_TIME,
        );
        savePrice(context, { price: 10, receivedAt: TEST_TIME - 8 * DAY });
        savePrice(context, { price: 20, receivedAt: TEST_TIME - 6 * DAY });

        await context.worker.runOnce();

        expect(context.db.prepare('SELECT price FROM price_history').all()).toEqual([
            expect.objectContaining({ price: 20 }),
        ]);
    });

    it('keeps unlimited history despite a shorter global policy', async () => {
        context.currencyRepository.update(1, { retentionPolicy: { mode: 'forever' } }, TEST_TIME);
        savePrice(context, { price: 10, receivedAt: TEST_TIME - 365 * DAY });

        await context.worker.runOnce();

        expect(context.db.prepare('SELECT COUNT(*) AS count FROM price_history').get().count).toBe(
            1,
        );
    });

    it('uses the updated global policy on the next cleanup cycle', async () => {
        context.settings.update({ defaultRetentionPolicy: { mode: 'forever' } });
        savePrice(context, { receivedAt: TEST_TIME - 31 * DAY });
        await context.worker.runOnce();
        context.settings.update({ defaultRetentionPolicy: { mode: 'days', days: 1 } });
        context.clock.advanceBy(60000);

        await context.worker.runOnce();

        expect(context.db.prepare('SELECT COUNT(*) AS count FROM price_history').get().count).toBe(
            0,
        );
    });
});
