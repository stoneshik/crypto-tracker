import { setImmediate as yieldToRequests } from 'node:timers/promises';
import type { Config } from '../config/types';
import { CurrencyRepository } from '../currencies/repository';
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

    async stop(): Promise<void> {
        this.stopping = true;
        if (this.timer) {
            clearTimeout(this.timer);
        }
        this.controller.abort(new Error('Server shutdown'));
        await this.running;
    }
}
