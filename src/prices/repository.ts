import type { DatabaseSync } from 'node:sqlite';
import { transaction } from '../database';
import type { Quote } from './types';

export class PriceRepository {

    constructor(private readonly db: DatabaseSync) {}

    saveQuote(id: number, quote: Quote, now: number): boolean {
        return transaction(this.db, () => {
            const row = this.db.prepare('SELECT id FROM cryptocurrencies WHERE id = ?').get(id);
            if (!row) {
                return false;
            }
            this.db
                .prepare(
                    `
                        INSERT INTO price_history (cryptocurrency_id, price, received_at, source_updated_at)
                        VALUES (?, ?, ?, ?)
                    `,
                )
                .run(id, quote.price, now, quote.sourceUpdatedAt);
            this.db
                .prepare(
                    `
                        INSERT INTO latest_prices (cryptocurrency_id, price, received_at, source_updated_at)
                        VALUES (?, ?, ?, ?)
                        ON CONFLICT (cryptocurrency_id) DO UPDATE SET
                            price = excluded.price,
                            received_at = excluded.received_at,
                            source_updated_at = excluded.source_updated_at
                    `,
                )
                .run(id, quote.price, now, quote.sourceUpdatedAt);
            this.db
                .prepare(
                    `
                        UPDATE cryptocurrencies SET
                            symbol = ?,
                            name = ?,
                            updated_at = CASE WHEN symbol <> ? OR name <> ? THEN ? ELSE updated_at END,
                            last_successful_sync_at = ?,
                            next_sync_at = CASE WHEN tracking_enabled = 1 THEN ? + polling_interval_seconds * 1000 ELSE NULL END,
                            syncing = 0,
                            failure_count = 0,
                            last_error_code = NULL,
                            last_error_message = NULL,
                            last_error_at = NULL
                        WHERE id = ?
                    `,
                )
                .run(quote.symbol, quote.name, quote.symbol, quote.name, now, now, now, id);
            return true;
        });
    }

    deleteExpired(now: number, limit: number): number {
        const result = this.db
            .prepare(
                `
                    DELETE FROM price_history WHERE id IN (
                        SELECT h.id FROM price_history h
                        JOIN cryptocurrencies c ON c.id = h.cryptocurrency_id
                        JOIN settings s ON s.id = 1
                        WHERE c.retention_mode != 'forever'
                            AND h.received_at < ? - (CASE WHEN c.retention_mode = 'days'
                                THEN c.retention_days ELSE s.retention_days END) * 86400000
                        ORDER BY h.id LIMIT ?
                    )
                `,
            )
            .run(now, limit);
        return Number(result.changes);
    }
}
