import { randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import { CurrencyRepository } from '../currencies/repository';
import type { CurrencySelection } from '../currencies/types';
import { transaction } from '../database';
import { ApiError } from '../errors';
import type {
    DeletionPeriod,
    OperationFailure,
    OperationItemRow,
    OperationKind,
    OperationRow,
} from './types';

export class OperationRepository {
    constructor(
        private readonly db: DatabaseSync,
        private readonly currencies: CurrencyRepository,
    ) {}

    create(
        kind: OperationKind,
        selection: CurrencySelection,
        now: number,
        period?: DeletionPeriod,
    ): OperationRow {
        return transaction(this.db, () => {
            const ids = this.currencies.select(selection);
            if (!ids.length) {
                throw new ApiError(422, 'EMPTY_SELECTION', 'Не выбрано ни одной валюты');
            }
            for (const id of ids) {
                const active = this.db
                    .prepare(
                        `
                            SELECT o.* FROM operations o JOIN operation_items i ON i.operation_id = o.id
                            WHERE o.kind = ? AND o.status IN ('queued', 'running') AND i.cryptocurrency_id = ?
                        `,
                    )
                    .all(kind, id) as unknown as OperationRow[];
                if (
                    active.some(
                        (job) =>
                            !period ||
                            (job.period_from! < period.to && job.period_to! > period.from),
                    )
                ) {
                    throw new ApiError(
                        409,
                        'OPERATION_CONFLICT',
                        'Пересекающееся задание уже принято',
                    );
                }
            }
            const id = randomUUID();
            const snapshot = period
                ? Number(
                      this.db.prepare('SELECT COALESCE(MAX(id), 0) AS id FROM price_history').get()!
                          .id,
                  )
                : null;
            this.db
                .prepare(
                    `
                        INSERT INTO operations (id, kind, status, created_at, period_from, period_to, snapshot_id)
                        VALUES (?, ?, 'queued', ?, ?, ?, ?)
                    `,
                )
                .run(id, kind, now, period?.from ?? null, period?.to ?? null, snapshot);
            const insert = this.db.prepare(
                "INSERT INTO operation_items (operation_id, cryptocurrency_id, status) VALUES (?, ?, 'queued')",
            );
            for (const currencyId of ids) {
                insert.run(id, currencyId);
            }
            return this.get(id, kind);
        });
    }

    get(id: string, kind: OperationKind): OperationRow {
        const row = this.db
            .prepare('SELECT * FROM operations WHERE id = ? AND kind = ?')
            .get(id, kind) as unknown as OperationRow | undefined;
        if (!row) {
            throw new ApiError(404, 'RESOURCE_NOT_FOUND', 'Задание не найдено');
        }
        return row;
    }

    items(id: string): OperationItemRow[] {
        return this.db
            .prepare(
                'SELECT * FROM operation_items WHERE operation_id = ? ORDER BY cryptocurrency_id',
            )
            .all(id) as unknown as OperationItemRow[];
    }

    next(): OperationRow | undefined {
        return this.db
            .prepare(
                "SELECT * FROM operations WHERE status = 'queued' ORDER BY created_at, rowid LIMIT 1",
            )
            .get() as unknown as OperationRow | undefined;
    }

    start(id: string, now: number): void {
        transaction(this.db, () => {
            this.db
                .prepare(
                    "UPDATE operations SET status = 'running', started_at = ? WHERE id = ? AND status = 'queued'",
                )
                .run(now, id);
            this.db
                .prepare(
                    "UPDATE operation_items SET status = 'running' WHERE operation_id = ? AND status = 'queued'",
                )
                .run(id);
        });
    }

    completeItem(id: string, currencyId: number, now: number, error?: OperationFailure): void {
        this.db
            .prepare(
                `
                    UPDATE operation_items SET status = ?, error_code = ?, error_message = ?, error_at = ?
                    WHERE operation_id = ? AND cryptocurrency_id = ? AND status = 'running'
                `,
            )
            .run(
                error ? 'failed' : 'succeeded',
                error?.code ?? null,
                error?.message ?? null,
                error ? now : null,
                id,
                currencyId,
            );
    }

    finishSynchronization(id: string, now: number): void {
        const items = this.items(id);
        const succeeded = items.filter((item) => item.status === 'succeeded').length;
        const status =
            succeeded === items.length ? 'succeeded' : succeeded ? 'partially_succeeded' : 'failed';
        this.db
            .prepare('UPDATE operations SET status = ?, completed_at = ? WHERE id = ?')
            .run(status, now, id);
    }

    deleteBatch(job: OperationRow, limit: number): number {
        return transaction(this.db, () => {
            const result = this.db
                .prepare(
                    `
                        DELETE FROM price_history WHERE id IN (
                            SELECT id FROM price_history
                            WHERE id <= ? AND received_at >= ? AND received_at < ?
                                AND cryptocurrency_id IN (SELECT cryptocurrency_id FROM operation_items WHERE operation_id = ?)
                            ORDER BY id LIMIT ?
                        )
                    `,
                )
                .run(job.snapshot_id!, job.period_from!, job.period_to!, job.id, limit);
            const deleted = Number(result.changes);
            this.db
                .prepare('UPDATE operations SET deleted_rows = deleted_rows + ? WHERE id = ?')
                .run(deleted, job.id);
            return deleted;
        });
    }

    finishDeletion(id: string, now: number): void {
        transaction(this.db, () => {
            this.db
                .prepare("UPDATE operation_items SET status = 'succeeded' WHERE operation_id = ?")
                .run(id);
            this.db
                .prepare(
                    "UPDATE operations SET status = 'succeeded', completed_at = ? WHERE id = ?",
                )
                .run(now, id);
        });
    }

    fail(job: OperationRow, error: OperationFailure, now: number): void {
        transaction(this.db, () => {
            this.db
                .prepare(
                    `
                        UPDATE operation_items SET status = 'failed', error_code = ?, error_message = ?, error_at = ?
                        WHERE operation_id = ? AND status IN ('queued', 'running')
                    `,
                )
                .run(error.code, error.message, now, job.id);
            this.db
                .prepare(
                    `
                        UPDATE operations SET status = 'failed', completed_at = ?, error_code = ?, error_message = ?, error_at = ? WHERE id = ?
                    `,
                )
                .run(now, error.code, error.message, now, job.id);
            if (job.kind === 'synchronization') {
                this.finishSynchronization(job.id, now);
            }
        });
    }

    recover(now: number): void {
        const interrupted = this.db
            .prepare("SELECT * FROM operations WHERE status = 'running'")
            .all() as unknown as OperationRow[];
        for (const job of interrupted) {
            this.fail(
                job,
                {
                    code: 'OPERATION_INTERRUPTED',
                    message: 'Выполнение прервано остановкой сервера',
                },
                now,
            );
        }
    }
}
