const { mkdtempSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { DEFAULT_USER } = require('../../support/users.cjs');
const { freePort, start } = require('../../support/server-process.cjs');

describe('Server shutdown and restart', () => {
    it.each(['SIGTERM', 'SIGINT'])(
        '%s stops the HTTP server; user and session survive restart',
        async (signal) => {
            const directory = mkdtempSync(join(tmpdir(), 'crypto-lifecycle-'));
            const port = await freePort();
            const env = {
                NODE_ENV: 'test',
                HOST: '127.0.0.1',
                PORT: String(port),
                LOG_LEVEL: 'info',
                JWT_SECRET: 'test-secret-with-at-least-thirty-two-bytes',
                DB_PATH: join(directory, 'test.sqlite'),
                SYNC_ENABLED: 'false',
                CMC_API_KEY: '',
                SERVICE_API_KEY: '',
                TRACKED_CURRENCIES: '[]',
            };
            const url = `http://127.0.0.1:${port}`;
            let processState = start(env);
            try {
                await processState.ready;
                expect((await fetch(`${url}/health`)).status).toBe(200);
                const options = {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        email: 'persist@example.com',
                        password: DEFAULT_USER.password,
                    }),
                };
                expect((await fetch(`${url}/api/v1/users`, options)).status).toBe(201);
                const login = await fetch(`${url}/api/v1/auth/sessions`, options);
                expect(login.status).toBe(201);
                const { accessToken } = await login.json();
                processState.child.kill(signal);
                expect(await processState.exited).toEqual({ code: 0, signal: null });
                processState = start(env);
                await processState.ready;
                const me = await fetch(`${url}/api/v1/users/me`, {
                    headers: { Authorization: `Bearer ${accessToken}` },
                });
                expect(me.status).toBe(200);
                expect((await me.json()).email).toBe('persist@example.com');
                processState.child.kill(signal);
                expect(await processState.exited).toEqual({ code: 0, signal: null });
            } finally {
                if (
                    processState.child.exitCode === null &&
                    processState.child.signalCode === null
                ) {
                    processState.child.kill('SIGKILL');
                    await processState.exited;
                }
                rmSync(directory, { recursive: true, force: true });
            }
        },
    );
});
