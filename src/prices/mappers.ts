import type { HistoryRow,LatestRow } from './types';

export const iso = (value: number | null) =>
    value === null ? null : new Date(value).toISOString();

export const toObservation = (row: HistoryRow) => ({
    id: row.id,
    cryptocurrencyId: row.cryptocurrency_id,
    quoteCurrency: 'USD',
    price: row.price,
    receivedAt: iso(row.received_at),
    sourceUpdatedAt: iso(row.source_updated_at),
});

export function toLatestQuote(row: LatestRow, now: number) {
    const base = { cryptocurrencyId: row.id, quoteCurrency: 'USD' };
    if (row.price === null || row.received_at === null || row.source_updated_at === null) {
        return { ...base, status: 'pending' };
    }
    const maxAge = row.polling_interval_seconds * 2000;
    const stale = now - row.received_at > maxAge || now - row.source_updated_at > maxAge;
    return {
        ...base,
        status: stale ? 'stale' : 'fresh',
        price: row.price,
        receivedAt: iso(row.received_at),
        sourceUpdatedAt: iso(row.source_updated_at),
    };
}
