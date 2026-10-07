const { readFileSync, writeFileSync } = require('node:fs');
const { randomBytes } = require('node:crypto');
const { resolve } = require('node:path');

const root = resolve(__dirname, '..');
const contents = readFileSync(resolve(root, '.env.example'), 'utf8')
    .replace(/^JWT_SECRET=$/m, `JWT_SECRET=${randomBytes(32).toString('base64url')}`)
    .replace(/^SERVICE_API_KEY=$/m, `SERVICE_API_KEY=ctk_${randomBytes(32).toString('base64url')}`);
try {
    writeFileSync(resolve(root, '.env'), contents, { flag: 'wx', mode: 0o600 });
    console.log(
        '.env создан. Укажите CMC_API_KEY; для запуска без опроса установите SYNC_ENABLED=false.',
    );
} catch (error) {
    if (error.code !== 'EEXIST') {
        throw error;
    }
    console.log('.env уже существует, изменения не внесены.');
}
