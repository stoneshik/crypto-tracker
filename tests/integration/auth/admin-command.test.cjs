const { spawnSync } = require('node:child_process');
const { resolve } = require('node:path');
const { createTestContext } = require('../../support/test-context.cjs');
const { DEFAULT_USER, loginUser, bearer } = require('../../support/users.cjs');

describe('Administrator creation command', () => {
    let context;

    beforeEach(() => {
        context = createTestContext({ env: { SYNC_ENABLED: 'false' } });
    });

    afterEach(async () => {
        await context.dispose();
    });

    function runAdmin(environment) {
        return spawnSync(process.execPath, ['dist/commands/create-admin.js'], {
            cwd: resolve(__dirname, '../../..'),
            env: {
                ...process.env,
                ...context.environment,
                ADMIN_EMAIL: '',
                ADMIN_PASSWORD: '',
                ...environment,
            },
            encoding: 'utf8',
        });
    }

    it('creates an administrator who can log in and read settings', async () => {
        const result = runAdmin({
            ADMIN_EMAIL: 'admin@example.com',
            ADMIN_PASSWORD: DEFAULT_USER.password,
        });

        expect(result.status).toBe(0);
        expect(result.stdout).not.toContain(DEFAULT_USER.password);
        const { token, response } = await loginUser(context, {
            ...DEFAULT_USER,
            email: 'admin@example.com',
        });
        expect(response.body.user.role).toBe('ADMIN');
        await context.http.get('/api/v1/settings').set('Authorization', bearer(token)).expect(200);
    });

    it('fails when credentials are missing', () => {
        const result = runAdmin({});

        expect(result.status).toBe(1);
        expect(context.db.prepare('SELECT COUNT(*) AS count FROM users').get().count).toBe(0);
    });

    it('does not overwrite an existing account', () => {
        const environment = {
            ADMIN_EMAIL: 'admin@example.com',
            ADMIN_PASSWORD: DEFAULT_USER.password,
        };
        expect(runAdmin(environment).status).toBe(0);
        const originalHash = context.authRepository.findUser(environment.ADMIN_EMAIL).password_hash;

        expect(runAdmin({ ...environment, ADMIN_PASSWORD: 'another strong password' }).status).toBe(
            1,
        );

        expect(context.authRepository.findUser(environment.ADMIN_EMAIL).password_hash).toBe(
            originalHash,
        );
    });
});
