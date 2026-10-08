const DEFAULT_USER = { email: 'reader@example.com', password: 'correct horse battery staple' };
const bearer = (token) => `Bearer ${token}`;

function refreshCookie(response) {
    const cookie = response.headers['set-cookie']?.find((value) =>
        value.startsWith('refresh_token='),
    );
    if (!cookie) {
        throw new Error('Response did not set a refresh cookie');
    }
    return cookie.split(';')[0];
}

async function registerUser(context, overrides = {}) {
    const credentials = { ...DEFAULT_USER, ...overrides };
    const response = await context.http.post('/api/v1/users').send(credentials).expect(201);
    return { credentials, user: response.body };
}

async function loginUser(context, credentials = DEFAULT_USER) {
    const response = await context.http.post('/api/v1/auth/sessions').send(credentials).expect(201);
    return { token: response.body.accessToken, cookie: refreshCookie(response), response };
}

async function registerAndLogin(context, overrides = {}) {
    const { credentials } = await registerUser(context, overrides);
    return loginUser(context, credentials);
}

module.exports = { DEFAULT_USER, bearer, refreshCookie, registerUser, loginUser, registerAndLogin };
