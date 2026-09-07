const { chromium } = require('playwright');

const baseUrl = process.env.HEALTH_LOGGER_URL || 'http://localhost:5188';

function assert(condition, message) {
    if (!condition) throw new Error(message);
    console.log(`PASS: ${message}`);
}

async function installDeferredRecipes(page) {
    await page.evaluate(() => {
        window.__recipeRequests = [];
        API.getRecipes = () => {
            let resolve;
            let reject;
            const request = { settled: false };
            const promise = new Promise((resolveRequest, rejectRequest) => {
                resolve = resolveRequest;
                reject = rejectRequest;
            });
            request.resolve = resolve;
            request.reject = reject;
            window.__recipeRequests.push(request);
            return promise.finally(() => { request.settled = true; });
        };
    });
}

async function startRecipesRequest(page) {
    await installDeferredRecipes(page);
    await page.evaluate(() => window.app.navigate('recipes'));
    await page.waitForFunction(() => window.__recipeRequests.length === 1);
}

async function settleRequest(page, index, outcome, value) {
    await page.evaluate(({ index, outcome, value }) => {
        window.__recipeRequests[index][outcome](value);
    }, { index, outcome, value });
    await page.waitForFunction(requestIndex => window.__recipeRequests[requestIndex].settled, index);
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}

(async () => {
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ serviceWorkers: 'block' });
    const page = await context.newPage();

    try {
        await page.goto(baseUrl, { waitUntil: 'load' });
        await page.locator('#welcome-dialog').waitFor({ state: 'visible' });
        await page.evaluate(() => window.app.init());

        await startRecipesRequest(page);
        const pending = await page.locator('#recipe-list').evaluate(list => {
            const loading = list.querySelector('.recipe-loading');
            const spinner = loading?.querySelector('.spinner-small');
            return {
                loadingCount: list.querySelectorAll('.recipe-loading').length,
                text: loading?.textContent.trim(),
                expectedText: window.i18n.t('loading'),
                role: loading?.getAttribute('role'),
                live: loading?.getAttribute('aria-live'),
                spinnerHidden: spinner?.getAttribute('aria-hidden'),
                busy: list.getAttribute('aria-busy'),
                listHeight: list.getBoundingClientRect().height,
                loadingHeight: loading?.getBoundingClientRect().height
            };
        });
        assert(pending.loadingCount === 1, 'pending request shows one loading indicator');
        assert(pending.text === pending.expectedText, 'loading text is localized');
        assert(pending.role === 'status' && pending.live === 'polite', 'loading status is announced politely');
        assert(pending.spinnerHidden === 'true' && pending.busy === 'true', 'spinner is decorative and list is busy');
        assert(
            pending.listHeight >= 190 && pending.loadingHeight >= 190,
            `loading state reserves layout height (list=${pending.listHeight}, loading=${pending.loadingHeight})`
        );

        await settleRequest(page, 0, 'resolve', [{ id: 'recipe-1', name: 'Loaded recipe', ingredients: [], customCalories: 100 }]);
        assert(await page.locator('.recipe-table-row').count() === 1, 'success renders the recipe table');
        assert(await page.locator('.recipe-loading').count() === 0 && await page.locator('#recipe-list').getAttribute('aria-busy') === null, 'success clears loading state');

        await startRecipesRequest(page);
        await settleRequest(page, 0, 'resolve', []);
        assert((await page.locator('#recipe-list').textContent()).trim() === await page.evaluate(() => window.i18n.t('no_recipes')), 'empty completion shows localized empty state');
        assert(await page.locator('.recipe-loading').count() === 0 && await page.locator('#recipe-list').getAttribute('aria-busy') === null, 'empty completion clears loading state');

        await startRecipesRequest(page);
        await settleRequest(page, 0, 'reject', 'load failed');
        assert((await page.locator('#recipe-list').textContent()).trim() === await page.evaluate(() => window.i18n.t('error_loading_recipes')), 'error completion shows localized error state');
        assert(await page.locator('.recipe-loading').count() === 0 && await page.locator('#recipe-list').getAttribute('aria-busy') === null, 'error completion clears loading state');

        await startRecipesRequest(page);
        await page.evaluate(() => window.app.navigate('dashboard'));
        await settleRequest(page, 0, 'resolve', [{ id: 'stale', name: 'Stale recipe', ingredients: [] }]);
        assert(await page.locator('.dashboard').count() === 1, 'navigation destination remains intact after stale completion');
        assert(await page.locator('#recipe-list, .recipe-loading').count() === 0, 'navigation removes stale loading UI');

        await startRecipesRequest(page);
        await page.evaluate(() => { API.createRecipe = async () => ({ id: 'created' }); });
        await page.locator('#btn-new-recipe').click();
        await page.locator('#recipe-form [name="name"]').fill('Created recipe');
        await page.locator('#recipe-form [name="customCalories"]').fill('100');
        await page.locator('#recipe-form').evaluate(form => form.requestSubmit());
        await page.waitForFunction(() => window.__recipeRequests.length === 2);
        await settleRequest(page, 1, 'resolve', [{ id: 'newer', name: 'Newer recipe', ingredients: [], customCalories: 100 }]);
        await page.locator('.recipe-table-row', { hasText: 'Newer recipe' }).waitFor();
        await settleRequest(page, 0, 'resolve', [{ id: 'older', name: 'Older recipe', ingredients: [], customCalories: 100 }]);
        assert(await page.locator('.recipe-table-row', { hasText: 'Newer recipe' }).count() === 1, 'newer request result wins an out-of-order race');
        assert(await page.getByText('Older recipe', { exact: true }).count() === 0, 'stale request cannot replace newer content');
    } finally {
        await browser.close();
    }
})().catch(error => {
    console.error(`FAIL: ${error.message}`);
    process.exitCode = 1;
});