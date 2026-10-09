export type OperationKind = 'synchronization' | 'deletion';
export type OperationStatus = 'queued' | 'running' | 'succeeded' | 'partially_succeeded' | 'failed';
export type ItemStatus = 'queued' | 'running' | 'succeeded' | 'failed';

export interface OperationRow {
    id: string;
    kind: OperationKind;
    status: OperationStatus;
    created_at: number;
    started_at: number | null;
    completed_at: number | null;
    period_from: number | null;
    period_to: number | null;
    snapshot_id: number | null;
    deleted_rows: number;
    error_code: string | null;
    error_message: string | null;
    error_at: number | null;
}

export interface OperationItemRow {
    operation_id: string;
    cryptocurrency_id: number;
    status: ItemStatus;
    error_code: string | null;
    error_message: string | null;
    error_at: number | null;
}

export interface DeletionPeriod {
    from: number;
    to: number;
}
export interface OperationFailure {
    code: string;
    message: string;
}
