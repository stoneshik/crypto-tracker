const { createTestContext } = require('../../support/test-context.cjs');
const { bearer, registerAndLogin } = require('../../support/users.cjs');

describe('API access', () => {
    let context;

    beforeEach(() => {
        context = createTestContext();
    });

    afterEach(async () => {
        await context.dispose();
    });

    it.each([
        '/cryptocurrencies',
        '/cryptocurrencies/1',
        '/prices/latest',
        '/cryptocurrencies/1/prices/latest',
        '/cryptocurrencies/1/price-history',
        '/cryptocurrencies/1/price-aggregates',
    ])('requires authorization for GET %s', async (path) => {
        await context.http.get(`/api/v1${path}`).expect(401);
    });

});
