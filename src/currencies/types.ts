import type { RetentionPolicy } from '../settings/types';

export interface CurrencyRow {
    retention_mode: 'inherit' | 'forever' | 'days';
    retention_days: number | null;
    id: number;
    cmc_id: number;
    symbol: string;
    name: string;
    tracking_enabled: number;
    polling_interval_seconds: number;
    created_at: number;
    updated_at: number;
    last_attempt_at: number | null;
    last_successful_sync_at: number | null;
    next_sync_at: number | null;
    syncing: number;
    failure_count: number;
    last_error_code: string | null;
    last_error_message: string | null;
    last_error_at: number | null;
}

export interface CurrencyCreate {
    cmcId: number;
    trackingEnabled: boolean;
    pollingIntervalSeconds: number;
    retentionPolicy: RetentionPolicy;
}

export interface CurrencyUpdate {
    trackingEnabled?: boolean;
    pollingIntervalSeconds?: number;
    retentionPolicy?: RetentionPolicy;
}

export type CurrencySelection =
    { scope: 'all' } | { scope: 'selected'; cryptocurrencyIds: number[] };
