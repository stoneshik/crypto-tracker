import type { Config } from './config/types';
import type { Logger } from './types';

export function createLogger(level: Config['logLevel']): Logger {
    return {
        info(event, data = {}) {
            if (level === 'info') {
                console.log(JSON.stringify({ level: 'info', event, ...data }));
            }
        },

        error(event, data = {}) {
            if (level !== 'silent') {
                console.error(JSON.stringify({ level: 'error', event, ...data }));
            }
        },
    };
}
