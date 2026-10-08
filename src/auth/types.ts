export type Role = 'USER' | 'ADMIN';

export interface UserRow {
    role: Role;
    id: string;
    email: string;
    password_hash: string;
    password_salt: string;
    created_at: number;
}

export interface SessionRow {
    id: string;
    user_id: string;
    created_at: number;
    expires_at: number;
    revoked_at: number | null;
}

export interface RefreshRow extends SessionRow {
    used_at: number | null;
}

export interface User {
    id: string;
    email: string;
    role: Role;
    createdAt: string;
}

export interface UserPrincipal {
    kind: 'user';
    user: User;
    sessionId: string;
}

export type Principal = UserPrincipal | { kind: 'service' };

export interface AccessClaims {
    sub: string;
    sid: string;
    jti: string;
    iss: string;
    aud: string;
    iat: number;
    exp: number;
}
