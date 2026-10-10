import { Router } from 'express';
import type { AuthService } from '../auth/service';
import { requireAuthentication, requireAdmin } from '../auth/middleware';
import { requireEmptyBody, requireEmptyQuery, requireJson } from '../http/request-validation';
import { OperationController } from './controller';
import { OperationService } from './service';

export function createOperationRouter(operations: OperationService, auth: AuthService): Router {
    const router = Router();
    const controller = new OperationController(operations);
    const admin = [requireAuthentication(auth), requireAdmin];
    const write = [...admin, requireJson, requireEmptyQuery];
    const read = [...admin, requireEmptyBody, requireEmptyQuery];
    router.post('/price-synchronizations', ...write, controller.createSynchronization);
    router.get(
        '/price-synchronizations/:synchronizationId',
        ...read,
        controller.getSynchronization,
    );
    router.post('/price-history-deletions', ...write, controller.createDeletion);
    router.get('/price-history-deletions/:deletionId', ...read, controller.getDeletion);
    return router;
}
