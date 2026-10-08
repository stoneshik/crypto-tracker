const { TRACKED_CURRENCIES } = require('./config.cjs');
const { TEST_TIME } = require('./test-context.cjs');

const HISTORY_PERIOD = { from: '2026-10-08T11:00:00Z', to: '2026-10-08T13:00:00Z' };

function savePrice(
    context,
    {
        currencyId = 1,
        price = 100,
        receivedAt = context.clock.now(),
        sourceUpdatedAt = receivedAt,
    } = {},
) {
    const currency = context.currencyRepository.get(currencyId);
    context.priceRepository.saveQuote(
        currencyId,
        {
            cmcId: currency.cmc_id,
            symbol: currency.symbol,
            name: currency.name,
            price,
            sourceUpdatedAt,
        },
        receivedAt,
    );
}

function quoteBatch({ price = 100, sourceUpdatedAt = TEST_TIME, ids } = {}) {
    return {
        quotes: TRACKED_CURRENCIES.filter((currency) => !ids || ids.includes(currency.cmcId)).map(
            (currency) => ({ ...currency, price, sourceUpdatedAt }),
        ),
        errors: new Map(),
    };
}

module.exports = { HISTORY_PERIOD, savePrice, quoteBatch };
