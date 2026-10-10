import { object } from '../validation';
import { parseRetention } from './validation';
import { SettingsRepository } from './repository';

export class SettingsService {
    constructor(
        private readonly repository: SettingsRepository,
        private readonly clock: () => number = Date.now,
    ) {}

    get() {
        const row = this.repository.get();
        return {
            quoteCurrency: 'USD',
            defaultRetentionPolicy:
                row.retention_days === null
                    ? { mode: 'forever' }
                    : { mode: 'days', days: row.retention_days },
            updatedAt: new Date(row.updated_at).toISOString(),
        };
    }

    update(input: unknown) {
        const body = object(input, ['defaultRetentionPolicy']);
        this.repository.update(parseRetention(body.defaultRetentionPolicy, false), this.clock());
        return this.get();
    }
}
