import { Router } from 'express';
import type { Config } from '../config/types';
import { requireEmptyBody, requireEmptyQuery, requireJson } from '../http/request-validation';
import { limitAuthRequests, requireAuthentication } from './middleware';
import { AuthService } from './service';
import { AuthController } from './controller';

export function createAuthRouter(auth: AuthService, config: Config): Router {
    const router = Router();
    const controller = new AuthController(auth, config);
    router.post(
        '/users',
        limitAuthRequests(auth, 'register'),
        requireJson,
        requireEmptyQuery,
        controller.register,
    );
    router.get(
        '/users/me',
        requireAuthentication(auth, false),
        requireEmptyBody,
        requireEmptyQuery,
        controller.profile,
    );
    router.post(
        '/auth/sessions',
        limitAuthRequests(auth, 'login'),
        requireJson,
        requireEmptyQuery,
        controller.login,
    );
    router.post(
        '/auth/tokens',
        limitAuthRequests(auth, 'refresh'),
        requireEmptyQuery,
        requireEmptyBody,
        controller.refresh,
    );
    router.delete('/auth/sessions/current', requireEmptyQuery, requireEmptyBody, controller.logout);
    return router;
}
