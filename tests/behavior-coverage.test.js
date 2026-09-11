const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const baseUrl = process.env.HEALTH_LOGGER_URL || 'http://localhost:5188';

function assert(condition, message) {
    if (!condition) throw new Error(message);
    console.log(`PASS: ${message}`);
}

async function openPage(browser) {
    const context = await browser.newContext({ serviceWorkers: 'block' });
    const page = await context.newPage();
    await page.goto(baseUrl, { waitUntil: 'load' });
    await page.locator('#welcome-dialog').waitFor({ state: 'visible' });
    return { context, page };
}

async function initializeApp(page) {
    await page.evaluate(() => {
        API.getDashboard = async () => ({
            caloriesToday: 0,
            calorieTarget: 0,
            proteinToday: 0,
            fatToday: 0,
            carbsToday: 0,
            weeklyCalorieTrend: []
        });
        API.getEntries = async () => [];
        API.getCheckin = async () => null;
        API.getLatestMetrics = async () => null;
        API.getMetrics = async () => [];
        API.getCalorieTrend = async () => [];
        API.getWellnessTrend = async () => [];
        API.getMacroDistribution = async () => null;
        API.getFoodCategories = async () => [];
        API.getRecipes = async () => [];
        API.browseFoods = async () => [];
        window.app.init();
    });
}

async function navigate(page, route, selector) {
    await page.evaluate(async destination => window.app.navigate(destination), route);
    await page.locator(selector).waitFor({ state: 'visible' });
}

async function testDashboardCheckinBanner(browser) {
    const { context, page } = await openPage(browser);
    const setTime = async value => {
        await page.clock.setFixedTime(new Date(value));
        await page.evaluate(() => app.refreshDashboardCheckinReminder());
    };
    try {
        await page.clock.setFixedTime(new Date('2026-09-11T19:59:00'));
        await initializeApp(page);
        await page.evaluate(() => {
            localStorage.setItem('HealthLogger_notifications', 'true');
            localStorage.setItem('HealthLogger_reminders', JSON.stringify(['20:00', '08:00']));
            API.getCheckin = async () => { throw { status: 404 }; };
        });
        await navigate(page, 'dashboard', '.dashboard');
        const banner = page.locator('#dashboard-checkin-reminder');
        assert(!await banner.isVisible(), 'banner stays hidden before the last reminder even after an earlier reminder');
        await setTime('2026-09-11T20:00:00');
        assert(await banner.isVisible(), 'missing daily check-in shows the banner at the final reminder on desktop');
        const position = await banner.evaluate(element => ({
            bottom: element.getBoundingClientRect().bottom,
            calorieTop: document.querySelector('.calorie-summary').getBoundingClientRect().top
        }));
        assert(position.bottom <= position.calorieTop, 'check-in banner sits above the kcal tile');
        await page.locator('.dashboard-checkin-dismiss').press('Enter');
        assert(await page.evaluate(() => app.currentPage) === 'dashboard', 'dismissal does not trigger navigation');
        await navigate(page, 'dashboard', '.dashboard');
        await page.evaluate(() => app.refreshDashboardCheckinReminder());
        assert(!await banner.isVisible(), 'daily dismissal survives overview navigation');
        await setTime('2026-09-12T19:59:00');
        assert(!await banner.isVisible(), 'next day still waits for the last reminder');
        await setTime('2026-09-12T20:01:00');
        assert(await banner.isVisible(), 'yesterday dismissal does not suppress today banner');
        await page.locator('.dashboard-checkin-action').press('Enter');
        await page.locator('#checkin-form').waitFor({ state: 'visible' });
        assert(await page.evaluate(() => app.currentPage) === 'checkin', 'banner keyboard activation opens Check-in');
        await page.evaluate(() => { API.getCheckin = async () => ({ sleepHours: 7 }); });
        await navigate(page, 'dashboard', '.dashboard');
        await page.evaluate(() => app.refreshDashboardCheckinReminder());
        assert(!await banner.isVisible(), 'completed daily check-in suppresses the banner');
        await page.evaluate(async () => {
            API.getCheckin = async () => { throw { status: 500 }; };
            await app.refreshDashboardCheckinReminder();
        });
        assert(!await banner.isVisible(), 'API failure does not falsely claim a missing check-in');
        await page.evaluate(async () => {
            API.getCheckin = async () => { throw { status: 404 }; };
            localStorage.setItem('HealthLogger_notifications', 'false');
            await app.refreshDashboardCheckinReminder();
        });
        assert(!await banner.isVisible(), 'disabled reminders suppress the banner');
        await page.evaluate(async () => {
            localStorage.setItem('HealthLogger_notifications', 'true');
            localStorage.setItem('HealthLogger_reminders', '[]');
            await app.refreshDashboardCheckinReminder();
        });
        assert(!await banner.isVisible(), 'no reminder schedule means no overdue banner');
        await page.evaluate(async () => {
            localStorage.setItem('HealthLogger_reminders', '["20:00"]');
            await app.checkReminders();
        });
        assert(await banner.isVisible(), 'existing reminder checker refreshes the overview banner');
        for (const lang of ['en', 'fi']) {
            await page.evaluate(async language => { await window.i18n.setLang(language); }, lang);
            await page.setViewportSize({ width: 390, height: 844 });
            await navigate(page, 'dashboard', '.dashboard');
            await page.evaluate(() => app.refreshDashboardCheckinReminder());
            assert(await banner.evaluate(element => element.scrollWidth <= element.clientWidth), `banner text fits mobile in ${lang}`);
        }
    } finally {
        await context.close();
    }
}

