import type { ErrorRequestHandler,RequestHandler } from 'express';
import type { Config } from '../config/types';
import { ApiError } from '../errors';
import type { Logger } from '../types';

function toApiError(error: unknown): ApiError {
    if (error instanceof ApiError) {
        return error;
    }
    const bodyError = error as { type?: string; status?: number } | null;
    if (bodyError?.type === 'entity.parse.failed') {
        return new ApiError(400, 'INVALID_JSON', 'Некорректный JSON');
    }
    if (bodyError?.status === 413) {
        return new ApiError(413, 'PAYLOAD_TOO_LARGE', 'Превышен размер тела запроса');
    }
    if (bodyError?.status === 415) {
        return new ApiError(415, 'UNSUPPORTED_MEDIA_TYPE', 'Неподдерживаемый формат тела');
    }
    if (bodyError?.status === 400 || error instanceof URIError) {
        return new ApiError(400, 'INVALID_REQUEST', 'Некорректный запрос');
    }
    return new ApiError(500, 'INTERNAL_ERROR', 'Внутренняя ошибка сервера');
}

export const notFound: RequestHandler = (_req, _res, next) => {
    next(new ApiError(404, 'RESOURCE_NOT_FOUND', 'Маршрут не найден'));
};

export function createErrorHandler(_config: Config, logger: Logger): ErrorRequestHandler {
    return (error: unknown, req, res, next) => {
        if (res.headersSent) {
            next(error);
            return;
        }
        const failure = toApiError(error);
        if (failure.status === 500) {
            logger.error('request.failed', { requestId: res.locals.requestId });
        }
        if (failure.status === 401) {
            res.set('WWW-Authenticate', 'Bearer');
        }
        if (failure.retryAfterSeconds) {
            res.set('Retry-After', String(failure.retryAfterSeconds));
        }
        res.status(failure.status)
            .type('application/problem+json')
            .json({
                type: 'about:blank',
                title: failure.code,
                status: failure.status,
                code: failure.code,
                detail: failure.message,
                instance: req.path,
                requestId: res.locals.requestId,
                ...(failure.invalidParams ? { invalidParams: failure.invalidParams } : {}),
            });
    };
}
