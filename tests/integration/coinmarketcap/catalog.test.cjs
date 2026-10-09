const { createClient, httpResponse, config } = require('../../support/coinmarketcap.cjs');

describe('CoinMarketCap map endpoint', () => {
    const bitcoin = { id: 1, symbol: 'BTC', name: 'Bitcoin', slug: 'bitcoin', is_active: 1 };

    it('uses the official map endpoint and parses active and inactive assets', async () => {
        const adapter = jest.fn().mockResolvedValue(
            httpResponse({
                data: [{ ...bitcoin, id: 2, is_active: 0 }, bitcoin],
                status: { error_code: 0 },
            }),
        );

        const rows = await createClient(adapter).findBySymbol('BTC', new AbortController().signal);

        expect(rows.map((row) => row.cmcId)).toEqual([1, 2]);
        expect(rows.map((row) => row.isActive)).toEqual([true, false]);
        const request = adapter.mock.calls[0][0];
        expect(request.url).toBe('/v1/cryptocurrency/map');
        expect(request.params).toEqual({ symbol: 'BTC', aux: 'is_active' });
        expect(request.headers.get('X-CMC_PRO_API_KEY')).toBe(config.cmcApiKey);
    });

    it('returns an empty list when no symbol matches', async () => {
        const client = createClient(async () => httpResponse({ data: [] }));

        expect(await client.findBySymbol('UNKNOWN', new AbortController().signal)).toEqual([]);
    });

    it.each([
        { name: 'missing data', response: {} },
        { name: 'malformed entry', response: { data: [{ ...bitcoin, id: '1' }] } },
        { name: 'provider error', response: { data: [], status: { error_code: 1001 } } },
    ])('rejects $name', async ({ response }) => {
        const client = createClient(async () => httpResponse(response));

        await expect(
            client.findBySymbol('BTC', new AbortController().signal),
        ).rejects.toMatchObject({ code: 'UPSTREAM_INVALID_RESPONSE' });
    });
});
