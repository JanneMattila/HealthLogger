const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const baseUrl = process.env.HEALTH_LOGGER_URL || 'http://localhost:5188';

function assert(condition, message) {
    if (!condition) throw new Error(message);
    console.log(`PASS: ${message}`);
}

async function assertHamburgerAvailable(page, message) {
    const state = await page.locator('#nav-toggle').evaluate(button => {
        const rect = button.getBoundingClientRect();
        const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
        return {
            visible: button.getClientRects().length > 0,
            receivesPointer: hit === button || button.contains(hit)
        };
    });
    assert(state.visible && state.receivesPointer, message);
}

async function openMealDialog(page, food) {
    await page.evaluate(item => window.app.showMealIngredientDialog(item), food);
    await page.locator('.ingredient-detail-title').waitFor({ state: 'visible' });
}

async function assertDialogSemantics(page, dialogSelector, expectedFocusSelector) {
    const semantics = await page.locator(dialogSelector).evaluate(dialog => {
        const titleId = dialog.getAttribute('aria-labelledby');
        const title = titleId ? document.getElementById(titleId) : null;
        const controls = [...dialog.querySelectorAll('input, select')];
        const controlIds = controls.map(control => control.id).filter(Boolean);
        return {
            role: dialog.getAttribute('role'),
            modal: dialog.getAttribute('aria-modal'),
            titleId,
            titleIsInside: !!title && dialog.contains(title),
            allControlsHaveUniqueIds: new Set(controlIds).size === controlIds.length,
            allControlsHaveLabels: controls.every(control =>
                (control.id && dialog.querySelector(`label[for="${CSS.escape(control.id)}"]`))
                || control.hasAttribute('aria-label')
                || control.hasAttribute('aria-labelledby'))
        };
    });
    assert(semantics.role === 'dialog' && semantics.modal === 'true', `${dialogSelector} is exposed as a modal dialog`);
    assert(semantics.titleId && semantics.titleIsInside, `${dialogSelector} has an associated unique title`);
    assert(semantics.allControlsHaveUniqueIds, `${dialogSelector} controls have unique IDs`);
    assert(semantics.allControlsHaveLabels, `${dialogSelector} controls have associated labels`);
    assert(await page.locator(expectedFocusSelector).evaluate(element => element === document.activeElement), `${dialogSelector} sets initial focus`);
}

