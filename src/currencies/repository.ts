import type { DatabaseSync, SQLInputValue } from 'node:sqlite';
import type { Config } from '../config/types';
import type { CurrencyRow, CurrencyCreate, CurrencyUpdate, CurrencySelection } from './types';
import type { RetentionPolicy } from '../settings/types';
import { transaction } from '../database';
import { ApiError, UpstreamError } from '../errors';

export class CurrencyRepository {
    constructor(private readonly db: DatabaseSync) {}

    initialize(config: Config, now: number): void {
        transaction(this.db, () => {
            const state = this.db.prepare('SELECT initialized FROM settings WHERE id = 1').get();
            if (state?.initialized) {
                return;
            }
            const count = Number(
                this.db.prepare('SELECT COUNT(*) AS count FROM cryptocurrencies').get()!.count,
            );
            if (count === 0) {
                for (const currency of config.trackedCurrencies) {
                    this.create(
                        {
                            ...currency,
                            trackingEnabled: true,
                            pollingIntervalSeconds: config.pollIntervalSeconds,
                            retentionPolicy: { mode: 'inherit' },
                        },
                        currency,
                        now,
                    );
                }
            }
            this.db.prepare('UPDATE settings SET initialized = 1 WHERE id = 1').run();
        });
        this.db.prepare('UPDATE cryptocurrencies SET syncing = 0').run();
    }

    find(id: number): CurrencyRow | undefined {
        return this.db.prepare('SELECT * FROM cryptocurrencies WHERE id = ?').get(id) as unknown as
            CurrencyRow | undefined;
    }

    get(id: number): CurrencyRow {
        const currency = this.find(id);
        if (!currency) {
            throw new ApiError(404, 'RESOURCE_NOT_FOUND', 'Валюта не найдена');
        }
        return currency;
    }

    findByCmcId(cmcId: number): CurrencyRow | undefined {
        return this.db
            .prepare('SELECT * FROM cryptocurrencies WHERE cmc_id = ?')
            .get(cmcId) as unknown as CurrencyRow | undefined;
    }

    maxId(): number {
        return Number(
            this.db.prepare('SELECT COALESCE(MAX(id), 0) AS id FROM cryptocurrencies').get()!.id,
        );
    }

    list(after: number, snapshot: number, limit: number, enabled?: boolean): CurrencyRow[] {
        const filter = enabled === undefined ? '' : ' AND tracking_enabled = ?';
        const args: SQLInputValue[] = [after, snapshot];
        if (enabled !== undefined) {
            args.push(enabled ? 1 : 0);
        }
        return this.db
            .prepare(
                `
                    SELECT * FROM cryptocurrencies
                    WHERE id > ? AND id <= ?${filter}
                    ORDER BY id LIMIT ?
                `,
            )
            .all(...args, limit) as unknown as CurrencyRow[];
    }

    select(selection: CurrencySelection): number[] {
        if (selection.scope === 'selected') {
            selection.cryptocurrencyIds.forEach((id) => this.get(id));
            return selection.cryptocurrencyIds;
        }
        return this.db
            .prepare('SELECT id FROM cryptocurrencies ORDER BY id')
            .all()
            .map((row) => Number(row.id));
    }

    create(
        input: CurrencyCreate,
        metadata: { symbol: string; name: string },
        now: number,
    ): CurrencyRow {
        if (this.findByCmcId(input.cmcId)) {
            throw new ApiError(409, 'CRYPTOCURRENCY_EXISTS', 'Валюта уже отслеживается');
        }
        const count = Number(
            this.db.prepare('SELECT COUNT(*) AS count FROM cryptocurrencies').get()!.count,
        );
        if (count >= 100) {
            throw new ApiError(422, 'CURRENCY_LIMIT_REACHED', 'Допускается до 100 валют');
        }
        return this.db
            .prepare(
                `
                    INSERT INTO cryptocurrencies (
                        cmc_id, symbol, name, tracking_enabled, polling_interval_seconds,
                        retention_mode, retention_days, created_at, updated_at, next_sync_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    RETURNING *
                `,
            )
            .get(
                input.cmcId,
                metadata.symbol,
                metadata.name,
                Number(input.trackingEnabled),
                input.pollingIntervalSeconds,
                input.retentionPolicy.mode,
                input.retentionPolicy.mode === 'days' ? input.retentionPolicy.days : null,
                now,
                now,
                input.trackingEnabled ? now : null,
            ) as unknown as CurrencyRow;
    }

