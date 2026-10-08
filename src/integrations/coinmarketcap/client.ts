import axios,{ AxiosInstance } from 'axios';
import { setTimeout as delay } from 'node:timers/promises';
import type { Config } from '../../config/types';
import { toUpstreamError } from './errors';
import { parseQuotes } from './quotes';
import type { QuoteBatch } from './types';

export class CoinMarketCapClient {

    private readonly http: AxiosInstance;

    constructor(
        private readonly config: Config,
        http?: AxiosInstance,
        private readonly clock: () => number = Date.now,
    ) {
        this.http =
            http ??
            axios.create({
                baseURL: 'https://pro-api.coinmarketcap.com',
                maxRedirects: 0,
                maxContentLength: 1024 * 1024,
                headers: { Accept: 'application/json' },
            });
    }

    async fetchQuotes(ids: number[], signal: AbortSignal): Promise<QuoteBatch> {
        const raw = await this.request(
            '/v3/cryptocurrency/quotes/latest',
            { id: ids.join(','), convert: 'USD', skip_invalid: 'true' },
            signal,
        );
        return parseQuotes(raw, ids, this.clock());
    }

    private async request(
        path: string,
        params: Record<string, string>,
        signal: AbortSignal,
    ): Promise<unknown> {
        for (let attempt = 0; ; attempt++) {
            signal.throwIfAborted();
            try {
                const response = await this.http.get<unknown>(path, {
                    params,
                    headers: { 'X-CMC_PRO_API_KEY': this.config.cmcApiKey },
                    timeout: this.config.cmcTimeoutMs,
                    maxRedirects: 0,
                    signal: AbortSignal.any([
                        signal,
                        AbortSignal.timeout(this.config.cmcTimeoutMs),
                    ]),
                });
                return response.data;
            } catch (error) {
                if (signal.aborted) {
                    throw signal.reason;
                }
                const failure = toUpstreamError(error, this.config, this.clock());
                if (!failure.retryable || attempt >= this.config.cmcMaxRetries) {
                    throw failure;
                }
                await delay(this.config.cmcRetryDelayMs * 2 ** attempt, undefined, { signal });
            }
        }
    }
}
