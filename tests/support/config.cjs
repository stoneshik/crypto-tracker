const { loadConfig } = require('../../dist/config/load-config');

const TRACKED_CURRENCIES = [
    { cmcId: 1, symbol: 'BTC', name: 'Bitcoin' },
    { cmcId: 1027, symbol: 'ETH', name: 'Ethereum' },
];

function testEnvironment(overrides = {}) {
    return {
        NODE_ENV: 'test',
        HOST: '127.0.0.1',
        JWT_SECRET: 'test-secret-with-at-least-thirty-two-bytes',
        SERVICE_API_KEY: `ctk_${'s'.repeat(43)}`,
        CMC_API_KEY: 'server-only-cmc-key',
        DB_PATH: './unused-test.sqlite',
        SYNC_ENABLED: 'true',
        LOG_LEVEL: 'silent',
        AUTH_RATE_LIMIT_MAX: '1000',
        CMC_RETRY_DELAY_MS: '1',
        TRACKED_CURRENCIES: JSON.stringify(TRACKED_CURRENCIES),
        ...overrides,
    };
}

function testConfig(overrides = {}) {
    return loadConfig(testEnvironment(overrides));
}

module.exports = { testEnvironment, testConfig, TRACKED_CURRENCIES };
