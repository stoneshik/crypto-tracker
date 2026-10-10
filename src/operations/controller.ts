import type { RequestHandler } from 'express';
import { operationId } from '../http/parameters';
import { OperationService } from './service';

export class OperationController {
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
