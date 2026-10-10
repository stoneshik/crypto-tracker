const {
    createClient,
    fetchQuotes,
    upstreamHttpError,
    config,
    TEST_TIME,
} = require('../../support/coinmarketcap.cjs');
const axios = require('axios');
const { createServer } = require('node:http');
const { CoinMarketCapClient } = require('../../../dist/integrations/coinmarketcap/client');

describe('CoinMarketCap timeouts and cancellation', () => {
    it('real axios request times out against an unresponsive local HTTP server', async () => {
        const server = createServer((_req, _res) => {});
        await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
        try {
            const http = axios.create({
                baseURL: `http://127.0.0.1:${server.address().port}`,
                proxy: false,
            });
            const instance = new CoinMarketCapClient(
                { ...config, cmcTimeoutMs: 100, cmcMaxRetries: 0 },
                http,
                () => TEST_TIME,
            );
            await expect(fetchQuotes(instance)).rejects.toMatchObject({ code: 'UPSTREAM_TIMEOUT' });
        } finally {
            server.closeAllConnections();
            await new Promise((resolve) => server.close(resolve));
        }
    });

    it('shutdown cancellation interrupts the retry delay', async () => {
        const adapter = jest.fn().mockRejectedValue(upstreamHttpError(503));
        const controller = new AbortController();
        const instance = createClient(adapter, { cmcRetryDelayMs: 1000 });
        const pending = instance.fetchQuotes([1], controller.signal);
        const checked = expect(pending).rejects.toBeDefined();
        await new Promise((resolve) => setImmediate(resolve));
        controller.abort();
        await checked;
        expect(adapter).toHaveBeenCalledTimes(1);
    });
});
