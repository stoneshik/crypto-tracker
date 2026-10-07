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

import { resolve } from 'node:path';
import type { Config,TrackedCurrency } from './types';

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
    const { text, number, flag, validatedOrigin } = readEnvironment(env);
    const environment = text('NODE_ENV', 'development');
    if (!['development', 'test', 'production'].includes(environment)) {
        throw new Error('NODE_ENV: неизвестное окружение');
    }
    const port = number('PORT', 3000, 1, 65535);
    const apiOrigin = validatedOrigin('API_ORIGIN', `http://localhost:${port}`);
    const frontendOrigin = validatedOrigin('FRONTEND_ORIGIN', apiOrigin);
    const cookieSecure = flag('COOKIE_SECURE', environment === 'production');
    if (
        environment === 'production' &&
        (!cookieSecure || !frontendOrigin.startsWith('https:') || !apiOrigin.startsWith('https:'))
    ) {
        throw new Error(
            'В production нужны COOKIE_SECURE=true и HTTPS в API_ORIGIN и FRONTEND_ORIGIN',
        );
    }
    const jwtSecret = text('JWT_SECRET');
    if (Buffer.byteLength(jwtSecret) < 32 || jwtSecret.length > 1024) {
        throw new Error(
            'JWT_SECRET: задайте случайный секрет длиной не менее 32 байт (npm run setup)',
        );
    }
    const serviceApiKey = text('SERVICE_API_KEY');
    if (serviceApiKey && !/^ctk_[A-Za-z0-9_-]{32,128}$/.test(serviceApiKey)) {
        throw new Error(
            'SERVICE_API_KEY: ожидается ctk_ и случайный секрет длиной не менее 32 символов',
        );
    }
    const cmcApiKey = text('CMC_API_KEY');
    if (cmcApiKey && (!/^[\x21-\x7e]+$/.test(cmcApiKey) || cmcApiKey.length > 512)) {
        throw new Error('CMC_API_KEY: некорректный формат');
    }
    const syncEnabled = flag('SYNC_ENABLED', true);
    if (syncEnabled && !cmcApiKey) {
        throw new Error('Укажите CMC_API_KEY или установите SYNC_ENABLED=false');
    }
    const logLevel = text('LOG_LEVEL', 'info');
    if (!['info', 'error', 'silent'].includes(logLevel)) {
        throw new Error('LOG_LEVEL: допустимы info, error, silent');
    }
    let seeds: unknown;
    try {
        seeds = JSON.parse(
            text(
                'TRACKED_CURRENCIES',
                '[{"cmcId":1,"symbol":"BTC","name":"Bitcoin"},{"cmcId":1027,"symbol":"ETH","name":"Ethereum"},{"cmcId":5426,"symbol":"SOL","name":"Solana"}]',
            ),
        );
    } catch {
        throw new Error('TRACKED_CURRENCIES: требуется JSON-массив');
    }
    if (!Array.isArray(seeds) || seeds.length > 100) {
        throw new Error('TRACKED_CURRENCIES: максимум 100 валют');
    }
    const seen = new Set<number>();
    const trackedCurrencies = seeds.map((value: unknown): TrackedCurrency => {
        if (value === null || typeof value !== 'object' || Array.isArray(value)) {
            throw new Error('TRACKED_CURRENCIES: некорректная запись');
        }
        const item = value as Record<string, unknown>;
        const { cmcId, symbol, name } = item;
        if (
            Object.keys(item).some((key) => !['cmcId', 'symbol', 'name'].includes(key)) ||
            typeof cmcId !== 'number' ||
            !Number.isSafeInteger(cmcId) ||
            cmcId < 1 ||
            seen.has(cmcId) ||
            typeof symbol !== 'string' ||
            !symbol.trim() ||
            symbol.length > 64 ||
            typeof name !== 'string' ||
            !name.trim() ||
            name.length > 200
        ) {
            throw new Error(
                'TRACKED_CURRENCIES: проверьте cmcId, symbol, name и отсутствие дубликатов',
            );
        }
        seen.add(cmcId);
        return { cmcId, symbol: symbol.trim(), name: name.trim() };
    });
    const databasePath = text('DB_PATH', './data/crypto.db');
    if (!databasePath || databasePath === ':memory:' || databasePath.startsWith('file:')) {
        throw new Error('DB_PATH: нужен путь к файлу SQLite');
    }
    const host = text('HOST', '0.0.0.0');
    if (!host || host.length > 253 || /\s/.test(host)) {
        throw new Error('HOST: некорректный адрес');
    }
    const accessTokenTtlSeconds = number('ACCESS_TOKEN_TTL_SECONDS', 900, 60, 3600);
    const refreshTokenTtlSeconds = number('REFRESH_TOKEN_TTL_SECONDS', 604800, 3600, 2592000);
    if (refreshTokenTtlSeconds <= accessTokenTtlSeconds) {
        throw new Error('REFRESH_TOKEN_TTL_SECONDS должен быть больше ACCESS_TOKEN_TTL_SECONDS');
    }
    const jwtIssuer = text('JWT_ISSUER', 'crypto-tracker');
    const jwtAudience = text('JWT_AUDIENCE', 'crypto-tracker-api');
    if (!jwtIssuer || !jwtAudience || jwtIssuer.length > 200 || jwtAudience.length > 200) {
        throw new Error('JWT_ISSUER и JWT_AUDIENCE: от 1 до 200 символов');
    }
    return {
        environment: environment as Config['environment'],
        host,
        port,
        databasePath: resolve(databasePath),
        sqliteBusyTimeoutMs: number('SQLITE_BUSY_TIMEOUT_MS', 5000, 0, 10000),
        apiOrigin,
        frontendOrigin,
        trustProxyHops: number('TRUST_PROXY_HOPS', 0, 0, 10),
        logLevel: logLevel as Config['logLevel'],
        bodyLimitBytes: number('BODY_LIMIT_BYTES', 16384, 1024, 1048576),
        shutdownTimeoutMs: number('SHUTDOWN_TIMEOUT_MS', 15000, 1000, 60000),
        jwtSecret,
        jwtIssuer,
        jwtAudience,
        accessTokenTtlSeconds,
        refreshTokenTtlSeconds,
        cookieSecure,
        serviceApiKey,
        authRateLimitMax: number('AUTH_RATE_LIMIT_MAX', 30, 1, 10000),
        authRateLimitWindowSeconds: number('AUTH_RATE_LIMIT_WINDOW_SECONDS', 900, 1, 86400),
        cmcApiKey,
        cmcTimeoutMs: number('CMC_TIMEOUT_MS', 10000, 100, 60000),
        cmcMaxRetries: number('CMC_MAX_RETRIES', 2, 0, 5),
        cmcRetryDelayMs: number('CMC_RETRY_DELAY_MS', 500, 1, 10000),
        cmcRateLimitCooldownSeconds: number('CMC_RATE_LIMIT_COOLDOWN_SECONDS', 60, 1, 86400),
        syncEnabled,
        pollIntervalSeconds: number('POLL_INTERVAL_SECONDS', 300, 60, 86400),
        syncTickMs: number('SYNC_TICK_MS', 5000, 100, 60000),
        syncErrorBackoffSeconds: number('SYNC_ERROR_BACKOFF_SECONDS', 60, 1, 3600),
        defaultRetentionDays:
            text('DEFAULT_RETENTION_DAYS', '30') === 'forever'
                ? null
                : number('DEFAULT_RETENTION_DAYS', 30, 1, 3650),
        cleanupIntervalSeconds: number('CLEANUP_INTERVAL_SECONDS', 3600, 1, 86400),
        cleanupBatchSize: number('CLEANUP_BATCH_SIZE', 1000, 1, 10000),
        trackedCurrencies,
    };
}
