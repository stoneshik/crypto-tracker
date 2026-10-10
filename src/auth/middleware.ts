import { ApiError } from '../errors';
import type { Principal } from './types';
import type { RequestHandler } from 'express';
import type { AuthService } from './service';

export function requireAuthentication(auth: AuthService, allowServiceKey = true): RequestHandler {
    return (req, res, next) => {
        res.locals.principal = auth.authenticate(req.headers.authorization, allowServiceKey);
        next();
    };
}

export function limitAuthRequests(auth: AuthService, scope: string): RequestHandler {
    return (req, _res, next) => {
        auth.checkRateLimit(scope, req.ip ?? req.socket.remoteAddress ?? 'unknown');
        next();
    };
}

export const requireAdmin: RequestHandler = (_req, res, next) => {
    const principal = res.locals.principal as Principal;
    if (principal.kind !== 'user' || principal.user.role !== 'ADMIN') {
        throw new ApiError(403, 'FORBIDDEN', 'Требуются права администратора');
    }
    next();
};
