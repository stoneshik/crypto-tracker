import type { Request } from 'express';
import { invalid } from '../errors';
import { positiveInteger } from '../validation';

export function currencyId(req: Request): number {
    return positiveInteger(req.params.cryptocurrencyId, 'cryptocurrencyId', 'path');
}

export function operationId(req: Request, name: 'synchronizationId' | 'deletionId'): string {
    const value = req.params[name];
    if (
        typeof value !== 'string' ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
    ) {
        throw invalid(name, 'path', 'Ожидается UUID', 400);
    }
    return value;
}