async function testMealFavoritesAndRecipes(browser) {
    const { context, page } = await openPage(browser);
    try {
        await initializeApp(page);
        await page.evaluate(() => {
            const foods = {
                starred: { id: 'starred', nameEn: 'Starred milk', nameFi: 'Maito', category: 'Dairy', energyKcal: 50 },
                other: { id: 'other', nameEn: 'Other milk', nameFi: 'Muu maito', category: 'Dairy', energyKcal: 60 },
                fruit: { id: 'fruit', nameEn: 'Apple', category: 'Fruit', energyKcal: 40 }
            };
            app.saveFavorites([
                { id: 'starred', type: 'food', name: 'Starred milk', kcalPer100: 50 },
                { id: 'offline', type: 'food', name: 'Offline milk', kcalPer100: 70 },
                { id: 'fruit', type: 'food', name: 'Apple', kcalPer100: 40 }
            ]);
            API.getFood = async id => {
                if (!foods[id]) throw Error('Not available');
                return foods[id];
            };
            API.searchFoods = async () => [foods.other, foods.starred];
            API.browseFoods = async () => [foods.other, foods.starred];
            API.getFoodCategories = async () => ['Dairy', 'Fruit'];
            API.getRecipes = () => new Promise(resolve => { window.__resolveMealRecipes = resolve; });
        });
        await navigate(page, 'add-meal', '.add-meal-page');
        await page.locator('#search-results [data-id="offline"]').waitFor();
        assert(await page.locator('#search-results .search-result').count() === 3, 'Add Meal initially shows starred foods');
        await page.locator('#food-search-input').fill('MILK');
        await page.locator('#search-results [data-id="other"]').waitFor();
        assert(await page.locator('#search-results .search-result').count() === 3, 'matching favorites are merged without duplicates and unrelated stars are excluded');
        const headings = await page.locator('#search-results h3').allTextContents();
        const expectedHeadings = await page.evaluate(() => [app.t('favorites_title'), app.t('other_products')]);
        assert(JSON.stringify(headings) === JSON.stringify(expectedHeadings), 'Add Meal groups starred foods before other products like Ingredients');
        assert(await page.locator('#search-results .search-result').last().getAttribute('data-id') === 'other', 'non-starred search results follow all matching favorites');
        await page.locator('#search-results [data-id="other"] .search-favorite').click();
        assert(await page.locator('#search-results h3').count() === 1, 'starring a result immediately updates its group');
        assert(await page.locator('.ingredient-detail').count() === 0, 'starring does not open the ingredient dialog');
        await page.locator('#meal-ingredient-category').selectOption('Dairy');
        await page.waitForFunction(() => document.querySelectorAll('#search-results .search-result').length === 2);
        assert(await page.locator('#search-results [data-id="offline"]').count() === 0, 'category filter also applies to starred foods');

        await page.locator('#meal-tab-recipes').click();
        assert(await page.locator('#meal-recipe-items [role="status"]').isVisible(), 'recipe tab displays loading state');
        await page.evaluate(() => window.__resolveMealRecipes([{ id: 'recipe', name: 'Milk recipe', ingredients: [], customCalories: 125 }]));
        await page.locator('.recipe-quick-item').waitFor();
        assert((await page.locator('.recipe-quick-item').textContent()).includes('125'), 'manual recipe calories are shown in the picker');
        await page.locator('#meal-entry-date').fill('2026-09-10');
        await page.locator('#meal-consumption-time').fill('12:34');
        await page.locator('.meal-composer-details [data-meal="lunch"]').click();
        await page.evaluate(() => { API.addRecipeAsMeal = async (id, data) => { window.__addedRecipe = { id, ...data }; }; });
        await page.locator('.recipe-quick-item').press('Enter');
        await page.locator('.recipe-use-dialog').waitFor();
        await page.locator('#recipe-portion-quantity').fill('2');
        await page.locator('#btn-rp-add').click();
        await page.waitForFunction(() => !!window.__addedRecipe);
        const added = await page.evaluate(() => window.__addedRecipe);
        assert(added.id === 'recipe' && added.entryDate === '2026-09-10' && added.mealType === 'lunch'
            && added.consumptionTime === '12:34:00' && added.portionMultiplier === 2,
        'recipe selection submits the chosen portion with the Add Meal date, time and meal type');

        await page.evaluate(() => { API.getRecipes = async () => []; });
        await navigate(page, 'add-meal', '.add-meal-page');
        await page.locator('#meal-tab-recipes').click();
        assert((await page.locator('#meal-recipe-items').textContent()).trim() === await page.evaluate(() => app.t('no_recipes')), 'recipe tab explains an empty recipe list');
        await page.evaluate(() => { API.getRecipes = async () => { throw Error('Unavailable'); }; });
        await navigate(page, 'add-meal', '.add-meal-page');
        await page.locator('#meal-tab-recipes').click();
        assert(await page.locator('#meal-recipe-items [role="alert"]').isVisible(), 'recipe tab shows load failures instead of an empty panel');
        for (const lang of ['en', 'fi']) {
            await page.evaluate(async language => { await window.i18n.setLang(language); app.applyTranslations(); }, lang);
            for (const width of [1280, 390]) {
                await page.setViewportSize({ width, height: 900 });
                const fits = await page.locator('.meal-source-tab').evaluateAll(tabs => tabs.every(tab => tab.scrollWidth <= tab.clientWidth));
                assert(fits, `all four source tabs fit in ${lang} at width ${width}`);
            }
        }
    } finally {
        await context.close();
    }
}

