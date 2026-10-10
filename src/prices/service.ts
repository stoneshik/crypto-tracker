import { CurrencyRepository } from '../currencies/repository';
import { invalid } from '../errors';
import { CursorCodec } from './cursor';
import { iso, toObservation, toLatestQuote } from './mappers';
import { ids, object, period, positiveInteger } from '../validation';
import { PriceRepository } from './repository';

export class PriceService {
    constructor(
        private readonly repository: PriceRepository,
        private readonly currencies: CurrencyRepository,
        private readonly cursors: CursorCodec,
        private readonly clock: () => number = Date.now,
    ) {}

    latest(id: number) {
        this.currencies.get(id);
        return toLatestQuote(
            this.repository.latest(0, Number.MAX_SAFE_INTEGER, 1, [id])[0]!,
            this.clock(),
        );
    }

    listLatest(input: unknown) {
        const query = object(input, ['limit', 'cursor', 'cryptocurrencyIds'], 'query');
        const selected = ids(query.cryptocurrencyIds);
        if (selected) {
            selected.forEach((id) => this.currencies.get(id));
        }
        const limit =
            query.limit === undefined ? 50 : positiveInteger(query.limit, 'limit', 'query', 100);
        const filter = JSON.stringify({ ids: selected });
        const cursor = this.cursors.decodeCursor(query.cursor, 'latest', filter);
        const snapshotId = cursor?.snapshotId ?? this.currencies.maxId();
        const rows = this.repository.latest(cursor?.afterId ?? 0, snapshotId, limit + 1, selected);
        const data = rows.slice(0, limit);
        const hasMore = rows.length > limit;
        return {
            data: data.map((row) => toLatestQuote(row, this.clock())),
            page: {
                hasMore,
                nextCursor: hasMore
                    ? this.cursors.encodeCursor({
                          v: 1,
                          kind: 'latest',
                          filter,
                          snapshotId,
                          afterId: data.at(-1)!.id,
                      })
                    : null,
            },
        };
    }

    history(id: number, input: unknown) {
        this.currencies.get(id);
        const query = object(input, ['from', 'to', 'limit', 'cursor'], 'query');
        const { from, to } = period(query);
        const limit =
            query.limit === undefined ? 500 : positiveInteger(query.limit, 'limit', 'query', 1000);
        const filter = JSON.stringify({ id, from, to });
        const cursor = this.cursors.decodeCursor(query.cursor, 'history', filter);
        const snapshotId = cursor?.snapshotId ?? this.repository.maxHistoryId();
        const rows = this.repository.history(
            id,
            from,
            to,
            snapshotId,
            cursor?.afterTime ?? 0,
            cursor?.afterId ?? 0,
            limit + 1,
        );
        const data = rows.slice(0, limit);
        const last = data.at(-1);
        const hasMore = rows.length > limit;
        return {
            data: data.map(toObservation),
            page: {
                hasMore,
                nextCursor: hasMore
                    ? this.cursors.encodeCursor({
                          v: 1,
                          kind: 'history',
                          filter,
                          snapshotId,
                          afterTime: last!.received_at,
                          afterId: last!.id,
                      })
                    : null,
            },
        };
    }

    aggregates(id: number, input: unknown) {
        this.currencies.get(id);
        const query = object(input, ['from', 'to', 'intervalSeconds'], 'query');
        const { from, to } = period(query);
        const intervalSeconds = positiveInteger(query.intervalSeconds, 'intervalSeconds');
        if (![60, 300, 900, 3600, 86400].includes(intervalSeconds)) {
            throw invalid('intervalSeconds', 'query', 'Допустимы 60, 300, 900, 3600, 86400');
        }
        const intervalMs = intervalSeconds * 1000;
        const count = Math.ceil(to / intervalMs) - Math.floor(from / intervalMs);
        if (count > 2000) {
            throw invalid('intervalSeconds', 'query', 'Увеличьте интервал: максимум 2000 корзин');
        }
        const rows = this.repository.aggregates(id, from, to, intervalMs);
        return {
            cryptocurrencyId: id,
            quoteCurrency: 'USD',
            from: iso(from),
            to: iso(to),
            intervalSeconds,
            data: rows.map(({ bucket, ...values }) => ({
                bucketStart: iso(bucket!),
                bucketEnd: iso(bucket! + intervalMs),
                ...values,
            })),
        };
    }
}
