import { createApp } from './app';
import type { Config } from './config/types';
import { openDatabase } from './database';
import { createLogger } from './logger';

export function createRuntime(config: Config) {
    const db = openDatabase(config);
    try {
        const logger = createLogger(config.logLevel);
        const app = createApp({ config, db, logger });
        return { app, db, logger };
    } catch (error) {
        db.close();
        throw error;
    }
}
