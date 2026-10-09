import { parseSelection } from '../currencies/validation';
import { ApiError,invalid } from '../errors';
import { dateTime,object } from '../validation';
import { toDeletion,toSynchronization } from './mappers';
import { OperationRepository } from './repository';

export class OperationService {
    constructor(
        private readonly repository: OperationRepository,
        private readonly providerConfigured: boolean,
        private readonly clock: () => number = Date.now,
    ) {}

    createSynchronization(value: unknown) {
        const input = object(value, ['selection']);
        const selection = parseSelection(input.selection);
        if (!this.providerConfigured) {
            throw new ApiError(503, 'PROVIDER_NOT_CONFIGURED', 'Укажите CMC_API_KEY на сервере');
        }
        const row = this.repository.create('synchronization', selection, this.clock());
        return toSynchronization(row, this.repository.items(row.id));
    }

    getSynchronization(id: string) {
        return toSynchronization(
            this.repository.get(id, 'synchronization'),
            this.repository.items(id),
        );
    }

    createDeletion(value: unknown) {
        const input = object(value, ['selection', 'from', 'to']);
        const selection = parseSelection(input.selection);
        const from = dateTime(input.from, 'from', 'body');
        const to = dateTime(input.to, 'to', 'body');
        if (from >= to || to > this.clock()) {
            throw invalid(
                'to',
                'body',
                'Конец должен быть позже начала и не позже текущего времени',
            );
        }
        const row = this.repository.create('deletion', selection, this.clock(), { from, to });
        return toDeletion(row, this.repository.items(row.id));
    }

    getDeletion(id: string) {
        return toDeletion(this.repository.get(id, 'deletion'), this.repository.items(id));
    }
}
