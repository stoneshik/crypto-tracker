import { Router } from 'express';
import type { AuthService } from '../auth/service';
import { requireAuthentication } from '../auth/middleware';
import { requireEmptyBody, requireEmptyQuery } from '../http/request-validation';
import { PriceController } from './controller';
import { PriceService } from './service';

export function createPriceRouter(prices: PriceService, auth: AuthService): Router {
    const router = Router();
    const controller = new PriceController(prices);
    const read = [requireAuthentication(auth), requireEmptyBody];
    router.get('/prices/latest', ...read, controller.listLatest);
    router.get(
        '/cryptocurrencies/:cryptocurrencyId/prices/latest',
        ...read,
        requireEmptyQuery,
        controller.latest,
    );
    router.get('/cryptocurrencies/:cryptocurrencyId/price-history', ...read, controller.history);
    router.get(
        '/cryptocurrencies/:cryptocurrencyId/price-aggregates',
        ...read,
        controller.aggregates,
    );
    return router;
}
