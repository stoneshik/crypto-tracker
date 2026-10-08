import { createHmac,randomUUID,timingSafeEqual } from 'node:crypto';
import type { Config } from '../config/types';
import { unauthorized } from '../errors';
import { decodePart,jsonPart } from '../shared/crypto';
import type { AccessClaims } from './types';

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const base64url = /^[A-Za-z0-9_-]+$/;

export class JwtTokens {
    constructor(private readonly config: Config) {}

    issue(
        userId: string,
        sessionId: string,
        now: number,
        sessionExpiresAt: number,
    ): { token: string; expiresIn: number } {
        const iat = Math.floor(now / 1000);
        const exp = Math.min(
            iat + this.config.accessTokenTtlSeconds,
            Math.floor(sessionExpiresAt / 1000),
        );
        if (exp <= iat) {
            throw unauthorized();
        }
        const payload: AccessClaims = {
            sub: userId,
            sid: sessionId,
            jti: randomUUID(),
            iss: this.config.jwtIssuer,
            aud: this.config.jwtAudience,
            iat,
            exp,
        };
        const unsigned = `${jsonPart({ alg: 'HS256', typ: 'JWT' })}.${jsonPart(payload)}`;
        const signature = createHmac('sha256', this.config.jwtSecret)
            .update(unsigned)
            .digest('base64url');
        return { token: `${unsigned}.${signature}`, expiresIn: exp - iat };
    }

    verify(token: string, now: number): AccessClaims {
        try {
            if (token.length > 4096) {
                throw new Error('length');
            }
            const parts = token.split('.');
            if (
                parts.length !== 3 ||
                !parts[0] ||
                !parts[1] ||
                !parts[2] ||
                !base64url.test(parts[2])
            ) {
                throw new Error('format');
            }
            const [headerPart, payloadPart, signaturePart] = parts as [string, string, string];
            const signature = Buffer.from(signaturePart, 'base64url');
            const expected = createHmac('sha256', this.config.jwtSecret)
                .update(`${headerPart}.${payloadPart}`)
                .digest();
            if (
                signature.length !== 32 ||
                signature.toString('base64url') !== signaturePart ||
                !timingSafeEqual(signature, expected)
            ) {
                throw new Error('signature');
            }
            const header = decodePart(headerPart);
            if (
                header.alg !== 'HS256' ||
                header.typ !== 'JWT' ||
                Object.keys(header).some((key) => !['alg', 'typ'].includes(key))
            ) {
                throw new Error('header');
            }
            const body = decodePart(payloadPart);
            const nowSeconds = Math.floor(now / 1000);
            if (
                body.iss !== this.config.jwtIssuer ||
                body.aud !== this.config.jwtAudience ||
                !['sub', 'sid', 'jti'].every(
                    (key) => typeof body[key] === 'string' && uuidPattern.test(body[key] as string),
                ) ||
                !Number.isSafeInteger(body.iat) ||
                !Number.isSafeInteger(body.exp) ||
                (body.iat as number) > nowSeconds + 30 ||
                (body.exp as number) <= nowSeconds ||
                (body.exp as number) <= (body.iat as number) ||
                (body.exp as number) - (body.iat as number) > this.config.accessTokenTtlSeconds ||
                (body.nbf !== undefined &&
                    (!Number.isSafeInteger(body.nbf) || (body.nbf as number) > nowSeconds))
            ) {
                throw new Error('claims');
            }
            return body as unknown as AccessClaims;
        } catch {
            throw unauthorized();
        }
    }
}
