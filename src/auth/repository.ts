import { randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import { transaction } from '../database';
import { ApiError } from '../errors';
import type { RefreshRow,Role,SessionRow,UserRow } from './types';

export class AuthRepository {
    constructor(private readonly db: DatabaseSync) {}

    findUser(email: string): UserRow | undefined {
        return this.db.prepare('SELECT * FROM users WHERE email = ?').get(email) as unknown as
            UserRow | undefined;
    }

    userById(id: string): UserRow | undefined {
        return this.db.prepare('SELECT * FROM users WHERE id = ?').get(id) as unknown as
            UserRow | undefined;
    }

    createUser(
        email: string,
        hash: string,
        salt: string,
        now: number,
        role: Role = 'USER',
    ): UserRow {
        const id = randomUUID();
        try {
            this.db
                .prepare(
                    `
                        INSERT INTO users (id, email, password_hash, password_salt, created_at, role)
                        VALUES (?, ?, ?, ?, ?, ?)
                    `,
                )
                .run(id, email, hash, salt, now, role);
        } catch (error) {
            const sqliteError = error as {
                code?: string;
                errcode?: number;
                message?: string;
            } | null;
            if (
                sqliteError?.code === 'ERR_SQLITE_ERROR' &&
                sqliteError.errcode === 2067 &&
                sqliteError.message?.includes('users.email')
            ) {
                throw new ApiError(409, 'EMAIL_ALREADY_EXISTS', 'Этот email уже зарегистрирован');
            }
            throw error;
        }
        return { id, email, password_hash: hash, password_salt: salt, created_at: now, role };
    }

    createSession(userId: string, tokenHash: string, now: number, lifetimeMs: number): SessionRow {
        const session: SessionRow = {
            id: randomUUID(),
            user_id: userId,
            created_at: now,
            expires_at: now + lifetimeMs,
            revoked_at: null,
        };
        transaction(this.db, () => {
            this.db
                .prepare(
                    'INSERT INTO sessions(id, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)',
                )
                .run(session.id, userId, now, session.expires_at);
            this.db
                .prepare(
                    'INSERT INTO refresh_tokens(token_hash, session_id, created_at) VALUES (?, ?, ?)',
                )
                .run(tokenHash, session.id, now);
        });
        return session;
    }

    session(id: string): SessionRow | undefined {
        return this.db.prepare('SELECT * FROM sessions WHERE id = ?').get(id) as unknown as
            SessionRow | undefined;
    }

    byRefresh(hash: string): RefreshRow | undefined {
        return this.db
            .prepare(
                `
                    SELECT s.*, r.used_at
                    FROM refresh_tokens r
                    JOIN sessions s ON s.id = r.session_id
                    WHERE r.token_hash = ?
                `,
            )
            .get(hash) as unknown as RefreshRow | undefined;
    }

    rotateRefresh(oldHash: string, newHash: string, now: number): SessionRow | undefined {
        return transaction(this.db, () => {
            const session = this.byRefresh(oldHash);
            if (!session || session.revoked_at !== null || session.expires_at <= now) {
                return undefined;
            }
            if (session.used_at !== null) {
                // Отзыв при повторном использовании должен зафиксироваться, а не откатиться вместе с 401.
                this.revoke(session.id, now);
                return undefined;
            }
            this.db
                .prepare('UPDATE refresh_tokens SET used_at = ? WHERE token_hash = ?')
                .run(now, oldHash);
            this.db
                .prepare(
                    'INSERT INTO refresh_tokens(token_hash, session_id, created_at) VALUES (?, ?, ?)',
                )
                .run(newHash, session.id, now);
            return session;
        });
    }

    revoke(id: string, now: number): void {
        this.db
            .prepare('UPDATE sessions SET revoked_at = COALESCE(revoked_at, ?) WHERE id = ?')
            .run(now, id);
    }

    consumeRateLimit(
        key: string,
        now: number,
        windowMs: number,
    ): { hits: number; resets_at: number } {
        return this.db
            .prepare(
                `
                    INSERT INTO rate_limits (key, hits, resets_at)
                    VALUES (?, 1, ?)
                    ON CONFLICT (key) DO UPDATE SET
                        hits = CASE WHEN resets_at <= ? THEN 1 ELSE hits + 1 END,
                        resets_at = CASE WHEN resets_at <= ? THEN excluded.resets_at ELSE resets_at END
                    RETURNING hits, resets_at
                `,
            )
            .get(key, now + windowMs, now, now) as unknown as { hits: number; resets_at: number };
    }

    cleanup(now: number): void {
        transaction(this.db, () => {
            this.db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(now);
            this.db.prepare('DELETE FROM rate_limits WHERE resets_at <= ?').run(now);
        });
    }
}