(async () => {
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
        viewport: { width: 390, height: 844 },
        serviceWorkers: 'block'
    });
    const page = await context.newPage();
    const food = {
        id: 'navigation-test-food',
        nameFi: 'Test food',
        nameEn: 'Test food',
        defaultPortionGrams: 100,
        energyKcal: 120,
        protein: 4,
        fat: 5,
        carbohydrate: 6
    };
    const drink = { ...food, id: 'navigation-test-drink', nameFi: 'Water', nameEn: 'Water', energyKcal: 0 };

    try {
        const sourceRoot = path.join(__dirname, '..', 'HealthLogger', 'wwwroot');
        const appSource = fs.readFileSync(path.join(sourceRoot, 'js', 'app.js'), 'utf8');
        const englishLocale = fs.readFileSync(path.join(sourceRoot, 'js', 'locales', 'en.json'), 'utf8');
        const finnishLocale = fs.readFileSync(path.join(sourceRoot, 'js', 'locales', 'fi.json'), 'utf8');
        assert(!appSource.includes('.camera-overlay'), 'application source has no retired camera overlay references');
        assert(!englishLocale.includes('drink_scan_label') && !finnishLocale.includes('drink_scan_label'), 'locales have no retired Scan with AI strings');
        assert(JSON.parse(englishLocale).ingredient_source_label === 'Ingredient source'
            && JSON.parse(finnishLocale).ingredient_source_label === 'Ainesosan lähde',
        'Add Meal source label is defined in both locales');

        await page.goto(baseUrl, { waitUntil: 'load' });
        await page.locator('#welcome-dialog').waitFor({ state: 'visible' });
        await page.evaluate(() => {
            API.getFoodCategories = async () => [];
            API.browseFoods = async () => [];
            API.getRecipes = async () => [];
            API.createMeal = async () => ({ id: 'navigation-test-meal' });
            window.app.init();
        });
        await page.evaluate(() => window.app.navigate('add-meal'));
        await page.locator('.add-meal-page').waitFor({ state: 'visible' });
        await assertHamburgerAvailable(page, 'hamburger is available on Add Meal at mobile width');
        const sourceLabel = await page.evaluate(() => window.i18n.t('ingredient_source_label'));
        assert(await page.locator('.meal-source-tabs').getAttribute('aria-label') === sourceLabel, 'Add Meal source tablist uses a localized accessible label');

        await page.locator('#btn-barcode-meal').focus();
        await openMealDialog(page, food);
        await assertDialogSemantics(page, '.ingredient-detail[role="dialog"]', '.ingredient-portion-amount');
        await page.locator('.ingredient-add-btn').click();
        await assertDialogSemantics(page, '.ingredient-confirmation-content[role="dialog"]', '.ingredient-confirm-cancel');
        const dialogIds = await page.locator('.portion-dialog [id]').evaluateAll(elements => elements.map(element => element.id));
        assert(new Set(dialogIds).size === dialogIds.length, 'stacked ingredient dialogs do not duplicate IDs');
        await page.locator('.ingredient-confirm-cancel').click();
        await page.waitForFunction(() => document.activeElement?.classList.contains('ingredient-add-btn'));
        assert(await page.locator('.ingredient-add-btn').evaluate(button => button === document.activeElement), 'confirmation cancel restores focus to Add');
        await page.locator('.ingredient-close-btn').click();
        await page.waitForFunction(() => document.activeElement?.id === 'btn-barcode-meal');
        assert(await page.locator('#btn-barcode-meal').evaluate(button => button === document.activeElement), 'ingredient detail close restores opener focus');

        await page.evaluate(() => window.app.navigate('ingredients'));
        await page.locator('#btn-manual-ingredient').waitFor({ state: 'visible' });
        await page.locator('#btn-manual-ingredient').click();
        await assertDialogSemantics(page, '.ingredient-editor[role="dialog"]', '.ingredient-editor [name="nameFi"]');
        await page.locator('.ingredient-edit-cancel').click();
        await page.waitForFunction(() => document.activeElement?.id === 'btn-manual-ingredient');
        assert(await page.locator('#btn-manual-ingredient').evaluate(button => button === document.activeElement), 'manual editor cancel restores opener focus');
        await page.evaluate(() => window.app.navigate('add-meal'));
        await page.locator('.add-meal-page').waitFor({ state: 'visible' });

        await openMealDialog(page, food);
        await page.locator('.ingredient-close-btn').click();
        assert(await page.locator('.portion-dialog').count() === 0, 'cancel closes the ingredient dialog');
        await assertHamburgerAvailable(page, 'hamburger is restored after ingredient cancel');

        await openMealDialog(page, food);
        await page.locator('.ingredient-add-btn').click();
        await page.locator('.ingredient-confirm-add').click();
        assert(await page.locator('.portion-dialog').count() === 0, 'save closes ingredient and confirmation dialogs');
        assert(await page.locator('.meal-item').count() === 1, 'saved ingredient remains in the meal draft');
        await assertHamburgerAvailable(page, 'hamburger is restored after ingredient save');

        await openMealDialog(page, drink);
        await page.locator('.ingredient-close-btn').click();
        assert(await page.locator('.portion-dialog').count() === 0, 'cancel closes the drink dialog');

        await openMealDialog(page, drink);
        await page.locator('.ingredient-add-btn').click();
        await page.locator('.ingredient-confirm-add').click();
        assert(await page.locator('.portion-dialog').count() === 0, 'save closes drink and confirmation dialogs');

        await page.locator('#btn-save-meal').click();
        await page.locator('#content .meals-page').waitFor({ state: 'visible' });
        assert(await page.evaluate(() => window.app.currentPage) === 'meals', 'saving the meal leaves Add Meal');
        await assertHamburgerAvailable(page, 'hamburger remains available after saving the meal');

        await page.evaluate(() => window.app.navigate('add-meal'));
        await page.locator('#content .add-meal-page').waitFor({ state: 'visible' });
        await page.locator('#btn-cancel-add-meal').click();
        await page.locator('#content .meals-page').waitFor({ state: 'visible' });
        assert(await page.evaluate(() => window.app.currentPage) === 'meals', 'canceling Add Meal returns to meals');
        await assertHamburgerAvailable(page, 'hamburger remains available after canceling Add Meal');

        await page.evaluate(() => window.app.navigate('add-meal'));
        await page.locator('#content .add-meal-page').waitFor({ state: 'visible' });
        await openMealDialog(page, food);
        await page.evaluate(() => window.app.navigate('dashboard'));
        assert(await page.locator('.portion-dialog').count() === 0, 'navigating away removes Add Meal dialogs');
        await assertHamburgerAvailable(page, 'hamburger receives pointer events after navigating away');

        await page.goBack();
        await page.locator('.add-meal-page').waitFor({ state: 'visible' });
        assert(await page.locator('.portion-dialog').count() === 0, 'browser back does not restore stale dialogs');
        await assertHamburgerAvailable(page, 'hamburger remains available after navigating back');

        await page.evaluate(() => {
            const today = new Date().toISOString().split('T')[0];
            localStorage.setItem('HealthLogger_notifications', 'true');
            localStorage.setItem('HealthLogger_reminders', JSON.stringify(['00:00']));
            localStorage.removeItem(`HealthLogger_reminder_shown_${today}`);
            API.getCheckin = async () => { throw { status: 404 }; };
            window.app.startReminderChecker();
        });
        await page.locator('.toast-reminder').waitFor({ state: 'visible' });
        await page.evaluate(() => {
            window.dispatchEvent(new Event('focus'));
            document.dispatchEvent(new Event('visibilitychange'));
            window.dispatchEvent(new Event('focus'));
        });
        assert(await page.locator('.toast-reminder').count() === 1, 'repeated focus events do not duplicate the check-in reminder');
        const reminderText = await page.evaluate(() => window.i18n.t('reminder_checkin'));
        assert((await page.locator('.toast-reminder').textContent()).includes(reminderText), 'check-in reminder uses localized text');
        await page.locator('.toast-action').click();
        await page.locator('.checkin').waitFor({ state: 'visible' });
        assert(await page.evaluate(() => window.app.currentPage) === 'checkin', 'reminder action navigates to check-in');

        await page.evaluate(() => {
            window.__permissionRequests = 0;
            window.__savedPreferences = null;
            Object.defineProperty(Notification, 'requestPermission', {
                configurable: true,
                value: async () => {
                    window.__permissionRequests += 1;
                    return 'denied';
                }
            });
            API.getPreferences = async () => ({ enableNotifications: false, reminderTimes: '[]' });
            API.savePreferences = async preferences => { window.__savedPreferences = preferences; };
            window.app.navigate('preferences');
        });
        await page.locator('#preferences-form').waitFor({ state: 'visible' });
        await page.locator('[name="enableNotifications"]').check();
        await page.locator('#preferences-form button[type="submit"]').click();
        await page.waitForFunction(() => window.__savedPreferences !== null);
        assert(await page.evaluate(() => window.__permissionRequests) === 0, 'saving check-in reminders does not request browser notification permission');
        assert(await page.evaluate(() => window.__savedPreferences.enableNotifications) === true, 'in-app reminders remain enabled without browser notification permission');

        await page.setViewportSize({ width: 1024, height: 768 });
        await page.evaluate(async () => {
            clearInterval(window.app._reminderInterval);
            document.querySelectorAll('.toast').forEach(toast => toast.remove());
            const today = new Date().toISOString().split('T')[0];
            localStorage.setItem('HealthLogger_notifications', 'true');
            localStorage.setItem('HealthLogger_reminders', JSON.stringify(['00:00']));
            localStorage.removeItem(`HealthLogger_reminder_shown_${today}`);
            await window.app.checkReminders();
        });
        assert(await page.locator('.toast-reminder').count() === 0, 'check-in reminder is limited to mobile or touch contexts');

        await openMealDialog(page, food);
        await page.evaluate(() => window.authManager.showLogin());
        assert(await page.locator('.portion-dialog').count() === 0, 'authentication screen removes route dialogs');
        assert(await page.locator('#welcome-dialog').isVisible(), 'authentication screen remains visible');
        assert(!(await page.locator('#app-header').isVisible()), 'hamburger stays hidden on the authentication screen');
    } finally {
        await browser.close();
    }
})().catch(error => {
    console.error(`FAIL: ${error.message}`);
    process.exitCode = 1;
});