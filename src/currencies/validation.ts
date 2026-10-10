import { invalid } from '../errors';
import { object } from '../validation';
import { parseRetention } from '../settings/validation';
import type { CurrencyCreate, CurrencyUpdate, CurrencySelection } from './types';

function bodyInteger(value: unknown, name: string, min = 1, max = Number.MAX_SAFE_INTEGER): number {
    if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < min || value > max) {
        throw invalid(name, 'body', `Ожидается целое число от ${min} до ${max}`);
    }
    return value;
}

function changes(input: Record<string, unknown>): CurrencyUpdate {
    const result: CurrencyUpdate = {};
    if (input.trackingEnabled !== undefined) {
        if (typeof input.trackingEnabled !== 'boolean') {
            throw invalid('trackingEnabled', 'body', 'Ожидается boolean');
        }
        result.trackingEnabled = input.trackingEnabled;
    }
    if (input.pollingIntervalSeconds !== undefined) {
        result.pollingIntervalSeconds = bodyInteger(
            input.pollingIntervalSeconds,
            'pollingIntervalSeconds',
            60,
            86400,
        );
    }
    if (input.retentionPolicy !== undefined) {
        result.retentionPolicy = parseRetention(input.retentionPolicy);
    }
    return result;
}

export function parseCurrencyCreate(value: unknown, defaultInterval: number): CurrencyCreate {
    const input = object(value, [
        'cmcId',
        'trackingEnabled',
        'pollingIntervalSeconds',
        'retentionPolicy',
    ]);
    return {
        cmcId: bodyInteger(input.cmcId, 'cmcId'),
        trackingEnabled: true,
        pollingIntervalSeconds: defaultInterval,
        retentionPolicy: { mode: 'inherit' },
        ...changes(input),
    };
}

export function parseCurrencyUpdate(value: unknown): CurrencyUpdate {
    const input = object(value, ['trackingEnabled', 'pollingIntervalSeconds', 'retentionPolicy']);
    if (!Object.keys(input).length) {
        throw invalid('body', 'body', 'Укажите хотя бы одно поле');
    }
    return changes(input);
}

export function parseSelection(value: unknown): CurrencySelection {
    const input = object(value, ['scope', 'cryptocurrencyIds']);
    if (input.scope === 'all' && input.cryptocurrencyIds === undefined) {
        return { scope: 'all' };
    }
    if (
        input.scope !== 'selected' ||
        !Array.isArray(input.cryptocurrencyIds) ||
        !input.cryptocurrencyIds.length ||
        input.cryptocurrencyIds.length > 100
    ) {
        throw invalid('selection', 'body', 'Выберите все валюты или от 1 до 100 ID');
    }
    const ids = input.cryptocurrencyIds.map((id) => bodyInteger(id, 'cryptocurrencyIds'));
    if (new Set(ids).size !== ids.length) {
        throw invalid('cryptocurrencyIds', 'body', 'Повторяющиеся ID');
    }
    return { scope: 'selected', cryptocurrencyIds: ids.sort((a, b) => a - b) };
}
