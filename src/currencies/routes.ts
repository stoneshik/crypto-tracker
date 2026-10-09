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

    catalog: RequestHandler = async (req, res) => {
        res.json(await this.currencies.catalog(req.query));
    };

    create: RequestHandler = async (req, res) => {
        const currency = await this.currencies.create(req.body);
        res.location(`/api/v1/cryptocurrencies/${currency.id}`).status(201).json(currency);
    };

    update: RequestHandler = (req, res) => {
        res.json(this.currencies.update(currencyId(req), req.body));
    };

    updateRetention: RequestHandler = (req, res) => {
        res.json(this.currencies.updateRetention(req.body));
    };

    delete: RequestHandler = (req, res) => {
        this.currencies.delete(currencyId(req));
        res.status(204).end();
    };
}

import { Router } from 'express';
import { requireAdmin,requireAuthentication } from '../auth/middleware';
import type { AuthService } from '../auth/service';
import { requireEmptyBody,requireEmptyQuery,requireJson } from '../http/request-validation';

export function createCurrencyRouter(currencies: CurrencyService, auth: AuthService): Router {
    const router = Router();
    const controller = new CurrencyController(currencies);
    const authenticated = requireAuthentication(auth);
    const admin = [authenticated, requireAdmin];

    router.get('/cryptocurrency-catalog', ...admin, requireEmptyBody, controller.catalog);
    router.get('/cryptocurrencies', authenticated, requireEmptyBody, controller.list);
    router.get(
        '/cryptocurrencies/:cryptocurrencyId',
        authenticated,
        requireEmptyBody,
        requireEmptyQuery,
        controller.get,
    );
    router.post('/cryptocurrencies', ...admin, requireJson, requireEmptyQuery, controller.create);
    router.patch(
        '/cryptocurrencies',
        ...admin,
        requireJson,
        requireEmptyQuery,
        controller.updateRetention,
    );
    router.patch(
        '/cryptocurrencies/:cryptocurrencyId',
        ...admin,
        requireJson,
        requireEmptyQuery,
        controller.update,
    );
    router.delete(
        '/cryptocurrencies/:cryptocurrencyId',
        ...admin,
        requireEmptyBody,
        requireEmptyQuery,
        controller.delete,
    );
    return router;
}
