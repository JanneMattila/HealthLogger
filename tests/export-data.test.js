const { chromium } = require('playwright');
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const baseUrl = process.env.HEALTH_LOGGER_URL || 'http://localhost:5188';
function assert(condition, message) {
    if (!condition) throw new Error(message);
    console.log(`PASS: ${message}`);
}

(async () => {
    const backend = spawnSync('dotnet', ['run', '--project', path.join(__dirname, 'ExportChecks'),
        '--configuration', 'Release', '-p:UseAppHost=false'], { encoding: 'utf8' });
    if (backend.error) throw backend.error;
    if (backend.status !== 0) throw new Error(backend.stdout + backend.stderr);
    const lines = backend.stdout.trim().split(/\r?\n/);
    console.log(lines.filter(line => line.startsWith('PASS:')).join('\n'));
    const { text } = JSON.parse(lines.at(-1));
    const browser = await chromium.launch({ headless: true });
    try {
        const context = await browser.newContext({ serviceWorkers: 'block', viewport: { width: 390, height: 844 } });
        const page = await context.newPage();
        await page.goto(baseUrl);
        await page.locator('#welcome-dialog').waitFor({ state: 'visible' });
        await page.evaluate(() => {
            API.getPreferences = async () => ({});
            API.getDashboard = async () => ({});
            window.app.init();
            window.app.navigate('preferences');
        });
        const button = page.locator('#btn-export-data');
        await button.waitFor();
        assert(await button.getAttribute('type') === 'button', 'export does not submit Preferences');
        let releaseExport;
        const pendingExport = new Promise(resolve => { releaseExport = resolve; });
        await page.route('**/api/reports/export', async route => {
            await pendingExport;
            await route.fulfill({ contentType: 'text/plain; charset=utf-8', body: text });
        });
        await button.click();
        assert(await button.isDisabled(), 'export disables repeated downloads while loading');
        const downloadPromise = page.waitForEvent('download');
        releaseExport();
        const download = await downloadPromise;
        assert(/^HealthLogger-data-\d{4}-\d{2}-\d{2}\.txt$/.test(download.suggestedFilename()), 'export downloads a dated text file');
        assert(fs.readFileSync(await download.path(), 'utf8') === text, 'download preserves all backend export bytes');
        await page.waitForFunction(() => !document.getElementById('btn-export-data').disabled);
        assert(await page.evaluate(() => window.app.currentPage) === 'preferences', 'export keeps Preferences open');
        await page.unroute('**/api/reports/export');
        await page.route('**/api/reports/export', route => route.fulfill({ status: 500 }));
        await button.click();
        await page.locator('.toast.error').waitFor();
        assert(await button.isEnabled(), 'failed export re-enables the button for retry');
        await page.unroute('**/api/reports/export');
        await page.route('**/api/reports/export', route => route.fulfill({ status: 200, contentType: 'text/html', body: '<html>Sign in</html>' }));
        const rejectedHtml = await page.evaluate(async () => {
            try { await API.exportData(); return false; } catch { return true; }
        });
        assert(rejectedHtml, 'login HTML cannot be downloaded as health data');
        await page.unroute('**/api/reports/export');
        await page.route('**/api/reports/export', route => route.fulfill({ status: 401 }));
        await button.click();
        await page.locator('#welcome-dialog').waitFor({ state: 'visible' });
        assert(await page.locator('#welcome-dialog').isVisible(), 'expired session returns to sign-in');
    } finally {
        await browser.close();
    }
})().catch(error => {
    console.error(`FAIL: ${error.message}`);
    process.exitCode = 1;
});