async function testCheckinStepsAndFocus(browser) {
    const { context, page } = await openPage(browser);
    try {
        await initializeApp(page);
        await page.evaluate(() => {
            window.__savedCheckins = [];
            API.getCheckin = async () => ({ stepCount: 0, moodRating: 3 });
            API.saveCheckin = async checkin => { window.__savedCheckins.push(checkin); };
        });
        await navigate(page, 'checkin', '#checkin-form');
        const steps = page.locator('[name="stepCount"]');
        assert(await steps.inputValue() === '0', 'check-in restores zero steps');
        for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 844 }]) {
            await page.setViewportSize(viewport);
            if (viewport.width < 768) await page.locator('#nav-toggle').click();
            await page.locator('[name="sleepHours"]').fill('7.5');
            await page.locator('[name="sleepHours"]').press('Enter');
            assert(await page.locator('[data-field="moodRating"] .selected').evaluate(element => element === document.activeElement),
                `Enter focuses the next rating selection at width ${viewport.width}`);
            await steps.fill('8500');
            await steps.press('Enter');
            assert(await page.locator('[name="notes"]').evaluate(element => element === document.activeElement),
                `Enter from steps focuses Notes at width ${viewport.width}`);
            assert(await page.evaluate(() => window.__savedCheckins.length) === 0,
                'Enter in numeric fields does not submit the check-in');
        }
        await page.locator('[name="notes"]').fill('First line');
        await page.locator('[name="notes"]').press('End');
        await page.locator('[name="notes"]').press('Enter');
        assert((await page.locator('[name="notes"]').inputValue()).includes('\n'), 'Enter in Notes preserves multiline editing');
        for (const invalid of ['-1', '1.5']) {
            await steps.fill(invalid);
            assert(!await steps.evaluate(element => element.checkValidity()), 'steps reject negative or fractional counts');
        }
        for (const value of ['8500', '0', '']) {
            await steps.fill(value);
            await page.locator('#checkin-form button[type="submit"]').click();
            await page.locator('.dashboard').waitFor({ state: 'visible' });
            const saved = await page.evaluate(() => window.__savedCheckins.at(-1));
            assert(saved.stepCount === (value === '' ? null : Number(value)), `steps save ${value === '' ? 'blank as null' : value}`);
            await page.evaluate(checkin => { API.getCheckin = async () => checkin; }, saved);
            await navigate(page, 'checkin', '#checkin-form');
            assert(await steps.inputValue() === value, 'saved steps repopulate on return');
        }
    } finally {
        await context.close();
    }
}

