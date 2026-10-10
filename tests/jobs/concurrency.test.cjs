const { createTestContext, TEST_TIME } = require('../support/test-context.cjs');
const { quoteBatch } = require('../support/prices.cjs');

describe('Polling during administrative changes', () => {
    let context;
    let provider;
    let complete;

    beforeEach(() => {
        provider = {
            fetchQuotes: jest.fn().mockImplementation(
                () =>
                    new Promise((resolve) => {
                        complete = resolve;
                    }),
            ),
        };
        context = createTestContext({ provider });
    });

    afterEach(async () => {
        await context.dispose();
    });
    it('ignores a late quote for a deleted currency and saves other currencies', async () => {
        const running = context.worker.runOnce();
        context.currencyRepository.delete(1);

        complete(quoteBatch());
        await running;

        expect(context.currencyRepository.find(1)).toBeUndefined();
        expect(context.prices.latest(2).price).toBe(100);
        expect(
            context.db
                .prepare('SELECT COUNT(*) AS count FROM price_history WHERE cryptocurrency_id = 1')
                .get().count,
        ).toBe(0);
    });

    it('allows an in-flight quote to finish after a pause without scheduling another poll', async () => {
        const running = context.worker.runOnce();
        context.currencyRepository.update(1, { trackingEnabled: false }, TEST_TIME);

        complete(quoteBatch());
        await running;

        expect(context.prices.latest(1).price).toBe(100);
        expect(context.currencyRepository.get(1).next_sync_at).toBeNull();
    });

    it('serializes a manual request behind an active automatic poll', async () => {
        const automatic = context.worker.runOnce();
        const job = context.operations.createSynchronization({
            selection: { scope: 'selected', cryptocurrencyIds: [1] },
        });
        expect(context.worker.runOnce()).toBe(automatic);
        complete(quoteBatch());
        await automatic;
        expect(context.operations.getSynchronization(job.id).status).toBe('queued');
        provider.fetchQuotes.mockResolvedValue(quoteBatch({ price: 200 }));

        await context.worker.runOnce();

        expect(provider.fetchQuotes).toHaveBeenCalledTimes(2);
        expect(context.operations.getSynchronization(job.id).status).toBe('succeeded');
        expect(context.prices.latest(1).price).toBe(200);
    });
});
