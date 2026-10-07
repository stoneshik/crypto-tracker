import { invalid } from './errors';

export function object(
    value: unknown,
    allowed: string[],
    location = 'body',
): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw invalid(location, location, 'Ожидается объект');
    }
    const result = value as Record<string, unknown>;
    const extra = Object.keys(result).find((key) => !allowed.includes(key));
    if (extra) {
        throw invalid(extra, location, 'Неизвестное поле', 400);
    }
    return result;
}

export function scalar(value: unknown, name: string, location = 'query'): string {
    if (typeof value !== 'string') {
        throw invalid(name, location, 'Ожидается строка', 400);
    }
    return value;
}

export function positiveInteger(
    value: unknown,
    name: string,
    location = 'query',
    maximum = Number.MAX_SAFE_INTEGER,
): number {
    const raw = scalar(value, name, location);
    const result = Number(raw);
    if (!/^[1-9]\d*$/.test(raw) || !Number.isSafeInteger(result) || result > maximum) {
        throw invalid(name, location, 'Недопустимое целое число', 400);
    }
    return result;
}

export function credentials(
    value: unknown,
    registration: boolean,
): { email: string; password: string } {
    const input = object(value, ['email', 'password']);
    if (typeof input.email !== 'string') {
        throw invalid('email', 'body', 'Укажите email');
    }
    const email = input.email.trim().toLowerCase();
    if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        throw invalid('email', 'body', 'Некорректный email');
    }
    if (
        typeof input.password !== 'string' ||
        input.password.length < (registration ? 12 : 1) ||
        input.password.length > 128
    ) {
        throw invalid(
            'password',
            'body',
            registration ? 'От 12 до 128 символов' : 'От 1 до 128 символов',
        );
    }
    return { email, password: input.password };
}

export function dateTime(value: unknown, name: string, location = 'query'): number {
    const raw = scalar(value, name, location);
    const parts =
        /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,3})?(Z|([+-])(\d{2}):(\d{2}))$/.exec(
            raw,
        );
    if (!parts) {
        throw invalid(name, location, 'Нужен RFC 3339 с часовым поясом', 400);
    }
    const year = Number(parts[1]),
        month = Number(parts[2]),
        day = Number(parts[3]);
    const valid =
        year >= 1970 &&
        month >= 1 &&
        month <= 12 &&
        day >= 1 &&
        day <= new Date(Date.UTC(year, month, 0)).getUTCDate() &&
        Number(parts[4]) < 24 &&
        Number(parts[5]) < 60 &&
        Number(parts[6]) < 60 &&
        (!parts[8] || (Number(parts[9]) < 24 && Number(parts[10]) < 60));
    const result = Date.parse(raw);
    if (!valid || !Number.isFinite(result) || result < 0) {
        throw invalid(name, location, 'Некорректная дата', 400);
    }
    return result;
}

export function period(query: Record<string, unknown>): { from: number; to: number } {
    const from = dateTime(query.from, 'from');
    const to = dateTime(query.to, 'to');
    if (from >= to) {
        throw invalid('to', 'query', 'Конец должен быть позже начала');
    }
    if (to - from > 366 * 86400000) {
        throw invalid('to', 'query', 'Максимальный период — 366 суток');
    }
    return { from, to };
}

export function ids(value: unknown): number[] | undefined {
    if (value === undefined) {
        return undefined;
    }
    const raw = scalar(value, 'cryptocurrencyIds');
    const entries = raw.split(',');
    if (entries.length > 100) {
        throw invalid('cryptocurrencyIds', 'query', 'Максимум 100 ID', 400);
    }
    const result = entries.map((v) => positiveInteger(v, 'cryptocurrencyIds'));
    if (new Set(result).size !== result.length) {
        throw invalid('cryptocurrencyIds', 'query', 'Повторяющиеся ID', 400);
    }
    return result.sort((a, b) => a - b);
}