async function testMetricsUnchangedAndMeasuredNow(browser) {
    const { context, page } = await openPage(browser);
    const latest = {
        weightKg: 80.5,
        waistCircumferenceCm: 92,
        systolicBP: 120,
        diastolicBP: 78,
        weightMeasurementDate: '2026-09-01',
        waistMeasurementDate: '2026-09-01',
        systolicBPMeasurementDate: '2026-09-01',
        diastolicBPMeasurementDate: '2026-09-01'
    };
    try {
        await initializeApp(page);
        await page.evaluate(value => {
            window.__savedMetrics = [];
            API.getLatestMetrics = async () => value;
            API.getMetrics = async () => [];
            API.saveMetric = async metric => { window.__savedMetrics.push(metric); };
        }, latest);

        await navigate(page, 'metrics', '#metrics-form');
        await page.locator('#metrics-form').evaluate(form => form.requestSubmit());
        await page.waitForFunction(() => window.__savedMetrics.length === 1);
        let saved = await page.evaluate(() => window.__savedMetrics[0]);
        assert(saved.weightKg === null && saved.waistCircumferenceCm === null
            && saved.systolicBP === null && saved.diastolicBP === null,
        'task 1: unchanged unchecked metrics are omitted from the save payload');

        await navigate(page, 'metrics', '#metrics-form');
        await page.locator('[name="weightMeasuredNow"]').check();
        await page.locator('[name="bloodPressureMeasuredNow"]').check();
        await page.locator('#metrics-form').evaluate(form => form.requestSubmit());
        await page.waitForFunction(() => window.__savedMetrics.length === 2);
        saved = await page.evaluate(() => window.__savedMetrics[1]);
        assert(saved.weightKg === latest.weightKg && saved.waistCircumferenceCm === null,
            'task 1: checked unchanged weight is saved while unchecked waist remains omitted');
        assert(saved.systolicBP === latest.systolicBP && saved.diastolicBP === latest.diastolicBP,
            'task 1: checked blood pressure saves both unchanged values');
    } finally {
        await context.close();
    }
}

async function testDrinkSelectionAndSharedConfirmation(browser) {
    const { context, page } = await openPage(browser);
    try {
        await initializeApp(page);
        await page.evaluate(() => {
            API.getFoodByFineliId = async fineliId => ({
                id: `drink-${fineliId}`,
                fineliId,
                nameFi: `Juoma ${fineliId}`,
                nameEn: `Drink ${fineliId}`,
                defaultPortionGrams: 200,
                energyKcal: fineliId === 900 ? 0 : 42,
                protein: 0,
                fat: 0,
                carbohydrate: 10
            });
        });
        await navigate(page, 'add-meal', '.add-meal-page');
        await page.locator('#meal-tab-drinks').click();
        await page.locator('#meal-drink-results .search-result').first().waitFor();
        assert(await page.locator('#meal-drink-results .search-result').count() === 6,
            'task 2: Add Meal exposes the built-in drink choices');
        await page.locator('#meal-drink-results .search-result').nth(1).click();
        await page.locator('.ingredient-detail[role="dialog"]').waitFor();
        await page.locator('.ingredient-add-btn').click();
        const confirmation = page.locator('.ingredient-confirmation-content[role="dialog"]');
        await confirmation.waitFor();
        assert((await confirmation.textContent()).includes('Drink 902'),
            'task 2: selecting a drink opens the shared ingredient confirmation');
        await page.locator('.ingredient-confirm-add').click();
        assert(await page.locator('.meal-item').count() === 1,
            'task 2: confirming a drink adds it to the meal draft');
        assert((await page.locator('.meal-item').textContent()).includes('Drink 902'),
            'task 2: the selected drink remains visible in the draft');
    } finally {
        await context.close();
    }
}

