import { Router } from 'express';
import type { AuthService } from '../auth/service';
import { requireAuthentication, requireAdmin } from '../auth/middleware';
import { requireEmptyBody, requireEmptyQuery, requireJson } from '../http/request-validation';
import { CurrencyController } from './controller';
import { CurrencyService } from './service';

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
