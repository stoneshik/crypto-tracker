import { UpstreamError } from '../../errors';
import type { Quote } from '../../prices/types';
import { dateTime } from '../../validation';
import type { QuoteBatch } from './types';

const record = (value: unknown): value is Record<string, unknown> =>
    !!value && typeof value === 'object' && !Array.isArray(value);

export function parseQuotes(raw: unknown, ids: number[], now: number): QuoteBatch {
    // Документация v3 показывает как массив, так и стандартную оболочку data/status.
    const payload = record(raw) && 'data' in raw ? raw.data : raw;
    if (
        record(raw) &&
        record(raw.status) &&
        raw.status.error_code !== undefined &&
        raw.status.error_code !== 0
    ) {
        throw new UpstreamError(
            'UPSTREAM_INVALID_RESPONSE',
            'CoinMarketCap вернул ошибку в теле ответа',
        );
    }
    if (!Array.isArray(payload)) {
        throw new UpstreamError(
            'UPSTREAM_INVALID_RESPONSE',
            'Некорректная структура ответа CoinMarketCap',
        );
    }
    const quotes: Quote[] = [],
        errors = new Map<number, UpstreamError>();
    for (const id of ids) {
        const matches = payload.filter((value) => record(value) && value.id === id);
        if (matches.length === 0) {
            errors.set(
                id,
                new UpstreamError('QUOTE_MISSING', 'Котировка отсутствует в ответе CoinMarketCap'),
            );
            continue;
        }
        try {
            const item = matches[0] as Record<string, unknown>;
            if (
                matches.length !== 1 ||
                typeof item.symbol !== 'string' ||
                !item.symbol.trim() ||
                item.symbol.length > 64 ||
                typeof item.name !== 'string' ||
                !item.name.trim() ||
                item.name.length > 200 ||
                !Array.isArray(item.quote)
            ) {
                throw new Error('metadata');
            }
            const usdQuotes = item.quote.filter((value) => record(value) && value.symbol === 'USD');
            if (usdQuotes.length !== 1) {
                throw new Error('USD');
            }
            const usd = usdQuotes[0] as Record<string, unknown>;
            if (typeof usd.price !== 'number' || !Number.isFinite(usd.price) || usd.price < 0) {
                throw new Error('price');
            }
            const sourceUpdatedAt = dateTime(usd.last_updated, 'last_updated');
            if (sourceUpdatedAt > now + 60000) {
                throw new Error('future timestamp');
            }
            quotes.push({
                cmcId: id,
                symbol: item.symbol,
                name: item.name,
                price: usd.price,
                sourceUpdatedAt,
            });
        } catch {
            errors.set(
                id,
                new UpstreamError(
                    'UPSTREAM_INVALID_RESPONSE',
                    'Некорректная котировка CoinMarketCap',
                ),
            );
        }
    }
    return { quotes, errors };
}
