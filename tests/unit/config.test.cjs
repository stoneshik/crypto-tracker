const { loadConfig } = require('../../dist/config/load-config');
const { testEnvironment } = require('../support/config.cjs');

describe('Environment configuration', () => {
    it('environment controls server, authentication and synchronization', () => {
        const config = loadConfig({
            ...testEnvironment(),
            PORT: '4100',
            HOST: '127.0.0.1',
            FRONTEND_ORIGIN: 'http://localhost:5173',
            POLL_INTERVAL_SECONDS: '600',
            ACCESS_TOKEN_TTL_SECONDS: '120',
            SYNC_ENABLED: 'false',
            CMC_API_KEY: '',
            SERVICE_API_KEY: '',
        });
        expect(config).toMatchObject({
            port: 4100,
            host: '127.0.0.1',
            frontendOrigin: 'http://localhost:5173',
            pollIntervalSeconds: 600,
            accessTokenTtlSeconds: 120,
            syncEnabled: false,
            cmcApiKey: '',
            serviceApiKey: '',
        });
    });

    it.each([
        { name: 'short JWT secret', values: { JWT_SECRET: 'short' } },
        { name: 'missing CMC key', values: { CMC_API_KEY: '' } },
        { name: 'nonnumeric port', values: { PORT: 'abc' } },
        { name: 'port outside range', values: { PORT: '65536' } },
        { name: 'invalid boolean', values: { SYNC_ENABLED: 'yes' } },
        { name: 'in-memory database', values: { DB_PATH: ':memory:' } },
        { name: 'short polling interval', values: { POLL_INTERVAL_SECONDS: '30' } },
        { name: 'origin with a path', values: { FRONTEND_ORIGIN: 'http://localhost:5173/path' } },
        { name: 'weak service key', values: { SERVICE_API_KEY: 'weak' } },
        { name: 'invalid currency JSON', values: { TRACKED_CURRENCIES: 'invalid' } },
        {
            name: 'missing currency name',
            values: { TRACKED_CURRENCIES: '[{"cmcId":1,"symbol":"BTC"}]' },
        },
        {
            name: 'duplicate CMC ID',
            values: {
                TRACKED_CURRENCIES:
                    '[{"cmcId":1,"symbol":"BTC","name":"Bitcoin"},{"cmcId":1,"symbol":"BTC","name":"Bitcoin"}]',
            },
        },
        {
            name: 'insecure production cookies',
            values: { NODE_ENV: 'production', COOKIE_SECURE: 'false' },
        },
    ])('rejects $name before startup', ({ values }) => {
        expect(() => loadConfig(testEnvironment(values))).toThrow();
    });
});
