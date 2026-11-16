const { chromium } = require('./test-support');

const baseUrl = process.env.HEALTH_LOGGER_URL || 'http://localhost:5188';

function assert(condition, message) {
    if (!condition) throw new Error(message);
    console.log(`PASS: ${message}`);
}

// Simulates the server side of favorites sync: GET/PUT /api/user/favorites with ETag/304
// and X-Favorites-Version on other API responses.
async function mockFavoritesServer(page, initial) {
    const server = { ...initial, gets: [], puts: [] };
    await page.route('**/api/user/favorites', async route => {
        const request = route.request();
        const headers = { 'X-Favorites-Version': String(server.version), ETag: `"${server.version}"` };
        if (request.method() === 'PUT') {
            server.favorites = JSON.parse(request.postData()).favorites;
            server.version++;
            server.puts.push(server.favorites);
            await route.fulfill({ status: 200, contentType: 'application/json',
                headers: { 'X-Favorites-Version': String(server.version) },
                body: JSON.stringify({ version: server.version }) });
            return;
        }
        const ifNoneMatch = request.headers()['if-none-match'] || null;
        server.gets.push(ifNoneMatch);
        if (ifNoneMatch === `"${server.version}"`) {
            await route.fulfill({ status: 304, headers });
            return;
        }
        await route.fulfill({ status: 200, contentType: 'application/json', headers,
            body: JSON.stringify({ version: server.version, favorites: server.favorites }) });
    });
    await page.route('**/api/user/preferences', route => route.fulfill({
        status: 200, contentType: 'application/json',
        headers: { 'X-Favorites-Version': String(server.version) }, body: '{}'
    }));
    return server;
}

async function waitUntil(predicate, message, timeout = 3000) {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
        if (await predicate()) return;
        await new Promise(resolve => setTimeout(resolve, 50));
    }
    throw new Error(`Timed out: ${message}`);
}

async function testFavoritesSync(browser) {
    const context = await browser.newContext({ serviceWorkers: 'block' });
    const page = await context.newPage();
    try {
        await page.goto(baseUrl, { waitUntil: 'load' });
        await page.locator('#welcome-dialog').waitFor({ state: 'visible' });
        const server = await mockFavoritesServer(page, {
            version: 3,
            favorites: [{ id: 'phone-wine', type: 'drink', name: 'Phone wine', kcalPer100: 85 }]
        });
        const localFavorites = () => page.evaluate(() => app.getFavorites().map(f => f.id));
        const syncState = () => page.evaluate(() => ({
            version: localStorage.getItem('HealthLogger_favorites_version'),
            dirty: localStorage.getItem('HealthLogger_favorites_dirty')
        }));

        await page.evaluate(() => {
            localStorage.setItem('HealthLogger_favorites', JSON.stringify([
                { id: 'laptop-oats', type: 'food', name: 'Laptop oats' },
                { id: 'phone-wine', type: 'drink', name: 'Phone wine', kcalPer100: 85 }
            ]));
            app.startFavoritesSync('user-1');
        });
        await waitUntil(() => server.puts.length === 1, 'first sync uploads merged favorites');
        await waitUntil(async () => (await syncState()).version === '4', 'merged upload version stored');
        assert(JSON.stringify(server.favorites.map(f => f.id)) === '["phone-wine","laptop-oats"]'
            && JSON.stringify(await localFavorites()) === '["phone-wine","laptop-oats"]',
        'first sync merges pre-existing device favorites with server favorites without duplicates');
        assert(server.gets[0] === null && (await syncState()).dirty === null,
            'first sync downloads unconditionally and clears the pending flag after upload');

        await page.evaluate(() => API.getPreferences());
        assert(server.gets.length === 1, 'an unchanged version header on other API calls triggers no favorites request');

        server.favorites = [{ id: 'remote-wine', type: 'drink', name: 'Remote wine', kcalPer100: 85 }];
        server.version = 7;
        await page.evaluate(async () => {
            API.getDashboard = async () => ({ weeklyCalorieTrend: [] });
            API.getEntries = async () => [];
            API.getCheckin = async () => null;
            API.getLatestMetrics = async () => null;
            API.getRecipes = async () => [];
            API.getFoodCategories = async () => [];
            app.init();
            await app.navigate('drinks');
        });
        await page.evaluate(() => API.getPreferences());
        await page.getByRole('button', { name: '⭐ Remote wine', exact: true }).waitFor();
        assert(JSON.stringify(await localFavorites()) === '["remote-wine"]' && (await syncState()).version === '7',
            'a newer version header downloads favorites changed on another device and refreshes the open page');
        assert(server.gets.at(-1) === '"4"', 'downloads send the last synced version as If-None-Match');

        const getsBeforeResume = server.gets.length;
        await page.evaluate(() => app.checkFavoritesSync());
        assert(server.gets.length === getsBeforeResume,
            'resume checks are skipped when a version was seen within the throttle window');
        await page.evaluate(() => { app.lastFavoritesCheck = 0; return app.checkFavoritesSync(); });
        await waitUntil(() => server.gets.length === getsBeforeResume + 1, 'throttled resume check runs');
        await page.evaluate(() => app.favoritesPullPromise);
        assert(server.gets.at(-1) === '"7"' && JSON.stringify(await localFavorites()) === '["remote-wine"]',
            'resume check is a conditional request that keeps local favorites on 304 Not Modified');

        await page.evaluate(() => {
            app.toggleFavorite({ id: 'tap-1', name: 'Tap 1', type: 'food' });
            app.toggleFavorite({ id: 'tap-2', name: 'Tap 2', type: 'food' });
        });
        assert(server.puts.length === 1, 'star taps update locally without waiting for the network');
        await waitUntil(() => server.puts.length === 2, 'debounced upload runs');
        assert(JSON.stringify(server.favorites.map(f => f.id)) === '["remote-wine","tap-1","tap-2"]',
            'rapid star taps are batched into one upload');
        await waitUntil(async () => (await syncState()).version === '8', 'uploaded version stored');

        await page.evaluate(() => app.startFavoritesSync('user-2'));
        await page.evaluate(() => app.favoritesPullPromise);
        assert(JSON.stringify(await localFavorites()) === '["remote-wine","tap-1","tap-2"]'
            && server.puts.length === 2,
        'switching accounts replaces local favorites with the account\'s server list instead of merging');
    } finally {
        await context.close();
    }
}

(async () => {
    const browser = await chromium.launch({ headless: true });
    try {
        await testFavoritesSync(browser);
    } finally {
        await browser.close();
    }
})().catch(error => {
    console.error(`FAIL: ${error.message}`);
    process.exitCode = 1;
});
