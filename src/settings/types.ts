export type DefaultRetentionPolicy = { mode: 'forever' } | { mode: 'days'; days: number };
export type RetentionPolicy = DefaultRetentionPolicy | { mode: 'inherit' };

export interface SettingsRow {
    id: number;
    retention_days: number | null;
    initialized: number;
    updated_at: number;
}
