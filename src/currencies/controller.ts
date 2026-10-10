import type { RequestHandler } from 'express';
import { currencyId } from '../http/parameters';
import { CurrencyService } from './service';

export class CurrencyController {
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
