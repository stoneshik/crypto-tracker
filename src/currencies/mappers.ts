import type { DefaultRetentionPolicy,RetentionPolicy } from '../settings/types';
import type { CurrencyRow } from './types';

function syncState(row: CurrencyRow): string {
    if (!row.tracking_enabled) {
        return 'disabled';
    }
    if (row.syncing) {
        return 'running';
    }
    if (row.last_error_code) {
        return 'error';
    }
    return 'scheduled';
}

const iso = (value: number | null) => (value === null ? null : new Date(value).toISOString());

export const toCurrency = (row: CurrencyRow, defaultDays: number | null) => ({
    id: row.id,
    cmcId: row.cmc_id,
    symbol: row.symbol,
    name: row.name,
    trackingEnabled: Boolean(row.tracking_enabled),
    pollingIntervalSeconds: row.polling_interval_seconds,
    retentionPolicy: retentionPolicy(row),
    effectiveRetentionPolicy: effectivePolicy(row, defaultDays),
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
    lastAttemptAt: iso(row.last_attempt_at),
    lastSuccessfulSyncAt: iso(row.last_successful_sync_at),
    nextSyncAt: iso(row.next_sync_at),
    syncState: syncState(row),
    ...(row.last_error_code
        ? {
              lastSyncError: {
                  code: row.last_error_code,
                  message: row.last_error_message,
                  occurredAt: iso(row.last_error_at),
              },
          }
        : {}),
});

function retentionPolicy(row: CurrencyRow): RetentionPolicy {
    if (row.retention_mode === 'days') {
        return { mode: 'days', days: row.retention_days! };
    }
    return { mode: row.retention_mode };
}

function effectivePolicy(row: CurrencyRow, defaultDays: number | null): DefaultRetentionPolicy {
    if (row.retention_mode === 'forever') {
        return { mode: 'forever' };
    }
    const days = row.retention_mode === 'days' ? row.retention_days : defaultDays;
    return days === null ? { mode: 'forever' } : { mode: 'days', days };
}
