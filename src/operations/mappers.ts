import type { OperationItemRow,OperationRow } from './types';

const iso = (value: number | null) => (value === null ? null : new Date(value).toISOString());

export function toSynchronization(row: OperationRow, items: OperationItemRow[]) {
    return {
        id: row.id,
        status: row.status,
        createdAt: iso(row.created_at),
        startedAt: iso(row.started_at),
        completedAt: iso(row.completed_at),
        totalCount: items.length,
        succeededCount: items.filter((item) => item.status === 'succeeded').length,
        failedCount: items.filter((item) => item.status === 'failed').length,
        items: items.map((item) => ({
            cryptocurrencyId: item.cryptocurrency_id,
            status: item.status,
            ...(item.status === 'failed'
                ? {
                      error: {
                          code: item.error_code,
                          message: item.error_message,
                          occurredAt: iso(item.error_at),
                      },
                  }
                : {}),
        })),
    };
}

export function toDeletion(row: OperationRow, items: OperationItemRow[]) {
    return {
        id: row.id,
        status: row.status,
        createdAt: iso(row.created_at),
        startedAt: iso(row.started_at),
        completedAt: iso(row.completed_at),
        cryptocurrencyIds: items.map((item) => item.cryptocurrency_id),
        from: iso(row.period_from),
        to: iso(row.period_to),
        snapshotAt: iso(row.created_at),
        deletedRows: row.deleted_rows,
        ...(row.status === 'failed'
            ? {
                  error: {
                      code: row.error_code,
                      message: row.error_message,
                      occurredAt: iso(row.error_at),
                  },
              }
            : {}),
    };
}
