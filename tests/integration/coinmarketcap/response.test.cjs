const {
    quoteResponse,
    httpResponse,
    createClient,
    fetchQuotes,
    config,
    TEST_TIME,
} = require('../../support/coinmarketcap.cjs');

describe('CoinMarketCap quotes', () => {
    it.each([
        { name: 'bare array', wrap: (data) => data },
        { name: 'data envelope', wrap: (data) => ({ data, status: { error_code: 0 } }) },
    ])('parses a v3 response as $name', async ({ wrap }) => {
        const data = [quoteResponse(1), quoteResponse(1027, 0.000000123)];
        const adapter = jest.fn().mockResolvedValue(httpResponse(wrap(data)));

        const result = await fetchQuotes(createClient(adapter));

        expect(result.quotes.map((quote) => quote.price)).toEqual([65000.12345678, 0.000000123]);
        expect(result.errors.size).toBe(0);
    });

    it('sends the key only to the provider and applies request limits', async () => {
        const adapter = jest
            .fn()
            .mockResolvedValue(httpResponse([quoteResponse(1), quoteResponse(1027)]));

        const result = await fetchQuotes(createClient(adapter));

        const request = adapter.mock.calls[0][0];
        expect(request.url).toBe('/v3/cryptocurrency/quotes/latest');
        expect(request.params).toEqual({ id: '1,1027', convert: 'USD', skip_invalid: 'true' });
        expect(request.headers.get('X-CMC_PRO_API_KEY')).toBe(config.cmcApiKey);
        expect(request.timeout).toBe(config.cmcTimeoutMs);
        expect(request.maxRedirects).toBe(0);
        expect(JSON.stringify(result)).not.toContain(config.cmcApiKey);
    });

    it('records a missing quote without dropping the valid quote', async () => {
        const client = createClient(async () => httpResponse([quoteResponse(1)]));

        const result = await fetchQuotes(client);

        expect(result.quotes).toHaveLength(1);
        expect(result.errors.get(1027).code).toBe('QUOTE_MISSING');
    });

    it('rejects a negative price without dropping the other currency', async () => {
        const client = createClient(async () =>
            httpResponse([quoteResponse(1, -1), quoteResponse(1027)]),
        );

        const result = await fetchQuotes(client);

        expect(result.quotes[0].cmcId).toBe(1027);
        expect(result.errors.get(1).code).toBe('UPSTREAM_INVALID_RESPONSE');
    });

    it.each([
        { name: 'object instead of quote array', quote: { USD: { price: 1 } } },
        {
            name: 'string price',
            quote: [
                { symbol: 'USD', price: '12', last_updated: new Date(TEST_TIME).toISOString() },
            ],
        },
        {
            name: 'nonexistent date',
            quote: [{ symbol: 'USD', price: 1, last_updated: '2026-02-30T00:00:00Z' }],
        },
        {
            name: 'future timestamp',
            quote: [
                {
                    symbol: 'USD',
                    price: 1,
                    last_updated: new Date(TEST_TIME + 120000).toISOString(),
                },
            ],
        },
    ])('rejects $name', async ({ quote }) => {
        const client = createClient(async () => httpResponse([{ ...quoteResponse(), quote }]));

        const result = await fetchQuotes(client);

        expect(result.quotes).toEqual([]);
        expect(result.errors.get(1).code).toBe('UPSTREAM_INVALID_RESPONSE');
    });

    it.each([
        { name: 'null', data: null },
        { name: 'object in data', data: { data: {} } },
        { name: 'provider error', data: { data: [], status: { error_code: 1001 } } },
    ])('rejects $name without retry', async ({ data }) => {
        const adapter = jest.fn().mockResolvedValue(httpResponse(data));

        await expect(fetchQuotes(createClient(adapter))).rejects.toMatchObject({
            code: 'UPSTREAM_INVALID_RESPONSE',
        });

        expect(adapter).toHaveBeenCalledTimes(1);
    });
});
