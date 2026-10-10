import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

const base64url = /^[A-Za-z0-9_-]+$/;

export const tokenHash = (token: string) => createHash('sha256').update(token).digest('hex');

export const refreshToken = () => randomBytes(32).toString('base64url');

export function equalSecrets(a: string, b: string): boolean {
    return timingSafeEqual(
        createHash('sha256').update(a).digest(),
        createHash('sha256').update(b).digest(),
    );
}

export function jsonPart(value: unknown): string {
    return Buffer.from(JSON.stringify(value)).toString('base64url');
}

export function decodePart(value: string): Record<string, unknown> {
    if (!base64url.test(value)) {
        throw new Error('encoding');
    }
    const bytes = Buffer.from(value, 'base64url');
    if (bytes.toString('base64url') !== value) {
        throw new Error('encoding');
    }
    const parsed: unknown = JSON.parse(bytes.toString('utf8'));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error('object');
    }
    return parsed as Record<string, unknown>;
}
