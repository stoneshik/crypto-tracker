import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import type { Config } from './config/types';

let savepointSequence = 0;

export function transaction<T>(db: DatabaseSync, action: () => T): T {
    const nested = db.isTransaction;
    const savepoint = `transaction_${++savepointSequence}`;
    db.exec(nested ? `SAVEPOINT ${savepoint}` : 'BEGIN IMMEDIATE');
    try {
        const result = action();
        db.exec(nested ? `RELEASE ${savepoint}` : 'COMMIT');
        return result;
    } catch (error) {
        if (nested) {
            db.exec(`ROLLBACK TO ${savepoint}`);
            db.exec(`RELEASE ${savepoint}`);
        } else {
            db.exec('ROLLBACK');
        }
        throw error;
    }
}

export function openDatabase(
    config: Pick<Config, 'databasePath' | 'sqliteBusyTimeoutMs'>,
): DatabaseSync {
    mkdirSync(dirname(config.databasePath), { recursive: true });
    const db = new DatabaseSync(config.databasePath, { timeout: config.sqliteBusyTimeoutMs });
    try {
        db.exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;');
        db.exec(
            'CREATE TABLE IF NOT EXISTS schema_migrations (version TEXT PRIMARY KEY, applied_at INTEGER NOT NULL)',
        );
        const migration = '001_initial.sql';
        transaction(db, () => {
            if (db.prepare('SELECT 1 FROM schema_migrations WHERE version = ?').get(migration)) {
                return;
            }
            db.exec(readFileSync(resolve(__dirname, '../migrations', migration), 'utf8'));
            db.prepare('INSERT INTO schema_migrations(version, applied_at) VALUES (?, ?)').run(
                migration,
                Date.now(),
            );
        });
        return db;
    } catch (error) {
        db.close();
        throw error;
    }
}
