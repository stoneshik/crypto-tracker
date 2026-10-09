import type { DatabaseSync } from 'node:sqlite';
import type { Config } from '../config/types';
import { CurrencyRepository } from '../currencies/repository';
import type { CurrencyRow } from '../currencies/types';
import { transaction } from '../database';
import { UpstreamError } from '../errors';
import type { QuoteProvider } from '../integrations/coinmarketcap/types';
import { OperationRepository } from '../operations/repository';
import { PriceRepository } from '../prices/repository';

export class SynchronizationService {
    constructor(
        private readonly db: DatabaseSync,
        private readonly currencies: CurrencyRepository,
        private readonly prices: PriceRepository,
        private readonly operations: OperationRepository,
        private readonly provider: QuoteProvider,
        private readonly config: Config,
        private readonly clock: () => number = Date.now,
    ) {}

    async synchronize(
        rows: CurrencyRow[],
        signal: AbortSignal,
        operationId?: string,
    ): Promise<void> {
        if (!rows.length) {
            return;
        }
        this.currencies.markStarted(rows, this.clock());
        try {
            const result = await this.provider.fetchQuotes(
                rows.map((row) => row.cmc_id),
                signal,
            );
            signal.throwIfAborted();
            const quotes = new Map(result.quotes.map((quote) => [quote.cmcId, quote]));
            for (const row of rows) {
                const now = this.clock();
                const quote = quotes.get(row.cmc_id);
                const error =
                    result.errors.get(row.cmc_id) ??
                    new UpstreamError('QUOTE_MISSING', 'Котировка отсутствует');
                // Итог задания и котировка фиксируются вместе, чтобы перезапуск не разделил их.
                transaction(this.db, () => {
                    if (quote) {
                        this.prices.saveQuote(row.id, quote, now);
                        if (operationId) {
                            this.operations.completeItem(operationId, row.id, now);
                        }
                    } else {
                        this.currencies.fail(
                            row.id,
                            error,
                            now,
                            this.config.syncErrorBackoffSeconds,
                        );
                        if (operationId) {
                            this.operations.completeItem(operationId, row.id, now, error);
                        }
                    }
                });
            }
        } catch (error) {
            if (signal.aborted) {
                throw error;
            }
            const failure =
                error instanceof UpstreamError
                    ? error
                    : new UpstreamError('INTERNAL_ERROR', 'Не удалось обновить котировки');
            for (const row of rows) {
                transaction(this.db, () => {
                    this.currencies.fail(
                        row.id,
                        failure,
                        this.clock(),
                        this.config.syncErrorBackoffSeconds,
                    );
                    if (operationId) {
                        this.operations.completeItem(operationId, row.id, this.clock(), failure);
                    }
                });
            }
        } finally {
            this.currencies.clearRunning(rows);
        }
    }
}
