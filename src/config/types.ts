export interface TrackedCurrency {
    cmcId: number;
    symbol: string;
    name: string;
}

export interface Config {
    environment: 'development' | 'test' | 'production';
    host: string;
    port: number;
    databasePath: string;
    sqliteBusyTimeoutMs: number;
    apiOrigin: string;
    frontendOrigin: string;
    trustProxyHops: number;
    logLevel: 'info' | 'error' | 'silent';
    bodyLimitBytes: number;
    shutdownTimeoutMs: number;
    jwtSecret: string;
    jwtIssuer: string;
    jwtAudience: string;
    accessTokenTtlSeconds: number;
    refreshTokenTtlSeconds: number;
    cookieSecure: boolean;
    serviceApiKey: string;
    authRateLimitMax: number;
    authRateLimitWindowSeconds: number;
    cmcApiKey: string;
    cmcTimeoutMs: number;
    cmcMaxRetries: number;
    cmcRetryDelayMs: number;
    cmcRateLimitCooldownSeconds: number;
    syncEnabled: boolean;
    pollIntervalSeconds: number;
    syncTickMs: number;
    syncErrorBackoffSeconds: number;
    defaultRetentionDays: number | null;
    cleanupIntervalSeconds: number;
    cleanupBatchSize: number;
    trackedCurrencies: TrackedCurrency[];
}
