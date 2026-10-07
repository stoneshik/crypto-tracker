import { createHmac } from 'node:crypto';
import { invalid } from '../errors';
import { decodePart,equalSecrets,jsonPart } from '../shared/crypto';

interface CursorPosition {
    afterId: number;
    snapshotId: number;
    afterTime?: number;
}

export class CursorCodec {
    constructor(private readonly secret: string) {}

    encodeCursor(payload: Record<string, unknown>): string {
        const part = jsonPart(payload);
        const signature = createHmac('sha256', this.secret)
            .update(`cursor:${part}`)
            .digest('base64url');
        return `${part}.${signature}`;
    }

    decodeCursor(value: unknown, kind: string, filter: string): CursorPosition | undefined {
        if (value === undefined) {
            return undefined;
        }
        try {
            if (typeof value !== 'string' || value.length > 2048) {
                throw new Error('cursor');
            }
            const parts = value.split('.');
            if (parts.length !== 2 || !parts[0] || !parts[1]) {
                throw new Error('cursor');
            }
            const data = decodePart(parts[0]);
            const expected = this.encodeCursor(data);
            if (!equalSecrets(value, expected)) {
                throw new Error('signature');
            }
            if (data.v !== 1 || data.kind !== kind || data.filter !== filter) {
                throw new Error('filter');
            }
            for (const key of ['afterId', 'snapshotId']) {
                if (!Number.isSafeInteger(data[key]) || (data[key] as number) < 0) {
                    throw new Error('position');
                }
            }
            if (
                kind === 'history' &&
                (!Number.isSafeInteger(data.afterTime) || (data.afterTime as number) < 0)
            ) {
                throw new Error('time');
            }
            return {
                afterId: data.afterId as number,
                snapshotId: data.snapshotId as number,
                afterTime: kind === 'history' ? (data.afterTime as number) : undefined,
            };
        } catch {
            throw invalid('cursor', 'query', 'Некорректный курсор или другие фильтры', 400);
        }
    }
}
