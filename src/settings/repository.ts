import type { DatabaseSync } from 'node:sqlite';
import type { DefaultRetentionPolicy,SettingsRow } from './types';

export class SettingsRepository {
    constructor(private readonly db: DatabaseSync) {}

    initialize(days: number | null, now: number): void {
        this.db
            .prepare(
                'INSERT OR IGNORE INTO settings (id, retention_days, updated_at) VALUES (1, ?, ?)',
            )
            .run(days, now);
    }

    get(): SettingsRow {
        return this.db
            .prepare('SELECT * FROM settings WHERE id = 1')
            .get() as unknown as SettingsRow;
    }

    update(policy: DefaultRetentionPolicy, now: number): void {
        this.db
            .prepare('UPDATE settings SET retention_days = ?, updated_at = ? WHERE id = 1')
            .run(policy.mode === 'days' ? policy.days : null, now);
    }
}
