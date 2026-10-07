import type { RequestHandler } from 'express';
import type { Config } from '../config/types';
import { ApiError } from '../errors';

export function createCorsMiddleware(config: Config): RequestHandler {
    return (req, res, next) => {
        const origin = req.headers.origin;
        const allowedOrigin = origin === config.frontendOrigin || origin === config.apiOrigin;
        res.vary('Origin');
        if (origin && allowedOrigin) {
            res.set({
                'Access-Control-Allow-Origin': origin,
                'Access-Control-Allow-Credentials': 'true',
                'Access-Control-Expose-Headers': 'X-Request-Id, Retry-After, Location',
            });
        }
        if (origin && !allowedOrigin && !['GET', 'HEAD'].includes(req.method)) {
            return next(new ApiError(403, 'ORIGIN_NOT_ALLOWED', 'Origin не разрешён'));
        }
        if (req.method === 'OPTIONS') {
            if (!origin) {
                return next(new ApiError(400, 'INVALID_PREFLIGHT', 'Отсутствует Origin'));
            }
            const method = req.headers['access-control-request-method'];
            const headers = (req.headers['access-control-request-headers'] ?? '')
                .toLowerCase()
                .split(',')
                .map((v) => v.trim())
                .filter(Boolean);
            if (
                !method ||
                !['GET', 'POST', 'PATCH', 'DELETE'].includes(method) ||
                headers.some((v) => !['authorization', 'content-type'].includes(v))
            ) {
                return next(
                    new ApiError(400, 'INVALID_PREFLIGHT', 'Недопустимый preflight-запрос'),
                );
            }
            res.set({
                'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE',
                'Access-Control-Allow-Headers': 'Authorization, Content-Type',
            });
            res.status(204).end();
            return;
        }
        next();
    };
}
