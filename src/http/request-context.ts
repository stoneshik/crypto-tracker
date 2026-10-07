import type { RequestHandler } from 'express';
import { randomUUID } from 'node:crypto';

export const requestContext: RequestHandler = (_req, res, next) => {
    res.locals.requestId = randomUUID();
    res.set({
        'X-Request-Id': res.locals.requestId,
        'X-Content-Type-Options': 'nosniff',
        'Referrer-Policy': 'no-referrer',
        'X-Frame-Options': 'DENY',
        'Cache-Control': 'no-store',
    });
    next();
};