async function testIngredientBarcodeAction(browser) {
    for (const locale of [
        { lang: 'en', label: 'Add', manualLabel: 'Manual entry' },
        { lang: 'fi', label: 'Lisää', manualLabel: 'Syötä käsin' }
    ]) {
        const { context, page } = await openPage(browser);
        try {
            await page.evaluate(async lang => window.i18n.setLang(lang), locale.lang);
            await page.reload({ waitUntil: 'load' });
            await page.locator('#welcome-dialog').waitFor({ state: 'visible' });
            await initializeApp(page);
            await navigate(page, 'ingredients', '.ingredients');

            const barcodeButton = page.locator('#btn-barcode-ingredient');
            assert((await barcodeButton.textContent()).trim() === locale.label,
                `task 8: ingredients barcode action is localized as "${locale.label}" in ${locale.lang}`);
            assert(await barcodeButton.evaluate(element => element.classList.contains('btn-barcode')),
                `task 8: localized ${locale.lang} control retains its barcode action identity`);
            assert(await page.locator('#btn-manual-ingredient').count() === 0,
                `ingredients page has one Add action in ${locale.lang}`);

            await barcodeButton.click();
            const barcodeDialog = page.locator('.barcode-dialog');
            await barcodeDialog.waitFor({ state: 'visible' });
            assert(await barcodeDialog.locator('.barcode-camera-btn').isVisible()
                && await barcodeDialog.locator('.barcode-lookup-form').isVisible(),
            `task 8: localized ${locale.lang} barcode action opens camera and manual EAN controls`);
            assert(await barcodeDialog.locator('.barcode-manual-ingredient-btn').isVisible(),
                `Add dialog includes manual ingredient entry in ${locale.lang}`);
            assert((await barcodeDialog.locator('.barcode-manual-ingredient-btn').textContent()).trim() === locale.manualLabel,
                `manual ingredient entry is localized in ${locale.lang}`);
            assert(await barcodeDialog.evaluate(dialog => {
                const camera = dialog.querySelector('.barcode-camera-btn');
                const manual = dialog.querySelector('.barcode-lookup-form');
                return Boolean(camera?.compareDocumentPosition(manual) & Node.DOCUMENT_POSITION_FOLLOWING);
            }), `task 8: barcode camera control precedes manual EAN entry in ${locale.lang}`);
        } finally {
            await context.close();
        }
    }
}

async function testManualIngredientCreation(browser) {
    const { context, page } = await openPage(browser);
    try {
        await initializeApp(page);
        await page.evaluate(() => {
            window.__createdFood = null;
            API.getFoodCategories = async () => ['Own'];
            API.createFood = async food => {
                window.__createdFood = food;
                return { id: 'manual-food', isUserCreated: true, ...food };
            };
        });
        await navigate(page, 'ingredients', '.ingredients');
        await page.locator('#btn-barcode-ingredient').click();
        await page.locator('.barcode-manual-ingredient-btn').click();
        const form = page.locator('.ingredient-edit-form');
        await form.locator('[name="nameEn"]').fill('Manual oats');
        await form.locator('[name="category"]').selectOption('Own');
        await form.locator('[name="energyKcal"]').fill('370');
        await form.locator('[name="protein"]').fill('13');
        await form.evaluate(element => element.requestSubmit());
        await page.locator('.ingredient-detail-title', { hasText: 'Manual oats' }).waitFor();
        const created = await page.evaluate(() => window.__createdFood);
        assert(created.nameFi === 'Manual oats' && created.nameEn === 'Manual oats',
            'task 4: one supplied name is normalized into both ingredient names');
        assert(created.category === 'Own' && created.defaultPortionGrams === 100
            && created.energyKcal === 370 && created.protein === 13,
        'task 4: manual ingredient values are sent through the public food API');
        assert(await page.locator('.ingredient-detail[role="dialog"]').isVisible(),
            'task 4: a saved manual ingredient opens as a normal ingredient');
    } finally {
        await context.close();
    }
}

function mealEntries() {
    const apple = { id: 'apple', nameEn: 'Apple', nameFi: 'Omena', energyKcal: 50, protein: 1, fat: 0, carbohydrate: 12 };
    const soup = { id: 'soup', nameEn: 'Soup', nameFi: 'Keitto', energyKcal: 80, protein: 4, fat: 2, carbohydrate: 8 };
    return [
        { id: 'breakfast-1', mealType: 'breakfast', consumptionTime: '08:00:00', items: [{ id: 'apple-1', portionGrams: 100, foodItem: apple }] },
        { id: 'breakfast-2', mealType: 'breakfast', consumptionTime: '09:15:00', items: [{ id: 'apple-2', portionGrams: 200, foodItem: apple }] },
        { id: 'dinner-1', mealType: 'dinner', consumptionTime: '18:30:00', items: [{ id: 'soup-1', portionGrams: 250, foodItem: soup }] }
    ];
}

