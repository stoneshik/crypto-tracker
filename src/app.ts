import express from 'express';
import { createAuthRouter } from './auth/routes';
import { createCurrencyRouter } from './currencies/routes';
import { createCorsMiddleware } from './http/cors';
import { createErrorHandler,notFound } from './http/errors';
import { requestContext } from './http/request-context';
import { createSystemRouter } from './http/system.routes';
import { createPriceRouter } from './prices/routes';
import { createSettingsRouter } from './settings/routes';
import type { AppDependencies } from './types';

export function createApp({ config, db, logger, auth, prices, currencies, settings }: AppDependencies) {
    const app = express();
    app.disable('x-powered-by');
    app.set('query parser', 'simple');
    app.set('trust proxy', config.trustProxyHops);
    app.use(requestContext);
    app.use(createCorsMiddleware(config));
    app.use(express.json({ limit: config.bodyLimitBytes, strict: true, inflate: false }));
    app.use('/api/v1', createAuthRouter(auth, config));
    app.use('/api/v1', createPriceRouter(prices, auth));
    app.use('/api/v1', createCurrencyRouter(currencies, auth));
    app.use('/api/v1', createSettingsRouter(settings, auth));
    app.use(createSystemRouter(db));
    app.use(notFound);
    app.use(createErrorHandler(config, logger));
    return app;
}
