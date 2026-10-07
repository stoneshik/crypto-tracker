import { createServer } from 'node:http';
import { loadConfig } from './config/load-config';
import { createRuntime } from './runtime';

function main(): void {
    const config = loadConfig();
    const runtime = createRuntime(config);
    const server = createServer(runtime.app);
    server.requestTimeout = 30000;
    server.headersTimeout = 10000;
    server.keepAliveTimeout = 5000;
    let closing = false;

    const shutdown = async (reason: string, exitCode = 0) => {
        if (closing) {
            return;
        }
        closing = true;
        runtime.logger.info('server.stopping', { reason });
        const deadline = setTimeout(() => {
            runtime.logger.error('server.shutdown_timeout');
            server.closeAllConnections();
            process.exit(1);
        }, config.shutdownTimeoutMs);
        try {
            await Promise.all([
                new Promise<void>((resolve, reject) =>
                    server.close((error) =>
                        error && (error as NodeJS.ErrnoException).code !== 'ERR_SERVER_NOT_RUNNING'
                            ? reject(error)
                            : resolve(),
                    ),
                ),
            ]);
            runtime.db.close();
            process.exitCode = exitCode;
            runtime.logger.info('server.stopped');
        } catch {
            runtime.logger.error('server.shutdown_failed');
            process.exitCode = 1;
        } finally {
            clearTimeout(deadline);
        }
    };
    process.once('SIGINT', () => {
        void shutdown('SIGINT');
    });
    process.once('SIGTERM', () => {
        void shutdown('SIGTERM');
    });
    server.on('error', () => {
        void shutdown('listen_error', 1);
    });
    server.listen(config.port, config.host, () => {
        runtime.logger.info('server.started', { host: config.host, port: config.port });
    });
}

try {
    main();
} catch (error) {
    // Сообщения конфигурации содержат имена параметров, но не их секретные значения
    console.error(
        JSON.stringify({
            level: 'error',
            event: 'server.start_failed',
            message: error instanceof Error ? error.message : 'Startup failed',
        }),
    );
    process.exitCode = 1;
}
