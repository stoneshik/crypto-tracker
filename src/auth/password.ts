import { randomBytes,scrypt,timingSafeEqual } from 'node:crypto';

const derive = (password: string, salt: string) =>
    new Promise<Buffer>((resolve, reject) => {
        scrypt(
            password,
            Buffer.from(salt, 'hex'),
            64,
            { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 },
            (error, key) => (error ? reject(error) : resolve(key)),
        );
    });

export async function hashPassword(password: string): Promise<{ hash: string; salt: string }> {
    const salt = randomBytes(16).toString('hex');
    return { hash: (await derive(password, salt)).toString('hex'), salt };
}

export async function verifyPassword(
    password: string,
    hash = '0'.repeat(128),
    salt = '0'.repeat(32),
): Promise<boolean> {
    const expected = Buffer.from(hash, 'hex');
    const actual = await derive(password, salt);
    return expected.length === actual.length && timingSafeEqual(actual, expected);
}
