import type { RequestHandler } from 'express';
import type { Config } from '../config/types';
import { ApiError } from '../errors';
import { equalSecrets } from '../shared/crypto';

export function requireAuthentication(config: Config): RequestHandler {
    return (req, res, next) => {
        const match = /^Bearer ([^ ]+)$/i.exec(req.headers.authorization ?? '');
        if (!match?.[1] || !config.serviceApiKey || !equalSecrets(match[1], config.serviceApiKey)) {
            throw new ApiError(401, 'UNAUTHORIZED', 'Требуется авторизация');
        }
        res.locals.principal = { kind: 'service' };
        next();
    };
}
