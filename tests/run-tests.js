const { spawn } = require('child_process');
const { limits, runCommand, stopProcessTree } = require('./test-support');
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

function waitForServer(child, baseUrl, timeout) {
    return new Promise((resolve, reject) => {
        const deadline = Date.now() + timeout;
        const attempt = () => {
            if (child && child.exitCode !== null) {
                reject(new Error(`HealthLogger exited before startup with code ${child.exitCode}`));
                return;
            }
            const request = http.get(baseUrl, response => {
                response.resume();
                if (response.statusCode === 200) resolve();
                else reject(new Error(`HealthLogger returned HTTP ${response.statusCode}`));
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
    stopProcessTree(child.pid);
}

async function main() {
    if (testFiles.length === 0) throw new Error('No tests/*.test.js harnesses were found');

    const startedAt = Date.now();
    const baseUrl = process.env.HEALTH_LOGGER_URL || `http://127.0.0.1:${await getAvailablePort()}`;
    const server = process.env.HEALTH_LOGGER_URL ? null : spawn('dotnet', ['run', '--project', projectPath, '--no-launch-profile', '--no-restore', '-p:UseAppHost=false'], {
        cwd: repositoryRoot,
        detached: process.platform !== 'win32',
        env: {
            ...process.env,
            ASPNETCORE_URLS: baseUrl,
            ASPNETCORE_ENVIRONMENT: 'Development',
            DOTNET_ENVIRONMENT: 'Development'
        },
        stdio: ['ignore', 'pipe', 'pipe']
    });
    server?.stdout.pipe(process.stdout);
    server?.stderr.pipe(process.stderr);
    server?.on('error', error => console.error(`Server startup failed: ${error.message}`));

    try {
        await waitForServer(server, baseUrl, server ? limits.startup : limits.navigation);
        console.log(`Running ${testFiles.length} test harnesses against ${baseUrl}`);
        console.log(`Limits: action ${limits.action} ms, navigation ${limits.navigation} ms, file ${limits.file} ms, suite ${limits.suite} ms`);
        let passedFiles = 0;
        for (const testFile of testFiles) {
            console.log(`\n=== ${testFile} ===`);
            const remaining = limits.suite - (Date.now() - startedAt);
            if (remaining <= 0) throw new Error(`Suite exceeded its ${limits.suite} ms execution limit`);
            const fileStartedAt = Date.now();
            const result = await runCommand(process.execPath, [path.join(__dirname, testFile)], {
                timeout: Math.min(limits.file, remaining),
                cwd: repositoryRoot,
                env: { ...process.env, HEALTH_LOGGER_URL: baseUrl },
            });
            console.log(`=== ${testFile}: exit ${result.status}, ${Date.now() - fileStartedAt} ms ===`);
            if (result.status !== 0) process.exitCode = result.status || 1;
            if (process.exitCode) break;
            passedFiles++;
        }
        console.log(`\nResult: ${passedFiles}/${testFiles.length} files passed in ${Date.now() - startedAt} ms; exit code ${process.exitCode || 0}`);
    } finally {
        if (server) stopServer(server);
    }
}

main().catch(error => {
    console.error(`FAIL: ${error.message}`);
    process.exitCode = 1;
});