async function testMealGroupingViews(browser) {
    const { context, page } = await openPage(browser);
    try {
        await initializeApp(page);
        await page.evaluate(entries => { API.getEntries = async () => entries; }, mealEntries());

        await navigate(page, 'meals', '.meals-page');
        const historyGroups = page.locator('.meals-type-group');
        assert(await historyGroups.count() === 2,
            'task 6: meal history renders one group per populated meal type');
        assert(await page.locator('.meals-type-group[data-meal-type="breakfast"] .meal-card').count() === 2,
            'task 6: multiple breakfast entries remain grouped together');
        assert(await page.locator('.meals-type-group[data-meal-type="dinner"] .meal-card').count() === 1,
            'task 6: dinner entries render in their own group');

        await navigate(page, 'log-meal', '.log-meal');
        const todayGroups = page.locator('.today-meal-group');
        assert(await todayGroups.count() === 5,
            'task 9: Today renders every meal type as a collapsible group');
        assert(await todayGroups.evaluateAll(groups => groups.every(group => !group.open)),
            'task 9: Today meal groups are collapsed by default');
        assert((await page.locator('.today-meal-group[data-meal-type="breakfast"] summary').textContent()).includes('150'),
            'task 9: collapsed breakfast title displays its calorie total');
        assert((await page.locator('.today-meal-group[data-meal-type="dinner"] summary').textContent()).includes('200'),
            'task 9: collapsed dinner title displays its calorie total');
    } finally {
        await context.close();
    }
}

function activeSourceFiles(directory) {
    const ignoredDirectories = new Set(['bin', 'obj', 'Migrations']);
    return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
        const entryPath = path.join(directory, entry.name);
        if (entry.isDirectory()) return ignoredDirectories.has(entry.name) ? [] : activeSourceFiles(entryPath);
        return /\.(cs|html|js)$/.test(entry.name) ? [entryPath] : [];
    });
}

async function testIdentifyFoodRemoval(browser) {
    const sourceRoot = path.join(__dirname, '..', 'HealthLogger');
    const sourceText = activeSourceFiles(sourceRoot).map(file => fs.readFileSync(file, 'utf8')).join('\n');
    assert(!sourceText.includes('/api/photos') && !sourceText.includes('/photo-results'),
        'task 7: active source contains no retired photo API or result route');

    const { context, page } = await openPage(browser);
    try {
        await initializeApp(page);
        const runtime = await page.evaluate(() => {
            const retiredPattern = /identify|photo/i;
            return {
                routes: Object.values(window.app.pageRoutes),
                apiMethods: Object.keys(API),
                retiredControls: [...document.querySelectorAll('button, a, [data-page]')]
                    .filter(element => retiredPattern.test(`${element.id} ${element.dataset.page || ''} ${element.textContent}`))
                    .length,
                retiredTemplates: document.querySelectorAll('[id*="photo"], [id*="identify"]').length
            };
        });
        assert(!runtime.routes.includes('/photo-results')
            && runtime.apiMethods.every(method => !/identify|photo/i.test(method)),
        'task 7: the live client exposes no retired photo route or API method');
        assert(runtime.retiredControls === 0 && runtime.retiredTemplates === 0,
            'task 7: the rendered runtime contains no identify-food action or result template');
    } finally {
        await context.close();
    }
}

async function testCategoryFiltering(browser) {
    const { context, page } = await openPage(browser);
    const foods = [
        { id: 'apple', nameEn: 'Apple', nameFi: 'Omena', category: 'Fruit', energyKcal: 50, protein: 1, fat: 0, carbohydrate: 12 },
        { id: 'milk', nameEn: 'Milk', nameFi: 'Maito', category: 'Dairy', energyKcal: 60, protein: 3, fat: 3, carbohydrate: 5 }
    ];
    try {
        await initializeApp(page);
        await page.evaluate(items => {
            window.__browseCalls = [];
            API.getFoodCategories = async () => ['Fruit', 'Dairy'];
            API.browseFoods = async (...args) => {
                window.__browseCalls.push(args);
                return items;
            };
        }, foods);
        await navigate(page, 'add-meal', '.add-meal-page');
        await page.locator('#meal-ingredient-category').selectOption('Fruit');
        await page.waitForFunction(() => window.__browseCalls.length === 1);
        assert(await page.locator('#search-results .search-result').count() === 1
            && (await page.locator('#search-results .search-result').textContent()).includes('Apple'),
        'task 12: Add Meal category selection displays only matching ingredients');
        const call = await page.evaluate(() => window.__browseCalls[0]);
        assert(call[0] === 'Fruit' && call[2] === 100 && call[3] === 0,
            'task 12: category filtering uses the public browse API with a bounded page');
    } finally {
        await context.close();
    }
}

