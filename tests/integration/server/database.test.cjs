const { createTestContext } = require('../../support/test-context.cjs');
const { transaction } = require('../../../dist/database');

describe('SQLite transactions', () => {
    let context;

    beforeEach(() => {
        context = createTestContext();
    });

    afterEach(async () => {
        await context.dispose();
    });

    it('rolls back history, latest price and currency state together when a write fails', () => {
        context.db.exec(
            "CREATE TRIGGER reject_latest BEFORE INSERT ON latest_prices BEGIN SELECT RAISE(ABORT, 'test failure'); END",
        );

        expect(() =>
            context.priceRepository.saveQuote(
                1,
                { cmcId: 1, symbol: 'BTC', name: 'Bitcoin', price: 42, sourceUpdatedAt: 1000 },
                1000,
            ),
        ).toThrow();

        expect(context.db.prepare('SELECT COUNT(*) AS count FROM price_history').get().count).toBe(
            0,
        );
        expect(context.db.prepare('SELECT COUNT(*) AS count FROM latest_prices').get().count).toBe(
            0,
        );
        expect(context.currencyRepository.get(1).last_successful_sync_at).toBeNull();
    });

    it('rolls back a nested transaction when its enclosing operation fails', () => {
        expect(() =>
            transaction(context.db, () => {
                context.priceRepository.saveQuote(
                    1,
                    { cmcId: 1, symbol: 'BTC', name: 'Bitcoin', price: 42, sourceUpdatedAt: 1000 },
                    1000,
                );
                throw new Error('operation failed');
            }),
        ).toThrow('operation failed');

        expect(context.db.prepare('SELECT COUNT(*) AS count FROM price_history').get().count).toBe(
            0,
        );
        expect(context.currencyRepository.get(1).last_successful_sync_at).toBeNull();
    });
});
