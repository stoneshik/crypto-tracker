import type { RequestHandler } from 'express';
import { SettingsService } from './service';

export class SettingsController {
    constructor(private readonly settings: SettingsService) {}

    get: RequestHandler = (_req, res) => {
        res.json(this.settings.get());
    };

    update: RequestHandler = (req, res) => {
        res.json(this.settings.update(req.body));
    };
}
