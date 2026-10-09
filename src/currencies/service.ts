import type { Config } from '../config/types';
import { ApiError,invalid } from '../errors';
import { toApiUpstreamError } from '../integrations/coinmarketcap/errors';
import type { CatalogProvider,QuoteProvider } from '../integrations/coinmarketcap/types';
import { CursorCodec } from '../prices/cursor';
import { SettingsRepository } from '../settings/repository';
import { parseRetention } from '../settings/validation';
import { object,positiveInteger,scalar } from '../validation';
import { toCurrency } from './mappers';
import { CurrencyRepository } from './repository';
import { parseCurrencyCreate,parseCurrencyUpdate,parseSelection } from './validation';

export class CurrencyService {
    constructor(
        private readonly repository: CurrencyRepository,
        private readonly settings: SettingsRepository,
        private readonly cursors: CursorCodec,
        private readonly provider: QuoteProvider,
        private readonly catalogProvider: CatalogProvider,
        private readonly config: Config,
        private readonly signal: AbortSignal,
        private readonly clock: () => number = Date.now,
    ) {}

    get(id: number) {
        return toCurrency(this.repository.get(id), this.settings.get().retention_days);
    }

    list(input: unknown) {
        const query = object(input, ['limit', 'cursor', 'trackingEnabled'], 'query');
        let enabled: boolean | undefined;
        if (query.trackingEnabled !== undefined) {
            if (query.trackingEnabled !== 'true' && query.trackingEnabled !== 'false') {
                throw invalid('trackingEnabled', 'query', 'Допустимы true и false', 400);
            }
            enabled = query.trackingEnabled === 'true';
        }
        const limit =
            query.limit === undefined ? 50 : positiveInteger(query.limit, 'limit', 'query', 100);
        const filter = JSON.stringify({ enabled });
        const cursor = this.cursors.decodeCursor(query.cursor, 'currencies', filter);
        const snapshotId = cursor?.snapshotId ?? this.repository.maxId();
        const rows = this.repository.list(cursor?.afterId ?? 0, snapshotId, limit + 1, enabled);
        const hasMore = rows.length > limit;
        const data = rows.slice(0, limit);
        const defaultRetentionDays = this.settings.get().retention_days;
        return {
            data: data.map((row) => toCurrency(row, defaultRetentionDays)),
            page: {
                hasMore,
                nextCursor: hasMore
                    ? this.cursors.encodeCursor({
                          v: 1,
                          kind: 'currencies',
                          filter,
                          snapshotId,
                          afterId: data.at(-1)!.id,
                      })
                    : null,
            },
        };
    }

    async catalog(input: unknown) {
        const query = object(input, ['symbol'], 'query');
        const symbol = scalar(query.symbol, 'symbol').toUpperCase();
        if (!/^[A-Z0-9$@._-]{1,32}$/.test(symbol)) {
            throw invalid('symbol', 'query', 'Некорректный символ', 400);
        }
        this.requireProvider();
        try {
            return { data: await this.catalogProvider.findBySymbol(symbol, this.signal) };
        } catch (error) {
            throw toApiUpstreamError(error);
        }
    }

    async create(value: unknown) {
        const input = parseCurrencyCreate(value, this.config.pollIntervalSeconds);
        if (this.repository.findByCmcId(input.cmcId)) {
            throw new ApiError(409, 'CRYPTOCURRENCY_EXISTS', 'Валюта уже отслеживается');
        }
        this.requireProvider();
        let result;
        try {
            result = await this.provider.fetchQuotes([input.cmcId], this.signal);
        } catch (error) {
            throw toApiUpstreamError(error);
        }
        const quote = result.quotes.find((item) => item.cmcId === input.cmcId);
        if (!quote) {
            const error = result.errors.get(input.cmcId);
            if (!error || error.code === 'QUOTE_MISSING') {
                throw invalid('cmcId', 'body', 'Актив не поддерживается CoinMarketCap');
            }
            throw toApiUpstreamError(error);
        }
        const row = this.repository.create(input, quote, this.clock());
        return toCurrency(row, this.settings.get().retention_days);
    }

    update(id: number, input: unknown) {
        const row = this.repository.update(id, parseCurrencyUpdate(input), this.clock());
        return toCurrency(row, this.settings.get().retention_days);
    }

    updateRetention(input: unknown) {
        const body = object(input, ['selection', 'changes']);
        const changes = object(body.changes, ['retentionPolicy']);
        const now = this.clock();
        const updatedCount = this.repository.updateRetention(
            parseSelection(body.selection),
            parseRetention(changes.retentionPolicy),
            now,
        );
        return { updatedCount, updatedAt: new Date(now).toISOString() };
    }

    delete(id: number): void {
        this.repository.delete(id);
    }

    private requireProvider(): void {
        if (!this.config.cmcApiKey) {
            throw new ApiError(503, 'PROVIDER_NOT_CONFIGURED', 'Укажите CMC_API_KEY на сервере');
        }
    }
}
