CREATE TABLE users (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL COLLATE NOCASE UNIQUE,
    password_hash TEXT NOT NULL,
    password_salt TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'USER' CHECK (role IN ('USER', 'ADMIN')),
    created_at INTEGER NOT NULL
);

CREATE TABLE sessions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL,
    revoked_at INTEGER
);
CREATE INDEX sessions_user ON sessions(user_id);
CREATE INDEX sessions_expiry ON sessions(expires_at);

CREATE TABLE refresh_tokens (
    token_hash TEXT PRIMARY KEY,
    session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    created_at INTEGER NOT NULL,
    used_at INTEGER
);
CREATE INDEX refresh_tokens_session ON refresh_tokens(session_id);

CREATE TABLE rate_limits (
    key TEXT PRIMARY KEY,
    hits INTEGER NOT NULL,
    resets_at INTEGER NOT NULL
);

CREATE TABLE cryptocurrencies (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    cmc_id INTEGER NOT NULL UNIQUE,
    symbol TEXT NOT NULL,
    name TEXT NOT NULL,
    tracking_enabled INTEGER NOT NULL DEFAULT 1 CHECK (tracking_enabled IN (0, 1)),
    polling_interval_seconds INTEGER NOT NULL CHECK (polling_interval_seconds >= 60),
    retention_mode TEXT NOT NULL DEFAULT 'inherit'
        CHECK (retention_mode IN ('inherit', 'forever', 'days')),
    retention_days INTEGER CHECK (retention_days BETWEEN 1 AND 3650),
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    last_attempt_at INTEGER,
    last_successful_sync_at INTEGER,
    next_sync_at INTEGER,
    syncing INTEGER NOT NULL DEFAULT 0 CHECK (syncing IN (0, 1)),
    failure_count INTEGER NOT NULL DEFAULT 0,
    last_error_code TEXT,
    last_error_message TEXT,
    last_error_at INTEGER
);
CREATE INDEX cryptocurrencies_due ON cryptocurrencies(tracking_enabled, next_sync_at);

CREATE TABLE price_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    cryptocurrency_id INTEGER NOT NULL REFERENCES cryptocurrencies(id) ON DELETE CASCADE,
    price REAL NOT NULL CHECK (price >= 0),
    received_at INTEGER NOT NULL,
    source_updated_at INTEGER NOT NULL
);
CREATE INDEX price_history_currency_time ON price_history(cryptocurrency_id, received_at, id);

CREATE TABLE latest_prices (
    cryptocurrency_id INTEGER PRIMARY KEY REFERENCES cryptocurrencies(id) ON DELETE CASCADE,
    price REAL NOT NULL CHECK (price >= 0),
    received_at INTEGER NOT NULL,
    source_updated_at INTEGER NOT NULL
);

CREATE TABLE settings (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    retention_days INTEGER CHECK (retention_days BETWEEN 1 AND 3650),
    initialized INTEGER NOT NULL DEFAULT 0 CHECK (initialized IN (0, 1)),
    updated_at INTEGER NOT NULL
);

CREATE TABLE operations (
    id TEXT PRIMARY KEY,
    kind TEXT NOT NULL CHECK (kind IN ('synchronization', 'deletion')),
    status TEXT NOT NULL CHECK (status IN ('queued', 'running', 'succeeded', 'partially_succeeded', 'failed')),
    created_at INTEGER NOT NULL,
    started_at INTEGER,
    completed_at INTEGER,
    period_from INTEGER,
    period_to INTEGER,
    snapshot_id INTEGER,
    deleted_rows INTEGER NOT NULL DEFAULT 0,
    error_code TEXT,
    error_message TEXT,
    error_at INTEGER
);
CREATE INDEX operations_queue ON operations(status, created_at, id);

CREATE TABLE operation_items (
    operation_id TEXT NOT NULL REFERENCES operations(id) ON DELETE CASCADE,
    cryptocurrency_id INTEGER NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('queued', 'running', 'succeeded', 'failed')),
    error_code TEXT,
    error_message TEXT,
    error_at INTEGER,
    PRIMARY KEY (operation_id, cryptocurrency_id)
);
CREATE INDEX operation_items_currency ON operation_items(cryptocurrency_id, operation_id);
