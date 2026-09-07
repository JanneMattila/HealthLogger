const { spawn, spawnSync } = require('child_process');
const fs = require('fs');
const http = require('http');
const net = require('net');
const path = require('path');

const repositoryRoot = path.resolve(__dirname, '..');
const projectPath = path.join(repositoryRoot, 'HealthLogger', 'HealthLogger.csproj');
const testFiles = fs.readdirSync(__dirname, { withFileTypes: true })
    .filter(entry => entry.isFile() && entry.name.endsWith('.test.js'))
    .map(entry => entry.name)
    .sort((left, right) => left.localeCompare(right, 'en'));

function getAvailablePort() {
    return new Promise((resolve, reject) => {
        const server = net.createServer();
        server.once('error', reject);
        server.listen(0, '127.0.0.1', () => {
            const { port } = server.address();
            server.close(error => error ? reject(error) : resolve(port));
        });
    });
}

function waitForServer(child, baseUrl) {
    return new Promise((resolve, reject) => {
        const deadline = Date.now() + 60000;
        const attempt = () => {
            if (child.exitCode !== null) {
                reject(new Error(`HealthLogger exited before startup with code ${child.exitCode}`));
                return;
            }
            const request = http.get(baseUrl, response => {
                response.resume();
                resolve();
            });
            request.on('error', () => {
                if (Date.now() >= deadline) reject(new Error('Timed out waiting for HealthLogger to start'));
                else setTimeout(attempt, 100);
            });
            request.setTimeout(1000, () => request.destroy());
        };
        attempt();
    });
}

function stopServer(child) {
    if (!child.pid || child.exitCode !== null) return;
    if (process.platform === 'win32') {
        spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
    } else {
        child.kill('SIGTERM');
    }
}

async function main() {
    if (testFiles.length === 0) throw new Error('No tests/*.test.js harnesses were found');

    const port = await getAvailablePort();
    const baseUrl = `http://127.0.0.1:${port}`;
    const server = spawn('dotnet', ['run', '--project', projectPath, '--no-launch-profile'], {
        cwd: repositoryRoot,
        env: {
            ...process.env,
            ASPNETCORE_URLS: baseUrl,
            ASPNETCORE_ENVIRONMENT: 'Development',
            DOTNET_ENVIRONMENT: 'Development'
        },
        stdio: ['ignore', 'pipe', 'pipe']
    });
    server.stdout.pipe(process.stdout);
    server.stderr.pipe(process.stderr);

    try {
        await waitForServer(server, baseUrl);
        console.log(`Running ${testFiles.length} test harnesses against ${baseUrl}`);
        for (const testFile of testFiles) {
            console.log(`\n=== ${testFile} ===`);
            const result = spawnSync(process.execPath, [path.join(__dirname, testFile)], {
                cwd: repositoryRoot,
                env: { ...process.env, HEALTH_LOGGER_URL: baseUrl },
                stdio: 'inherit'
            });
            if (result.error) throw result.error;
            if (result.status !== 0) process.exitCode = result.status || 1;
            if (process.exitCode) break;
        }
    } finally {
        stopServer(server);
    }
}

main().catch(error => {
    console.error(`FAIL: ${error.message}`);
    process.exitCode = 1;
});