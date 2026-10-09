import { setImmediate as yieldToRequests } from 'node:timers/promises';
import { AuthRepository } from '../auth/repository';
import type { Config } from '../config/types';
import { CurrencyRepository } from '../currencies/repository';
import { OperationRepository } from '../operations/repository';
import type { OperationRow } from '../operations/types';
import { PriceRepository } from '../prices/repository';
import type { Logger } from '../types';
import { SynchronizationService } from './synchronization.service';

export class SyncWorker {
    private timer: NodeJS.Timeout | undefined;
    private running: Promise<void> | undefined;
    private readonly controller = new AbortController();
    private started = false;
    private stopping = false;
    private lastCleanup = -Infinity;

    constructor(
        private readonly currencies: CurrencyRepository,
        private readonly auth: AuthRepository,
        private readonly operations: OperationRepository,
        private readonly prices: PriceRepository,
        private readonly synchronization: SynchronizationService,
        private readonly config: Config,
        private readonly logger: Logger,
        private readonly clock: () => number = Date.now,
    ) {}

    start(): void {
        if (this.started || this.stopping) {
            return;
        }
        this.started = true;
        this.schedule(0);
    }

    private schedule(ms: number): void {
        if (this.stopping) {
            return;
        }
        this.timer = setTimeout(() => {
            void this.runOnce()
                .catch(() => this.logger.error('worker.failed', { code: 'INTERNAL_ERROR' }))
                .finally(() => this.schedule(this.config.syncTickMs));
        }, ms);
    }

    runOnce(): Promise<void> {
        if (this.stopping) {
            return Promise.resolve();
        }
        if (this.running) {
            return this.running;
        }
        this.running = this.cycle().finally(() => {
            this.running = undefined;
        });
        return this.running;
    }

    private async cycle(): Promise<void> {
        const now = this.clock();
        if (now - this.lastCleanup >= this.config.cleanupIntervalSeconds * 1000) {
            this.auth.cleanup(now);
            while (
                !this.stopping &&
                this.prices.deleteExpired(now, this.config.cleanupBatchSize) ===
                    this.config.cleanupBatchSize
            ) {
                await yieldToRequests();
            }
            this.lastCleanup = now;
        }
        if (this.stopping) {
            return;
        }
        const job = this.operations.next();
        if (job) {
            await this.execute(job);
        }
        if (!this.stopping && this.config.syncEnabled) {
            try {
                await this.synchronization.synchronize(
                    this.currencies.due(this.clock()),
                    this.controller.signal,
                );
            } catch (error) {
                if (!this.stopping) {
                    throw error;
                }
            }
        }
    }

    private async execute(job: OperationRow): Promise<void> {
        this.operations.start(job.id, this.clock());
        try {
            if (job.kind === 'synchronization') {
                const rows = this.operations
                    .items(job.id)
                    .map((item) => this.currencies.get(item.cryptocurrency_id));
                await this.synchronization.synchronize(rows, this.controller.signal, job.id);
                this.controller.signal.throwIfAborted();
                this.operations.finishSynchronization(job.id, this.clock());
            } else {
                while (true) {
                    this.controller.signal.throwIfAborted();
                    if (
                        this.operations.deleteBatch(job, this.config.cleanupBatchSize) <
                        this.config.cleanupBatchSize
                    ) {
                        break;
                    }
                    await yieldToRequests();
                }
                this.operations.finishDeletion(job.id, this.clock());
            }
        } catch {
            this.operations.fail(
                job,
                this.stopping
                    ? {
                          code: 'OPERATION_INTERRUPTED',
                          message: 'Выполнение прервано остановкой сервера',
                      }
                    : { code: 'INTERNAL_ERROR', message: 'Не удалось выполнить задание' },
                this.clock(),
            );
        }
    }

    async stop(): Promise<void> {
        this.stopping = true;
        if (this.timer) {
            clearTimeout(this.timer);
        }
        this.controller.abort(new Error('Server shutdown'));
        await this.running;
    }
}
