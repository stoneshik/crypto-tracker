import type { DatabaseSync } from 'node:sqlite';
import type { Config } from '../config/types';
import { transaction } from '../database';
import { ApiError,UpstreamError } from '../errors';
import type { CurrencyCreate,CurrencyRow } from './types';

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
