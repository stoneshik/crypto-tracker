const { createTestContext, TEST_TIME } = require('../support/test-context.cjs');
const { savePrice, quoteBatch } = require('../support/prices.cjs');

describe('Persistent background operations', () => {
    let context;
    let provider;

    beforeEach(() => {
        provider = { fetchQuotes: jest.fn().mockResolvedValue(quoteBatch()) };
        context = createTestContext({
            env: { SYNC_ENABLED: 'false', CLEANUP_BATCH_SIZE: '1' },
            provider,
        });
    });

    afterEach(async () => {
        await context.dispose();
    });
    it('executes a queued job after a restart', async () => {
        const job = context.operations.createSynchronization({ selection: { scope: 'all' } });

        await context.restart();
        await context.worker.runOnce();

        expect(context.operations.getSynchronization(job.id)).toMatchObject({
            status: 'succeeded',
            succeededCount: 2,
        });
    });

    it('marks interrupted items failed and preserves completed items on restart', async () => {
        const job = context.operations.createSynchronization({ selection: { scope: 'all' } });
        context.operationRepository.start(job.id, TEST_TIME);
        context.operationRepository.completeItem(job.id, 1, TEST_TIME);

        await context.restart();

        const recovered = context.operations.getSynchronization(job.id);
        expect(recovered).toMatchObject({
            status: 'partially_succeeded',
            succeededCount: 1,
            failedCount: 1,
        });
        expect(recovered.items[1].error.code).toBe('OPERATION_INTERRUPTED');
        expect(provider.fetchQuotes).not.toHaveBeenCalled();
    });

    it('preserves committed deletion counts after interruption', async () => {
        savePrice(context, { receivedAt: TEST_TIME - 1000 });
        savePrice(context, { receivedAt: TEST_TIME - 2000 });
        const job = context.operations.createDeletion({
            selection: { scope: 'all' },
            from: new Date(TEST_TIME - 10000).toISOString(),
            to: new Date(TEST_TIME).toISOString(),
        });
        context.operationRepository.start(job.id, TEST_TIME);
        context.operationRepository.deleteBatch(
            context.operationRepository.get(job.id, 'deletion'),
            1,
        );

        await context.restart();

        expect(context.operations.getDeletion(job.id)).toMatchObject({
            status: 'failed',
            deletedRows: 1,
            error: { code: 'OPERATION_INTERRUPTED' },
        });
        expect(context.db.prepare('SELECT COUNT(*) AS count FROM price_history').get().count).toBe(
            1,
        );
    });

    it('aborts an in-flight manual synchronization on stop', async () => {
        let signal;
        provider.fetchQuotes.mockImplementation((_ids, value) => {
            signal = value;
            return new Promise((_resolve, reject) =>
                value.addEventListener('abort', () => reject(value.reason), { once: true }),
            );
        });
        const job = context.operations.createSynchronization({ selection: { scope: 'all' } });
        const running = context.worker.runOnce();

        await context.worker.stop();
        await running;

        expect(signal.aborted).toBe(true);
        expect(context.operations.getSynchronization(job.id)).toMatchObject({
            status: 'failed',
            failedCount: 2,
        });
        expect(context.operations.getSynchronization(job.id).items[0].error.code).toBe(
            'OPERATION_INTERRUPTED',
        );
        expect(context.currencyRepository.get(1).syncing).toBe(0);
    });

    it('preserves database settings and a deleted currency across restarts', async () => {
        context.settings.update({ defaultRetentionPolicy: { mode: 'forever' } });
        context.currencyRepository.update(
            1,
            {
                trackingEnabled: false,
                pollingIntervalSeconds: 600,
                retentionPolicy: { mode: 'days', days: 7 },
            },
            TEST_TIME,
        );
        context.currencyRepository.delete(2);

        await context.restart();

        expect(context.settings.get().defaultRetentionPolicy).toEqual({ mode: 'forever' });
        expect(context.currencyRepository.get(1)).toMatchObject({
            tracking_enabled: 0,
            polling_interval_seconds: 600,
            retention_days: 7,
        });
        expect(context.currencyRepository.find(2)).toBeUndefined();
    });

    it('rejects an empty target set', async () => {
        context.currencyRepository.delete(1);
        context.currencyRepository.delete(2);

        expect(() =>
            context.operations.createSynchronization({ selection: { scope: 'all' } }),
        ).toThrow(expect.objectContaining({ status: 422 }));
    });
});
