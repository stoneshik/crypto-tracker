import { Router, static as serveStatic } from 'express';
import { dirname, resolve } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import { ApiError } from '../errors';
import { requireEmptyBody, requireEmptyQuery } from './request-validation';

export function createSystemRouter(db: DatabaseSync): Router {
    const router = Router();
    const projectRoot = resolve(__dirname, '../..');
    const docsRoot = resolve(projectRoot, 'public/docs');
    const swaggerRoot = dirname(require.resolve('swagger-ui-dist/package.json'));
    const read = [requireEmptyBody, requireEmptyQuery];

    router.get('/health', ...read, (_req, res) => {
        try {
            db.prepare('SELECT 1').get();
        } catch {
            throw new ApiError(503, 'DATABASE_UNAVAILABLE', 'База данных недоступна');
        }
        res.json({ status: 'ok' });
    });

    router.get('/openapi.json', ...read, (_req, res) => {
        res.sendFile(resolve(projectRoot, 'openapi.json'));
    });

    router.get(['/docs', '/docs/'], ...read, (_req, res) => {
        res.sendFile(resolve(docsRoot, 'index.html'));
    });

    router.get('/docs/init.js', ...read, (_req, res) => {
        res.sendFile(resolve(docsRoot, 'init.js'));
    });

    router.use('/docs/assets', serveStatic(swaggerRoot, { index: false, dotfiles: 'deny' }));
    return router;
}