    update(id: number, changes: CurrencyUpdate, now: number): CurrencyRow {
        const row = this.get(id);
        const enabled = changes.trackingEnabled ?? Boolean(row.tracking_enabled);
        const interval = changes.pollingIntervalSeconds ?? row.polling_interval_seconds;
        const mode = changes.retentionPolicy?.mode ?? row.retention_mode;
        let days = row.retention_days;
        if (changes.retentionPolicy) {
            days = changes.retentionPolicy.mode === 'days' ? changes.retentionPolicy.days : null;
        }
        let next = row.next_sync_at;
        if (!enabled) {
            next = null;
        } else if (!row.tracking_enabled) {
            next = now;
        } else if (interval !== row.polling_interval_seconds) {
            next =
                row.last_successful_sync_at === null
                    ? now
                    : Math.max(now, row.last_successful_sync_at + interval * 1000);
            if (row.last_error_code) {
                next = Math.max(next, row.next_sync_at ?? now);
            }
        }
        return this.db
            .prepare(
                `
                    UPDATE cryptocurrencies SET tracking_enabled = ?, polling_interval_seconds = ?,
                        retention_mode = ?, retention_days = ?, next_sync_at = ?, updated_at = ?
                    WHERE id = ?
                    RETURNING *
                `,
            )
            .get(Number(enabled), interval, mode, days, next, now, id) as unknown as CurrencyRow;
    }

    updateRetention(selection: CurrencySelection, policy: RetentionPolicy, now: number): number {
        return transaction(this.db, () => {
            const ids = this.select(selection);
            if (!ids.length) {
                return 0;
            }
            const result = this.db
                .prepare(
                    `
                        UPDATE cryptocurrencies SET retention_mode = ?, retention_days = ?, updated_at = ?
                        WHERE id IN (${ids.map(() => '?').join(',')})
                    `,
                )
                .run(policy.mode, policy.mode === 'days' ? policy.days : null, now, ...ids);
            return Number(result.changes);
        });
    }

    delete(id: number): void {
        this.get(id);
        const active = this.db
            .prepare(
                `
                    SELECT 1 FROM operation_items i JOIN operations o ON o.id = i.operation_id
                    WHERE i.cryptocurrency_id = ? AND o.kind = 'synchronization' AND o.status IN ('queued', 'running')
                `,
            )
            .get(id);
        if (active) {
            throw new ApiError(409, 'OPERATION_CONFLICT', 'Для валюты выполняется синхронизация');
        }
        this.db.prepare('DELETE FROM cryptocurrencies WHERE id = ?').run(id);
    }

    due(now: number): CurrencyRow[] {
        return this.db
            .prepare(
                `
                    SELECT * FROM cryptocurrencies
                    WHERE tracking_enabled = 1 AND next_sync_at <= ? ORDER BY id LIMIT 100
                `,
            )
            .all(now) as unknown as CurrencyRow[];
    }

    markStarted(rows: CurrencyRow[], now: number): void {
        transaction(this.db, () => {
            const statement = this.db.prepare(
                'UPDATE cryptocurrencies SET syncing = 1, last_attempt_at = ? WHERE id = ?',
            );
            for (const row of rows) {
                statement.run(now, row.id);
            }
        });
    }

    fail(id: number, error: UpstreamError, now: number, backoffSeconds: number): void {
        const row = this.find(id);
        if (!row) {
            return;
        }
        const delay = Math.max(
            error.retryAfterSeconds,
            Math.min(3600, backoffSeconds * 2 ** Math.min(row.failure_count, 10)),
        );
        this.db
            .prepare(
                `
                    UPDATE cryptocurrencies SET syncing = 0, failure_count = failure_count + 1,
                        next_sync_at = ?, last_error_code = ?, last_error_message = ?, last_error_at = ? WHERE id = ?
                `,
            )
            .run(
                row.tracking_enabled ? now + delay * 1000 : null,
                error.code,
                error.message,
                now,
                id,
            );
    }

    clearRunning(rows: CurrencyRow[]): void {
        const statement = this.db.prepare('UPDATE cryptocurrencies SET syncing = 0 WHERE id = ?');
        for (const row of rows) {
            statement.run(row.id);
        }
    }
}
