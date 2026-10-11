const { chromium } = require('playwright');

const baseUrl = process.env.HEALTH_LOGGER_URL || 'http://localhost:5188';

function assert(condition, message) {
    if (!condition) throw new Error(message);
    console.log(`PASS: ${message}`);
}

async function testDrinkFavorites(browser, lang) {
    const context = await browser.newContext({ serviceWorkers: 'block' });
    const page = await context.newPage();
    try {
        await page.goto(baseUrl, { waitUntil: 'load' });
        await page.locator('#welcome-dialog').waitFor({ state: 'visible' });
        await page.evaluate(async language => {
            await i18n.setLang(language);
            API.getDashboard = async () => ({ weeklyCalorieTrend: [] });
            API.getEntries = async () => [];
            API.getCheckin = async () => null;
            API.getLatestMetrics = async () => null;
            API.getRecipes = async () => [];
            API.getFoodCategories = async () => [];
            window.__favoriteFoodRequests = [];
            API.getFood = async id => {
                window.__favoriteFoodRequests.push(id);
                if (id === 'missing-wine') throw new Error('Wine unavailable');
                return {
                    id, fineliId: id === 'favorite-beer' ? 902 : 904,
                    nameEn: 'Red wine', nameFi: 'Punaviini',
                    energyKcal: 85, energyKj: 356, protein: 0.2, fat: 0,
                    saturatedFat: 0, carbohydrate: 2.6, sugar: 0.6, salt: 0.01
                };
            };
            app.saveFavorites([
                { id: 'favorite-wine', type: 'drink', name: 'Saved wine', kcalPer100: 85, carbs: 2.6 },
                { id: 'drink_legacy wine', type: 'drink', name: 'Legacy wine', kcalPer100: 80, protein: 0.2, fat: 0, carbs: 3 },
                { id: 'missing-wine', type: 'drink', name: 'Missing wine', kcalPer100: 85 },
                { id: 'favorite-beer', type: 'drink', name: 'Saved beer', kcalPer100: 40 }
            ]);
            app.init();
            await app.navigate('drinks');
        }, lang);

        await page.getByRole('button', { name: '⭐ Saved wine', exact: true }).click();
        await page.locator('.ingredient-detail').waitFor();
        assert((await page.locator('[data-nutrient="energy"]').textContent()).startsWith('170 kcal'),
            `${lang}: saved database wine opens directly with scaled energy`);
        assert((await page.locator('[data-nutrient="sugar"]').textContent()).startsWith('1.2 g'),
            `${lang}: saved wine retrieves full nutrition, including sugar`);
        await page.locator('.ingredient-portion-preset[data-amount="500"]').click();
        assert((await page.locator('[data-nutrient="energy"]').textContent()).startsWith('425 kcal'),
            `${lang}: favorite nutrition recalculates when volume changes`);
        await page.locator('.ingredient-add-btn').click();
        await page.locator('.ingredient-confirm-add').click();
        await page.locator('.ingredient-detail').waitFor({ state: 'detached' });
        const drinks = await page.evaluate(() => app.getTodayDrinks());
        assert(drinks.length === 1 && drinks[0].amountMl === 500 && drinks[0].calories === 425,
            `${lang}: favorite consumption persists the selected volume and correct calories`);

        await page.getByRole('button', { name: '⭐ Legacy wine', exact: true }).click();
        await page.locator('.ingredient-detail').waitFor();
        assert((await page.locator('[data-nutrient="energy"]').textContent()).startsWith('160 kcal')
            && (await page.locator('[data-nutrient="carbohydrate"]').textContent()).startsWith('6 g'),
        `${lang}: existing manually saved favorites restore their stored energy and macros`);
        assert((await page.locator('[data-nutrient="sugar"]').textContent()).startsWith('—'),
            `${lang}: unsaved legacy nutrients stay unavailable rather than being fabricated`);
        await page.locator('.ingredient-close-btn').click();

        await page.getByRole('button', { name: '⭐ Missing wine', exact: true }).click();
        await page.locator('.toast.error').waitFor();
        assert(await page.locator('.ingredient-detail, #drink-name').count() === 0,
            `${lang}: failed favorite loading reports an error instead of opening empty nutrition`);

        await page.locator('#btn-add-custom-drink').click();
        await page.locator('#drink-name').fill('Manual wine');
        await page.locator('#btn-drink-manual').click();
        await page.locator('#drink-kcal').fill('70');
        await page.locator('#drink-sugar').fill('1.5');
        await page.locator('#drink-salt').fill('0.02');
        await page.locator('#btn-drink-fav').click();
        await page.locator('#btn-drink-cancel').click();
        await page.getByRole('button', { name: '⭐ Manual wine', exact: true }).click();
        await page.locator('.ingredient-detail').waitFor();
        assert((await page.locator('[data-nutrient="energy"]').textContent()).startsWith('140 kcal')
            && (await page.locator('[data-nutrient="sugar"]').textContent()).startsWith('3 g'),
        `${lang}: starring from manual entry preserves its nutrition and updates the list immediately`);
        await page.locator('.btn-ingredient-favorite').click();
        await page.locator('.ingredient-close-btn').click();
        assert(await page.getByRole('button', { name: '⭐ Manual wine', exact: true }).count() === 0,
            `${lang}: removing a favorite updates the list immediately`);

        await page.evaluate(() => {
            app.showLocalDrinkConsumptionDialog({
                id: 'drink_custom wine', nameEn: 'Custom wine', nameFi: 'Custom wine',
                energyKcal: 75, energyKj: 314, protein: 0, fat: 0.2,
                saturatedFat: 0.1, carbohydrate: 4, sugar: 2, salt: 0.03
            });
        });
        await page.locator('.btn-ingredient-favorite').click();
        await page.locator('.ingredient-close-btn').click();
        await page.reload({ waitUntil: 'load' });
        await page.locator('#welcome-dialog').waitFor({ state: 'visible' });
        await page.evaluate(async () => {
            API.getDashboard = async () => ({ weeklyCalorieTrend: [] });
            API.getEntries = async () => [];
            API.getCheckin = async () => null;
            API.getLatestMetrics = async () => null;
            app.init();
            await app.navigate('drinks');
        });
        await page.getByRole('button', { name: '⭐ Custom wine', exact: true }).click();
        await page.locator('.ingredient-detail').waitFor();
        assert((await page.locator('[data-nutrient="energy"]').textContent()).startsWith('150 kcal')
            && (await page.locator('[data-nutrient="sugar"]').textContent()).startsWith('4 g')
            && (await page.locator('[data-nutrient="saturatedFat"]').textContent()).startsWith('0.2 g'),
        `${lang}: custom favorite retains full nutrition after reloading`);
        await page.locator('.ingredient-close-btn').click();

        await page.evaluate(() => {
            API.getFood = async id => ({ id, fineliId: 902, nameEn: 'Beer', energyKcal: 40 });
            window.__savedBeer = null;
            API.createEntry = async payload => {
                window.__savedBeer = { ...payload, id: 'beer-entry', items: [] };
                return window.__savedBeer;
            };
            API.addEntryItem = async (id, payload) => {
                window.__savedBeer.items.push(payload);
                return payload;
            };
        });
        await page.getByRole('button', { name: '⭐ Saved beer', exact: true }).click();
        await page.locator('.ingredient-detail').waitFor();
        assert(await page.locator('.ingredient-amount-row select').inputValue() === 'ml'
            && await page.locator('.ingredient-portion-amount').inputValue() === '330',
        `${lang}: built-in favorites preserve their usual volume defaults`);
        await page.locator('.ingredient-add-btn').click();
        assert((await page.locator('.ingredient-confirmation').textContent()).includes('330 ml'),
            `${lang}: built-in favorite confirmation preserves volume units`);
        await page.locator('.ingredient-confirm-add').click();
        await page.locator('.ingredient-detail').waitFor({ state: 'detached' });
        const savedBeer = await page.evaluate(() => window.__savedBeer);
        assert(savedBeer.items[0].foodItemId === 'favorite-beer' && savedBeer.items[0].portionGrams === 330
            && await page.evaluate(() => app.getTodayDrinks().length) === 1,
        `${lang}: built-in favorites keep API-backed logging rather than creating a local-only drink`);
    } finally {
        await context.close();
    }
}

(async () => {
    const browser = await chromium.launch({ headless: true });
    try {
        for (const lang of ['en', 'fi']) await testDrinkFavorites(browser, lang);
    } finally {
        await browser.close();
    }
})().catch(error => {
    console.error(`FAIL: ${error.message}`);
    process.exitCode = 1;
});
