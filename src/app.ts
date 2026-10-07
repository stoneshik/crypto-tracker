import express from 'express';
import { createCorsMiddleware } from './http/cors';
import { createErrorHandler,notFound } from './http/errors';
import { requestContext } from './http/request-context';
import { createSystemRouter } from './http/system.routes';
import type { AppDependencies } from './types';

export function createApp({ config, db, logger }: AppDependencies) {
    const app = express();
    app.disable('x-powered-by');
    app.set('query parser', 'simple');
    app.set('trust proxy', config.trustProxyHops);
    app.use(requestContext);
    app.use(createCorsMiddleware(config));
    app.use(express.json({ limit: config.bodyLimitBytes, strict: true, inflate: false }));
    app.use(createSystemRouter(db));
    app.use(notFound);
    app.use(createErrorHandler(config, logger));
    return app;
}
