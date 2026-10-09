import type { RequestHandler } from 'express';
import { operationId } from '../http/parameters';
import { OperationService } from './service';

class OperationController {
    constructor(private readonly operations: OperationService) {}

    createSynchronization: RequestHandler = (req, res) => {
        const job = this.operations.createSynchronization(req.body);
        res.location(`/api/v1/price-synchronizations/${job.id}`).status(202).json(job);
    };

    getSynchronization: RequestHandler = (req, res) => {
        res.json(this.operations.getSynchronization(operationId(req, 'synchronizationId')));
    };

    createDeletion: RequestHandler = (req, res) => {
        const job = this.operations.createDeletion(req.body);
        res.location(`/api/v1/price-history-deletions/${job.id}`).status(202).json(job);
    };

    getDeletion: RequestHandler = (req, res) => {
        res.json(this.operations.getDeletion(operationId(req, 'deletionId')));
    };
}

import { Router } from 'express';
import { requireAdmin,requireAuthentication } from '../auth/middleware';
import type { AuthService } from '../auth/service';
import { requireEmptyBody,requireEmptyQuery,requireJson } from '../http/request-validation';

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
