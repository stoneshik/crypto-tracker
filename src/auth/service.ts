import type { Config } from '../config/types';
import { ApiError, unauthorized } from '../errors';
import { equalSecrets, refreshToken, tokenHash } from '../shared/crypto';
import { hashPassword, verifyPassword } from './password';
import { JwtTokens } from './jwt';
import { AuthRepository } from './repository';
import type { SessionRow, UserRow, User, UserPrincipal, Principal } from './types';

const publicUser = (row: UserRow): User => ({
    id: row.id,
    email: row.email,
    role: row.role,
    createdAt: new Date(row.created_at).toISOString(),
});

export class AuthService {
    constructor(
        private readonly repository: AuthRepository,
        private readonly tokens: JwtTokens,
        private readonly config: Config,
        private readonly clock: () => number = Date.now,
    ) {}

    async register(email: string, password: string): Promise<User> {
        const { hash, salt } = await hashPassword(password);
        return publicUser(this.repository.createUser(email, hash, salt, this.clock()));
    }

    async login(email: string, password: string) {
        const user = this.repository.findUser(email);
        const valid = await verifyPassword(password, user?.password_hash, user?.password_salt);
        if (!user || !valid) {
            throw new ApiError(401, 'INVALID_CREDENTIALS', 'Неверный email или пароль');
        }
        const raw = refreshToken();
        const now = this.clock();
        const session = this.repository.createSession(
            user.id,
            tokenHash(raw),
            now,
            this.config.refreshTokenTtlSeconds * 1000,
        );
        return this.result(session, user, raw, now);
    }

    refresh(raw: string | undefined) {
        if (!raw || !/^[A-Za-z0-9_-]{43}$/.test(raw)) {
            throw unauthorized();
        }
        const next = refreshToken();
        const now = this.clock();
        const session = this.repository.rotateRefresh(tokenHash(raw), tokenHash(next), now);
        if (!session) {
            throw unauthorized();
        }
        const user = this.repository.userById(session.user_id);
        if (!user) {
            throw unauthorized();
        }
        return this.result(session, user, next, now);
    }

    private result(session: SessionRow, user: UserRow, raw: string, now: number) {
        const issued = this.tokens.issue(user.id, session.id, now, session.expires_at);
        return {
            body: {
                accessToken: issued.token,
                tokenType: 'Bearer',
                expiresIn: issued.expiresIn,
                sessionId: session.id,
                user: publicUser(user),
            },
            refreshToken: raw,
            cookieMaxAge: session.expires_at - now,
        };
    }

    authenticate(header: string | undefined, allowService = true): Principal {
        const token = /^Bearer ([A-Za-z0-9._-]+)$/i.exec(header ?? '')?.[1];
        if (!token || token.length > 4096) {
            throw unauthorized();
        }
        if (token.startsWith('ctk_')) {
            if (
                allowService &&
                this.config.serviceApiKey &&
                equalSecrets(token, this.config.serviceApiKey)
            ) {
                return { kind: 'service' };
            }
            throw unauthorized();
        }
        const claims = this.tokens.verify(token, this.clock());
        const session = this.repository.session(claims.sid);
        if (
            !session ||
            session.user_id !== claims.sub ||
            session.revoked_at !== null ||
            session.expires_at <= this.clock()
        ) {
            throw unauthorized();
        }
        const user = this.repository.userById(claims.sub);
        if (!user) {
            throw unauthorized();
        }
        return { kind: 'user', user: publicUser(user), sessionId: session.id };
    }

    logout(header: string | undefined, rawRefresh: string | undefined): void {
        let principal: UserPrincipal | undefined;
        try {
            principal = this.authenticate(header, false) as UserPrincipal;
        } catch (error) {
            if (!(error instanceof ApiError) || error.status !== 401) {
                throw error;
            }
        }
        const candidate =
            rawRefresh && /^[A-Za-z0-9_-]{43}$/.test(rawRefresh)
                ? this.repository.byRefresh(tokenHash(rawRefresh))
                : undefined;
        const cookieSession =
            candidate &&
            candidate.used_at === null &&
            candidate.revoked_at === null &&
            candidate.expires_at > this.clock()
                ? candidate
                : undefined;
        if (principal && cookieSession && principal.sessionId !== cookieSession.id) {
            throw new ApiError(409, 'SESSION_MISMATCH', 'JWT и cookie относятся к разным сессиям');
        }
        const id = principal?.sessionId ?? cookieSession?.id;
        if (!id) {
            throw unauthorized();
        }
        this.repository.revoke(id, this.clock());
    }

    checkRateLimit(scope: string, address: string): void {
        const now = this.clock();
        const state = this.repository.consumeRateLimit(
            tokenHash(`${scope}:${address}`),
            now,
            this.config.authRateLimitWindowSeconds * 1000,
        );
        if (state.hits > this.config.authRateLimitMax) {
            throw new ApiError(
                429,
                'RATE_LIMIT_EXCEEDED',
                'Слишком много попыток',
                undefined,
                Math.max(1, Math.ceil((state.resets_at - now) / 1000)),
            );
        }
    }
}
