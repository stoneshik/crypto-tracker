import type { RequestHandler } from 'express';
import { currencyId } from '../http/parameters';
import { CurrencyService } from './service';

class CurrencyController {

    constructor(private readonly currencies: CurrencyService) {}

    list: RequestHandler = (req, res) => {
        res.json(this.currencies.list(req.query));
    };

    get: RequestHandler = (req, res) => {
        res.json(this.currencies.get(currencyId(req)));
    };
}

import { Router } from 'express';
import { requireAuthentication } from '../auth/middleware';
import type { AuthService } from '../auth/service';
import { requireEmptyBody,requireEmptyQuery } from '../http/request-validation';

export function createCurrencyRouter(currencies: CurrencyService, auth: AuthService): Router {
    const router = Router();
    const controller = new CurrencyController(currencies);
    const authenticated = requireAuthentication(auth);

    router.get('/cryptocurrencies', authenticated, requireEmptyBody, controller.list);
    router.get(
        '/cryptocurrencies/:cryptocurrencyId',
        authenticated,
        requireEmptyBody,
        requireEmptyQuery,
        controller.get,
    );
    return router;
}
