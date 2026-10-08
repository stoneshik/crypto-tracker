const {
    quoteResponse,
    httpResponse,
    createClient,
    fetchQuotes,
    upstreamHttpError,
    TEST_TIME,
} = require('../../support/coinmarketcap.cjs');

describe('CoinMarketCap failures', () => {
    it('recovers after a temporary server error', async () => {
        const adapter = jest
            .fn()
            .mockRejectedValueOnce(upstreamHttpError(503))
            .mockResolvedValue(httpResponse([quoteResponse(1), quoteResponse(1027)]));

        const result = await fetchQuotes(createClient(adapter));

        expect(result.quotes).toHaveLength(2);
        expect(adapter).toHaveBeenCalledTimes(2);
    });

    it('stops after the configured number of retries', async () => {
        const adapter = jest.fn().mockRejectedValue(upstreamHttpError(500));

        await expect(fetchQuotes(createClient(adapter))).rejects.toMatchObject({
            code: 'UPSTREAM_UNAVAILABLE',
        });

        expect(adapter).toHaveBeenCalledTimes(3);
    });

    it.each([401, 403])('does not retry HTTP %s or expose provider details', async (status) => {
        const adapter = jest.fn().mockRejectedValue(upstreamHttpError(status));

        await expect(fetchQuotes(createClient(adapter))).rejects.toMatchObject({
            code: 'UPSTREAM_AUTHENTICATION_FAILED',
            message: 'CoinMarketCap отклонил серверный ключ',
        });

        expect(adapter).toHaveBeenCalledTimes(1);
    });

    it.each([
        { name: 'seconds', header: '120', seconds: 120 },
        { name: 'HTTP date', header: new Date(TEST_TIME + 90000).toUTCString(), seconds: 90 },
        { name: 'invalid value', header: 'nonsense', seconds: 60 },
    ])('handles Retry-After as $name without immediate retry', async ({ header, seconds }) => {
        const adapter = jest
            .fn()
            .mockRejectedValue(upstreamHttpError(429, { 'retry-after': header }));

        await expect(fetchQuotes(createClient(adapter))).rejects.toMatchObject({
            code: 'UPSTREAM_RATE_LIMITED',
            retryAfterSeconds: seconds,
        });

        expect(adapter).toHaveBeenCalledTimes(1);
    });
});
