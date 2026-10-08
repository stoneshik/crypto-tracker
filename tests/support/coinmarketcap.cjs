const axios = require('axios');
const { CoinMarketCapClient } = require('../../dist/integrations/coinmarketcap/client');
const { testConfig } = require('./config.cjs');

const TEST_TIME = Date.parse('2026-10-08T12:00:00.000Z');
const config = testConfig();

function quoteResponse(id = 1, price = 65000.12345678) {
    return {
        id,
        name: 'Bitcoin',
        symbol: 'BTC',
        quote: [{ symbol: 'USD', price, last_updated: new Date(TEST_TIME).toISOString() }],
    };
}

function httpResponse(data) {
    return { data, status: 200, statusText: 'OK', headers: {}, config: {} };
}

function createClient(adapter, overrides = {}) {
    return new CoinMarketCapClient(
        { ...config, ...overrides },
        axios.create({ adapter }),
        () => TEST_TIME,
    );
}

function fetchQuotes(client) {
    return client.fetchQuotes([1, 1027], new AbortController().signal);
}

function upstreamHttpError(status, headers = {}) {
    return new axios.AxiosError(
        'never expose provider internals or API keys',
        'ERR_BAD_RESPONSE',
        undefined,
        undefined,
        { status, headers, data: { message: 'secret response' }, statusText: 'Error', config: {} },
    );
}

module.exports = {
    quoteResponse,
    httpResponse,
    createClient,
    fetchQuotes,
    upstreamHttpError,
    config,
    TEST_TIME,
};
