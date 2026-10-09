import type { RequestHandler } from 'express';
import { SettingsService } from './service';

class SettingsController {
    constructor(private readonly settings: SettingsService) {}

    get: RequestHandler = (_req, res) => {
        res.json(this.settings.get());
    };

    update: RequestHandler = (req, res) => {
        res.json(this.settings.update(req.body));
    };
}

import { Router } from 'express';
import { requireAdmin,requireAuthentication } from '../auth/middleware';
import type { AuthService } from '../auth/service';
import { requireEmptyBody,requireEmptyQuery,requireJson } from '../http/request-validation';

export function createSettingsRouter(settings: SettingsService, auth: AuthService): Router {
    const router = Router();
    const controller = new SettingsController(settings);
    const admin = [requireAuthentication(auth), requireAdmin];
    router.get('/settings', ...admin, requireEmptyBody, requireEmptyQuery, controller.get);
    router.patch('/settings', ...admin, requireJson, requireEmptyQuery, controller.update);
    return router;
}
