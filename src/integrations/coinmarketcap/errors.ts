import axios from 'axios';
import type { Config } from '../../config/types';
import { ApiError,UpstreamError } from '../../errors';

export function toUpstreamError(error: unknown, config: Config, now: number): UpstreamError {
    if (error instanceof UpstreamError) {
        return error;
    }
    if (!axios.isAxiosError(error)) {
        return new UpstreamError(
            'UPSTREAM_INVALID_RESPONSE',
            'Не удалось разобрать ответ CoinMarketCap',
        );
    }
    const status = error.response?.status;
    if (status === 429) {
        const raw = error.response?.headers['retry-after'];
        let seconds = typeof raw === 'string' && /^\d+$/.test(raw) ? Number(raw) : NaN;
        if (!Number.isFinite(seconds) && typeof raw === 'string') {
            seconds = Math.ceil((Date.parse(raw) - now) / 1000);
        }
        if (!Number.isFinite(seconds) || seconds < 1) {
            seconds = config.cmcRateLimitCooldownSeconds;
        }
        return new UpstreamError(
            'UPSTREAM_RATE_LIMITED',
            'Превышен лимит CoinMarketCap',
            false,
            Math.min(seconds, 31 * 86400),
        );
    }
    if (status === 401 || status === 403) {
        return new UpstreamError(
            'UPSTREAM_AUTHENTICATION_FAILED',
            'CoinMarketCap отклонил серверный ключ',
            false,
            300,
        );
    }
    if (['ECONNABORTED', 'ETIMEDOUT', 'ERR_CANCELED'].includes(error.code ?? '')) {
        return new UpstreamError('UPSTREAM_TIMEOUT', 'Истёк таймаут CoinMarketCap', true);
    }
    if (!status || status >= 500) {
        return new UpstreamError('UPSTREAM_UNAVAILABLE', 'CoinMarketCap временно недоступен', true);
    }
    return new UpstreamError('UPSTREAM_INVALID_RESPONSE', 'CoinMarketCap вернул неожиданный ответ');
}

export function toApiUpstreamError(error: unknown): ApiError {
    if (!(error instanceof UpstreamError)) {
        return new ApiError(503, 'UPSTREAM_UNAVAILABLE', 'CoinMarketCap недоступен');
    }
    let status = 502;
    if (error.code === 'UPSTREAM_TIMEOUT') {
        status = 504;
    }
    if (
        [
            'UPSTREAM_UNAVAILABLE',
            'UPSTREAM_RATE_LIMITED',
            'UPSTREAM_AUTHENTICATION_FAILED',
        ].includes(error.code)
    ) {
        status = 503;
    }
    return new ApiError(
        status,
        error.code,
        error.message,
        undefined,
        error.retryAfterSeconds || undefined,
    );
}
