import type { RequestHandler } from 'express';
import { currencyId } from '../http/parameters';
import { PriceService } from './service';

class PriceController {

    constructor(private readonly prices: PriceService) {}

    listLatest: RequestHandler = (req, res) => {
        res.json(this.prices.listLatest(req.query));
    };

    history: RequestHandler = (req, res) => {
        res.json(this.prices.history(currencyId(req), req.query));
    };
}

import { Router } from 'express';
import { requireAuthentication } from '../auth/middleware';
import type { Config } from '../config/types';
import { requireEmptyBody } from '../http/request-validation';

export function createPriceRouter(prices: PriceService, config: Config): Router {
    const router = Router();
    const controller = new PriceController(prices);
    const read = [requireAuthentication(config), requireEmptyBody];
    router.get('/prices/latest', ...read, controller.listLatest);
    router.get('/cryptocurrencies/:cryptocurrencyId/price-history', ...read, controller.history);
    return router;
}
