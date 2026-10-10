import { Router } from 'express';
import type { AuthService } from '../auth/service';
import { requireAuthentication, requireAdmin } from '../auth/middleware';
import { requireEmptyBody, requireEmptyQuery, requireJson } from '../http/request-validation';
import { SettingsController } from './controller';
import { SettingsService } from './service';

export function createSettingsRouter(settings: SettingsService, auth: AuthService): Router {
    const router = Router();
    const controller = new SettingsController(settings);
    const admin = [requireAuthentication(auth), requireAdmin];
    router.get('/settings', ...admin, requireEmptyBody, requireEmptyQuery, controller.get);
    router.patch('/settings', ...admin, requireJson, requireEmptyQuery, controller.update);
    return router;
}
