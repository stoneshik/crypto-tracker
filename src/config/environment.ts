export function readEnvironment(env: NodeJS.ProcessEnv) {
    const text = (key: string, fallback = '') => (env[key] ?? fallback).trim();
    const number = (key: string, fallback: number, min: number, max: number) => {
        const raw = text(key, String(fallback));
        const value = Number(raw);
        if (!/^\d+$/.test(raw) || !Number.isSafeInteger(value) || value < min || value > max) {
            throw new Error(`${key}: требуется целое число от ${min} до ${max}`);
        }
        return value;
    };
    const flag = (key: string, fallback: boolean) => {
        const value = text(key, String(fallback));
        if (value !== 'true' && value !== 'false') {
            throw new Error(`${key}: ожидается true или false`);
        }
        return value === 'true';
    };
    const validatedOrigin = (key: string, fallback: string) => {
        const value = text(key, fallback);
        let url: URL;
        try {
            url = new URL(value);
        } catch {
            throw new Error(`${key}: некорректный URL`);
        }
        if (!['http:', 'https:'].includes(url.protocol) || url.origin !== value) {
            throw new Error(`${key}: требуется origin без пути, query и завершающего /`);
        }
        return value;
    };

    return { text, number, flag, validatedOrigin };
}
