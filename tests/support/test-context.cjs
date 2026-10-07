const { mkdtempSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const request = require('supertest');
const { loadConfig } = require('../../dist/config/load-config');
const { createRuntime } = require('../../dist/runtime');
const { testEnvironment } = require('./config.cjs');

const TEST_TIME = Date.parse('2026-10-08T12:00:00.000Z');

function createTestContext({ env = {}, provider, catalogProvider } = {}) {
    const directory = mkdtempSync(join(tmpdir(), 'crypto-tracker-'));
    try {
        const environment = testEnvironment({ ...env, DB_PATH: join(directory, 'test.sqlite') });
        const config = loadConfig(environment);
        let now = TEST_TIME;
        let runtime = createRuntime(config, { clock: () => now, provider, catalogProvider });
        const context = {
            ...runtime,
            config,
            environment,
            http: request(runtime.app),
            serviceAuthorization: `Bearer ${config.serviceApiKey}`,
            clock: {
                now: () => now,

                set(value) {
                    now = value;
                },

                advanceBy(milliseconds) {
                    now += milliseconds;
                },
            },

            async restart() {
                runtime.cancelRequests();
                await runtime.worker.stop();
                runtime.db.close();
                runtime = createRuntime(config, { clock: () => now, provider, catalogProvider });
                Object.assign(context, runtime);
                context.http = request(runtime.app);
            },

            async dispose() {
                runtime.cancelRequests();
                await runtime.worker.stop();
                runtime.db.close();
                rmSync(directory, { recursive: true, force: true });
            },
        };
        return context;
    } catch (error) {
        rmSync(directory, { recursive: true, force: true });
        throw error;
    }
}

module.exports = { createTestContext, TEST_TIME };
