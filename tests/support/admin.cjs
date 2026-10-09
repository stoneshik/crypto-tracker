const { createAdmin } = require('../../dist/auth/admin');
const { DEFAULT_USER, loginUser, bearer } = require('./users.cjs');

async function loginAdmin(context) {
    const credentials = { ...DEFAULT_USER, email: 'admin@example.com' };
    await createAdmin(context.authRepository, credentials, context.clock.now());
    const { token } = await loginUser(context, credentials);
    return bearer(token);
}

module.exports = { loginAdmin };
