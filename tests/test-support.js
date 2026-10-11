const { chromium: playwrightChromium } = require('playwright');
const { spawn, spawnSync } = require('child_process');

const limits = Object.freeze({
    action: 3000,
    navigation: 5000,
    browserLaunch: 10000,
    backend: 30000,
    startup: 45000,
    file: 60000,
    suite: 180000
});

function stopProcessTree(pid) {
    if (!pid) return;
    if (process.platform === 'win32') {
        const command = `$processes = @(Get-CimInstance Win32_Process);
            $ids = [System.Collections.Generic.List[int]]::new();
            $ids.Add(${pid});
            for ($index = 0; $index -lt $ids.Count; $index++) {
                foreach ($child in $processes) {
                    if ($child.ParentProcessId -eq $ids[$index] -and !$ids.Contains([int]$child.ProcessId)) {
                        $ids.Add([int]$child.ProcessId)
                    }
                }
            }
            Stop-Process -Id $ids.ToArray() -Force -ErrorAction SilentlyContinue`;
        const result = spawnSync('pwsh.exe', ['-NoProfile', '-NonInteractive', '-Command', command], {
            encoding: 'utf8',
            timeout: 5000
        });
        if (result.error || result.status !== 0) {
            throw new Error(`Process cleanup failed for PID ${pid}: ${result.error?.message || result.stderr}`);
        }
    } else {
        process.kill(-pid, 'SIGKILL');
    }
}

function runCommand(command, args, { timeout, captureOutput = false, ...options }) {
    return new Promise((resolve, reject) => {
        const child = spawn(command, args, {
            ...options,
            detached: process.platform !== 'win32',
            stdio: captureOutput ? ['ignore', 'pipe', 'pipe'] : 'inherit'
        });
        let stdout = '';
        let stderr = '';
        child.stdout?.on('data', data => { stdout += data; });
        child.stderr?.on('data', data => { stderr += data; });
        const timer = setTimeout(() => {
            console.error(`TIMEOUT: ${command} ${args.join(' ')} exceeded ${timeout} ms`);
            if (stdout) console.error(stdout.slice(-4000));
            if (stderr) console.error(stderr.slice(-4000));
            try {
                stopProcessTree(child.pid);
                reject(new Error(`Command exceeded its ${timeout} ms execution limit`));
            } catch (error) {
                reject(error);
            }
        }, timeout);
        child.once('error', error => {
            clearTimeout(timer);
            reject(error);
        });
        child.once('close', status => {
            clearTimeout(timer);
            resolve({ status, stdout, stderr });
        });
    });
}

const chromium = {
    async launch(options = {}) {
        const browser = await playwrightChromium.launch({ ...options, timeout: limits.browserLaunch });
        const watchdog = setTimeout(() => {
            console.error(`TIMEOUT: browser test exceeded ${limits.file} ms`);
            process.exitCode = 1;
            const forceExit = setTimeout(() => process.exit(1), 2000);
            browser.close().then(() => {
                clearTimeout(forceExit);
                process.exit(1);
            }, error => {
                console.error(`Browser timeout cleanup failed: ${error.message}`);
                process.exit(1);
            });
        }, limits.file);
        watchdog.unref();
        browser.once('disconnected', () => clearTimeout(watchdog));
        const newContext = browser.newContext.bind(browser);
        browser.newContext = async contextOptions => {
            const context = await newContext(contextOptions);
            context.setDefaultTimeout(limits.action);
            context.setDefaultNavigationTimeout(limits.navigation);
            return context;
        };
        return browser;
    }
};

module.exports = { chromium, limits, runCommand, stopProcessTree };
