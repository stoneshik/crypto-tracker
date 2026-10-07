import type { RequestHandler } from 'express';
import { ApiError,invalid } from '../errors';
import { object } from '../validation';

export const requireJson: RequestHandler = (req, _res, next) => {
    if (!req.is('application/json')) {
        throw new ApiError(415, 'UNSUPPORTED_MEDIA_TYPE', 'Используйте application/json');
    }
    next();
};

export const requireEmptyBody: RequestHandler = (req, _res, next) => {
    if (Number(req.headers['content-length'] ?? 0) > 0 || req.headers['transfer-encoding']) {
        throw invalid('body', 'body', 'Тело запроса не принимается', 400);
    }
    next();
};

export const requireEmptyQuery: RequestHandler = (req, _res, next) => {
    object(req.query, [], 'query');
    next();
};