async function testRecentSearchAndPagination(browser) {
    const { context, page } = await openPage(browser);
    const names = Array.from({ length: 60 }, (_, index) =>
        `${index < 30 ? 'Berry' : 'Other'} ${String(index % 30 + 1).padStart(2, '0')}`);
    const recent = names.map((name, index) => ({
        id: `recent-${index + 1}`,
        name,
        kcal: index + 1,
        portion: 100,
        kcalPer100: index + 1,
        protein: 1,
        fat: 2,
        carbohydrate: 3
    }));
    try {
        await page.evaluate(items => localStorage.setItem('recentFoods', JSON.stringify(items)), recent);
        await initializeApp(page);
        await page.evaluate(() => { API.getFood = async () => { throw new Error('offline fixture'); }; });
        await navigate(page, 'add-meal', '.add-meal-page');
        await page.locator('#meal-tab-recent').click();
        const rows = page.locator('#meal-recent-items .search-result');
        const search = page.locator('.recent-food-search');
        assert(await rows.count() === 25, 'task 13: recent items initially render a bounded page of 25');
        assert(await page.locator('.recent-load-more').isVisible(),
            'task 13: more recent items can be requested when results remain');
        await search.fill('berry');
        assert(await rows.count() === 25, 'task 13: recent search filters case-insensitively and resets pagination');
        await page.locator('.recent-load-more').click();
        assert(await rows.count() === 30 && await page.locator('.recent-load-more').count() === 0,
            'task 13: loading more reveals all matching recent items and removes the control');
        await search.fill('missing');
        assert(await rows.count() === 0 && await page.locator('#meal-recent-items .meal-source-empty').isVisible(),
            'task 13: recent search presents an empty state for no matches');
        await search.fill('Other 30');
        await rows.first().click();
        await page.locator('.ingredient-detail-title', { hasText: 'Other 30' }).waitFor();
        assert(await page.locator('.ingredient-detail[role="dialog"]').isVisible(),
            'task 13: a filtered recent result opens the shared ingredient detail');
    } finally {
        await context.close();
    }
}

async function testIngredientConfirmation(browser) {
    const { context, page } = await openPage(browser);
    const food = {
        id: 'shared-food',
        nameEn: 'Shared oats',
        nameFi: 'Shared oats',
        defaultPortionGrams: 100,
        energyKcal: 360,
        protein: 12,
        fat: 7,
        carbohydrate: 60
    };
    try {
        await initializeApp(page);
        await page.evaluate(item => {
            window.__entryPayload = null;
            window.__itemPayload = null;
            API.browseFoods = async () => [item];
            API.createEntry = async payload => {
                window.__entryPayload = payload;
                return { id: 'entry-1' };
            };
            API.addEntryItem = async (_entryId, payload) => { window.__itemPayload = payload; };
        }, food);
        await navigate(page, 'ingredients', '.ingredients');
        await page.locator('#ingredients-list .ingredient-card').click();
        await page.locator('.ingredient-add-btn').click();
        const confirmation = page.locator('.ingredient-confirmation-content[role="dialog"]');
        assert(await confirmation.isVisible() && (await confirmation.textContent()).includes('Shared oats'),
            'task 3: Ingredients uses the shared confirmation before adding consumption');
        assert((await confirmation.textContent()).includes('360 kcal'),
            'task 3: shared confirmation displays portion nutrition');
        await page.locator('.ingredient-confirm-add').click();
        await page.waitForFunction(() => window.__itemPayload !== null);
        const payloads = await page.evaluate(() => ({ entry: window.__entryPayload, item: window.__itemPayload }));
        assert(payloads.entry.mealType && /^\d{2}:\d{2}:00$/.test(payloads.entry.consumptionTime),
            'task 3: confirmation submits the selected meal context');
        assert(payloads.item.foodItemId === food.id && payloads.item.portionGrams === 100,
            'task 3: confirmation submits the selected ingredient and portion');
    } finally {
        await context.close();
    }
}

