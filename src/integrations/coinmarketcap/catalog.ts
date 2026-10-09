import { UpstreamError } from '../../errors';
import type { CatalogCurrency } from './types';

export function parseCatalog(raw: unknown, symbol: string): CatalogCurrency[] {
    const envelope = raw as { data?: unknown; status?: { error_code?: unknown } } | null;
    if (
        !Array.isArray(envelope?.data) ||
        (envelope.status?.error_code !== undefined && envelope.status.error_code !== 0)
    ) {
        throw new UpstreamError('UPSTREAM_INVALID_RESPONSE', 'Некорректный каталог CoinMarketCap');
    }
    return envelope.data
        .map((value: unknown): CatalogCurrency => {
            const item = value as Record<string, unknown> | null;
            if (
                !item ||
                typeof item.id !== 'number' ||
                !Number.isSafeInteger(item.id) ||
                item.id < 1 ||
                typeof item.symbol !== 'string' ||
                !item.symbol.trim() ||
                item.symbol.length > 64 ||
                typeof item.name !== 'string' ||
                !item.name.trim() ||
                item.name.length > 200 ||
                typeof item.slug !== 'string' ||
                !item.slug.trim() ||
                item.slug.length > 200 ||
                (item.is_active !== 0 && item.is_active !== 1)
            ) {
                throw new UpstreamError(
                    'UPSTREAM_INVALID_RESPONSE',
                    'Некорректная запись каталога CoinMarketCap',
                );
            }
            return {
                cmcId: item.id,
                symbol: item.symbol,
                name: item.name,
                slug: item.slug,
                isActive: item.is_active === 1,
            };
        })
        .filter((item) => item.symbol.toUpperCase() === symbol)
        .sort((a, b) => a.cmcId - b.cmcId);
}
