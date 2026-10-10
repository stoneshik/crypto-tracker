import type { RequestHandler } from 'express';
import { currencyId } from '../http/parameters';
import { PriceService } from './service';

export class PriceController {
    constructor(private readonly prices: PriceService) {}

    listLatest: RequestHandler = (req, res) => {
        res.json(this.prices.listLatest(req.query));
    };

    latest: RequestHandler = (req, res) => {
        res.json(this.prices.latest(currencyId(req)));
    };

    history: RequestHandler = (req, res) => {
        res.json(this.prices.history(currencyId(req), req.query));
    };

    aggregates: RequestHandler = (req, res) => {
        res.json(this.prices.aggregates(currencyId(req), req.query));
    };
}