async function testDirectIngredientConsumptionLocalDate(browser, scenario) {
    const context = await browser.newContext({
        serviceWorkers: 'block',
        timezoneId: scenario.timezoneId
    });
    const page = await context.newPage();
    const food = {
        id: `date-food-${scenario.timezoneId}`,
        nameEn: 'Date oats',
        nameFi: 'Date oats',
        defaultPortionGrams: 100,
        energyKcal: 360,
        protein: 12,
        fat: 7,
        carbohydrate: 60
    };

    try {
        await page.clock.install({ time: new Date(scenario.time) });
        await page.goto(baseUrl, { waitUntil: 'load' });
        await page.locator('#welcome-dialog').waitFor({ state: 'visible' });
        await initializeApp(page);
        await page.evaluate(item => {
            window.__directEntryPayload = null;
            API.browseFoods = async () => [item];
            API.createEntry = async payload => {
                window.__directEntryPayload = payload;
                return { id: 'dated-entry' };
            };
            API.addEntryItem = async () => {};
        }, food);
        await navigate(page, 'ingredients', '.ingredients');
        await page.locator('#ingredients-list .ingredient-card').click();
        await page.locator('.ingredient-add-btn').click();
        await page.locator('.ingredient-confirm-add').click();
        await page.waitForFunction(() => window.__directEntryPayload !== null);
        const payload = await page.evaluate(() => window.__directEntryPayload);
        assert(payload.entryDate === scenario.localDate,
            `${scenario.name} direct ingredient consumption uses the local calendar date`);
        assert(/^\d{2}:\d{2}:00$/.test(payload.consumptionTime),
            `${scenario.name} direct ingredient consumption preserves API time semantics`);
        assert(!Object.hasOwn(payload, 'createdAt') && !Object.hasOwn(payload, 'timestamp'),
            `${scenario.name} direct ingredient consumption leaves timestamps to the server`);
    } finally {
        await context.close();
    }
}

async function testExplicitMealDatePassThrough(browser) {
    const { context, page } = await openPage(browser);
    const selectedDate = '2024-02-29';
    try {
        await initializeApp(page);
        await page.evaluate(() => {
            window.__mealPayload = null;
            API.createMeal = async payload => { window.__mealPayload = payload; };
        });
        await navigate(page, 'add-meal', '.add-meal-page');
        await page.locator('#meal-entry-date').fill(selectedDate);
        await page.evaluate(() => {
            window.app.mealItems = [{ id: 'explicit-date-food', name: 'Date food', portion: 100, calories: 100 }];
            window.app.updateMealItemsList();
        });
        await page.locator('#btn-save-meal').click();
        await page.waitForFunction(() => window.__mealPayload !== null);
        const payload = await page.evaluate(() => window.__mealPayload);
        assert(payload.entryDate === selectedDate,
            'task 3: explicit user-selected meal date passes through unchanged');
        assert(!Object.hasOwn(payload, 'createdAt') && !Object.hasOwn(payload, 'timestamp'),
            'task 3: meal creation leaves timestamps to the server');
    } finally {
        await context.close();
    }
}

(async () => {
    const browser = await chromium.launch({ headless: true });
    try {
        await testDashboardCheckinBanner(browser);
        await testMealFavoritesAndRecipes(browser);
        await testCheckinStepsAndFocus(browser);
        await testMetricsUnchangedAndMeasuredNow(browser);
        await testDrinkSelectionAndSharedConfirmation(browser);
        await testIngredientBarcodeAction(browser);
        await testManualIngredientCreation(browser);
        await testMealGroupingViews(browser);
        await testIdentifyFoodRemoval(browser);
        await testCategoryFiltering(browser);
        await testRecentSearchAndPagination(browser);
        await testIngredientConfirmation(browser);
        await testDirectIngredientConsumptionLocalDate(browser, {
            name: 'positive UTC offset near midnight',
            timezoneId: 'Asia/Kathmandu',
            time: '2026-09-06T18:20:00Z',
            localDate: '2026-09-07'
        });
        await testDirectIngredientConsumptionLocalDate(browser, {
            name: 'negative UTC offset near midnight',
            timezoneId: 'America/Los_Angeles',
            time: '2026-09-06T06:30:00Z',
            localDate: '2026-09-05'
        });
        await testExplicitMealDatePassThrough(browser);
    } finally {
        await browser.close();
    }
})().catch(error => {
    console.error(`FAIL: ${error.message}`);
    process.exitCode = 1;
});