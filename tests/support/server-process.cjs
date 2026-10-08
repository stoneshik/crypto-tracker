const { spawn } = require('node:child_process');
const { createServer } = require('node:net');
const { resolve } = require('node:path');

async function freePort() {
    const server = createServer();
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const port = server.address().port;
    await new Promise((resolve) => server.close(resolve));
    return port;
}

function start(env) {
    const child = spawn(process.execPath, ['dist/server.js'], {
        cwd: resolve(__dirname, '../..'),
        env: { ...process.env, ...env },
        stdio: ['ignore', 'pipe', 'pipe'],
    });
    const exited = new Promise((resolve) =>
        child.once('exit', (code, signal) => resolve({ code, signal })),
    );
    const ready = new Promise((resolve, reject) => {
        let output = '';
        const timer = setTimeout(() => {
            child.kill('SIGKILL');
            reject(new Error('Server startup timeout'));
        }, 5000);
        child.stdout.on('data', (data) => {
            output += data;
            if (output.includes('"event":"server.started"')) {
                clearTimeout(timer);
                resolve();
            }
        });
        child.once('error', (error) => {
            clearTimeout(timer);
            reject(error);
        });
        child.once('exit', () => {
            clearTimeout(timer);
            reject(new Error('Server exited before startup'));
        });
    });
    return { child, ready, exited };
}

module.exports = { freePort, start };
