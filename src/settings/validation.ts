import { object } from '../validation';
import { invalid } from '../errors';
import type { RetentionPolicy, DefaultRetentionPolicy } from './types';

export function parseRetention(value: unknown, allowInherit: false): DefaultRetentionPolicy;
export function parseRetention(value: unknown, allowInherit?: true): RetentionPolicy;
export function parseRetention(value: unknown, allowInherit = true): RetentionPolicy {
    const input = object(value, ['mode', 'days']);
    if (input.mode === 'days') {
        if (
            typeof input.days !== 'number' ||
            !Number.isSafeInteger(input.days) ||
            input.days < 1 ||
            input.days > 3650
        ) {
            throw invalid('days', 'body', 'От 1 до 3650 дней');
        }
        return { mode: 'days', days: input.days };
    }
    if (
        input.days !== undefined ||
        (input.mode !== 'forever' && !(allowInherit && input.mode === 'inherit'))
    ) {
        throw invalid('retentionPolicy', 'body', 'Ожидается days, forever или допустимый inherit');
    }
    return { mode: input.mode as 'forever' | 'inherit' };
}
