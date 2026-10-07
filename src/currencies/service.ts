import { invalid } from '../errors';
import { CursorCodec } from '../prices/cursor';
import { SettingsRepository } from '../settings/repository';
import { object,positiveInteger } from '../validation';
import { toCurrency } from './mappers';
import { CurrencyRepository } from './repository';

export class CurrencyService {

    constructor(
        private readonly repository: CurrencyRepository,
        private readonly settings: SettingsRepository,
        private readonly cursors: CursorCodec,
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
}
