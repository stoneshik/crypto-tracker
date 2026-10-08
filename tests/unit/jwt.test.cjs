const { createHmac, randomUUID } = require('node:crypto');
const { JwtTokens } = require('../../dist/auth/jwt');
const { testConfig } = require('../support/config.cjs');

const NOW = Date.parse('2026-10-08T12:00:00.000Z');

function sign(header, payload, secret) {
    const parts = [header, payload]
        .map((value) => Buffer.from(JSON.stringify(value)).toString('base64url'))
        .join('.');
    return `${parts}.${createHmac('sha256', secret).update(parts).digest('base64url')}`;
}

describe('JWT', () => {
    const config = testConfig();
    const tokens = new JwtTokens(config);
    const header = { alg: 'HS256', typ: 'JWT' };
    let claims;

    beforeEach(() => {
        claims = {
            sub: randomUUID(),
            sid: randomUUID(),
            jti: randomUUID(),
            iss: config.jwtIssuer,
            aud: config.jwtAudience,
            iat: NOW / 1000,
            exp: NOW / 1000 + 900,
        };
    });

    it('issues a token for the expected user and session', () => {
        const issued = tokens.issue(claims.sub, claims.sid, NOW, NOW + 3600000);

        const verified = tokens.verify(issued.token, NOW);

        expect(issued.expiresIn).toBe(900);
        expect(verified).toMatchObject({
            sub: claims.sub,
            sid: claims.sid,
            iss: config.jwtIssuer,
            aud: config.jwtAudience,
        });
    });

    it.each([
        { name: 'wrong signature', secret: 'another-secret' },
        { name: 'unsigned algorithm', header: { alg: 'none', typ: 'JWT' } },
        { name: 'wrong issuer', claims: { iss: 'wrong' } },
        { name: 'wrong audience', claims: { aud: 'wrong' } },
        { name: 'expired token', claims: { exp: NOW / 1000 - 1 } },
        { name: 'future issue time', claims: { iat: NOW / 1000 + 60 } },
    ])('rejects $name', (scenario) => {
        const token = sign(
            scenario.header ?? header,
            { ...claims, ...scenario.claims },
            scenario.secret ?? config.jwtSecret,
        );

        expect(() => tokens.verify(token, NOW)).toThrow(expect.objectContaining({ status: 401 }));
    });

    it('rejects a malformed token', () => {
        expect(() => tokens.verify('garbage', NOW)).toThrow(
            expect.objectContaining({ status: 401 }),
        );
    });
});
