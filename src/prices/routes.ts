import type { RequestHandler } from 'express';
import { currencyId } from '../http/parameters';
import { PriceService } from './service';

class PriceController {

    constructor(private readonly prices: PriceService) {}

    listLatest: RequestHandler = (req, res) => {
        res.json(this.prices.listLatest(req.query));
    };

    latest: RequestHandler = (req, res) => {
        res.json(this.prices.latest(currencyId(req)));
    };

    history: RequestHandler = (req, res) => {
        res.json(this.prices.history(currencyId(req), req.query));
    };

    aggregates: RequestHandler = (req, res) => {
        res.json(this.prices.aggregates(currencyId(req), req.query));
    };
}

import { Router } from 'express';
import { requireAuthentication } from '../auth/middleware';
import type { Config } from '../config/types';
import { requireEmptyBody,requireEmptyQuery } from '../http/request-validation';

export function createPriceRouter(prices: PriceService, config: Config): Router {
    const router = Router();
    const controller = new PriceController(prices);
    const read = [requireAuthentication(config), requireEmptyBody];
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
