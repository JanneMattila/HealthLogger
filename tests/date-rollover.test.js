const { chromium } = require('playwright');

const baseUrl = process.env.HEALTH_LOGGER_URL || 'http://localhost:5188';

function assert(condition, message) {
    if (!condition) throw new Error(message);
    console.log(`PASS: ${message}`);
}

async function runRolloverScenario(browser, scenario) {
    const context = await browser.newContext({
        serviceWorkers: 'block',
        timezoneId: scenario.timezoneId
    });
    const page = await context.newPage();

    try {
        await page.clock.install({ time: new Date(scenario.initialTime) });
        await page.goto(baseUrl, { waitUntil: 'load' });
        await page.locator('#welcome-dialog').waitFor({ state: 'visible' });
        await page.evaluate(() => {
            window.__dashboardEntryDates = [];
            window.__dateCalls = {
                entries: [],
                checkins: [],
                metrics: [],
                calories: [],
                wellness: [],
                macros: []
            };
            API.getDashboard = async () => ({
                caloriesToday: 0,
                calorieTarget: 0,
                proteinToday: 0,
                fatToday: 0,
                carbsToday: 0,
                weeklyCalorieTrend: []
            });
            API.getEntries = async date => {
                window.__dashboardEntryDates.push(date);
                window.__dateCalls.entries.push({ page: window.app.currentPage, date });
                return [];
            };
            API.getCheckin = async date => {
                window.__dateCalls.checkins.push(date);
                return null;
            };
            API.getLatestMetrics = async () => null;
            API.getMetrics = async (from, to) => {
                window.__dateCalls.metrics.push({ from, to });
                return [];
            };
            API.getCalorieTrend = async (from, to) => {
                window.__dateCalls.calories.push({ from, to });
                return [];
            };
            API.getWellnessTrend = async (from, to) => {
                window.__dateCalls.wellness.push({ from, to });
                return [];
            };
            API.getMacroDistribution = async (from, to) => {
                window.__dateCalls.macros.push({ from, to });
                return null;
            };
            API.getFoodCategories = async () => [];
            API.getRecipes = async () => [];
            API.browseFoods = async () => [];
            window.app.init();
        });
        await page.waitForFunction(() => window.__dashboardEntryDates.length === 1);

        let dates = await page.evaluate(() => [...window.__dashboardEntryDates]);
        assert(dates[0] === scenario.initialLocalDate,
            `${scenario.name} initializes dashboard with the local calendar date`);

        await page.clock.setFixedTime(new Date(scenario.sameDayTime));
        await page.evaluate(() => window.dispatchEvent(new Event('focus')));
        dates = await page.evaluate(() => [...window.__dashboardEntryDates]);
        assert(dates.length === 1,
            `${scenario.name} same-local-day focus does not refresh the dashboard`);

        await page.clock.setFixedTime(new Date(scenario.nextDayTime));
        await page.evaluate(() => {
            window.dispatchEvent(new Event('focus'));
            document.dispatchEvent(new Event('visibilitychange'));
        });
        await page.waitForFunction(() => window.__dashboardEntryDates.length === 2);
        dates = await page.evaluate(() => [...window.__dashboardEntryDates]);
        assert(dates[1] === scenario.nextLocalDate,
            `${scenario.name} next-local-day focus refreshes with the new local date`);
        assert(dates.length === 2,
            `${scenario.name} focus and visibility events deduplicate the rollover refresh`);

        for (const pageName of ['log-meal', 'meals', 'drinks']) {
            await page.evaluate(page => window.app.navigate(page), pageName);
            await page.waitForFunction(page => window.__dateCalls.entries.some(call => call.page === page), pageName);
        }
        await page.evaluate(() => window.app.navigate('checkin'));
        await page.waitForFunction(() => window.__dateCalls.checkins.length > 0);
        await page.evaluate(() => window.app.navigate('metrics'));
        await page.waitForFunction(() => window.__dateCalls.metrics.length > 0);
        await page.evaluate(() => window.app.navigate('stats'));
        await page.waitForFunction(() => window.__dateCalls.macros.length > 0);

        const viewDates = await page.evaluate(() => ({
            entries: window.__dateCalls.entries,
            checkin: window.__dateCalls.checkins.at(-1),
            metrics: window.__dateCalls.metrics.at(-1),
            calories: window.__dateCalls.calories.at(-1),
            wellness: window.__dateCalls.wellness.at(-1),
            macros: window.__dateCalls.macros.at(-1),
            drinksStorageKey: window.app.getDrinksStorageKey()
        }));
        for (const pageName of ['dashboard', 'log-meal', 'meals', 'drinks']) {
            assert(viewDates.entries.some(call => call.page === pageName && call.date === scenario.nextLocalDate),
                `${scenario.name} ${pageName} queries the current local day`);
        }
        assert(viewDates.checkin === scenario.nextLocalDate,
            `${scenario.name} check-in queries the current local day`);
        for (const [viewName, range] of Object.entries({
            metrics: viewDates.metrics,
            calories: viewDates.calories,
            wellness: viewDates.wellness,
            macros: viewDates.macros
        })) {
            assert(range.to === scenario.nextLocalDate,
                `${scenario.name} ${viewName} range ends on the current local day`);
        }
        assert(viewDates.drinksStorageKey === `HealthLogger_drinks_${scenario.nextLocalDate}`,
            `${scenario.name} drink storage is partitioned by local day`);
    } finally {
        await context.close();
    }
}

async function runReminderDateScenario(browser, scenario) {
    const context = await browser.newContext({
        serviceWorkers: 'block',
        timezoneId: scenario.timezoneId
    });
    const page = await context.newPage();

    try {
        await page.clock.install({ time: new Date(scenario.time) });
        await page.goto(baseUrl, { waitUntil: 'load' });
        await page.evaluate(reminderTime => {
            window.__reminderCheckinDates = [];
            window.__reminderToastCount = 0;
            window.matchMedia = () => ({ matches: true });
            localStorage.setItem('HealthLogger_notifications', 'true');
            localStorage.setItem('HealthLogger_reminders', JSON.stringify([reminderTime]));
            API.getCheckin = async date => {
                window.__reminderCheckinDates.push(date);
                throw Object.assign(new Error('Not found'), { status: 404 });
            };
            window.app.showToast = () => { window.__reminderToastCount += 1; };
        }, scenario.reminderTime);

        await page.evaluate(() => window.app.checkReminders());
        const result = await page.evaluate(() => ({
            checkinDates: window.__reminderCheckinDates,
            toastCount: window.__reminderToastCount,
            reminderKeys: Object.keys(localStorage).filter(key => key.startsWith('HealthLogger_reminder_shown_'))
        }));
        assert(result.checkinDates.length === 1 && result.checkinDates[0] === scenario.localDate,
            `${scenario.name} reminder checks the local calendar date`);
        assert(result.reminderKeys.length === 1
            && result.reminderKeys[0] === `HealthLogger_reminder_shown_${scenario.localDate}`,
        `${scenario.name} reminder storage is partitioned by local calendar date`);
        assert(result.toastCount === 1,
            `${scenario.name} due reminder remains observable after a missing check-in`);
    } finally {
        await context.close();
    }
}

(async () => {
    const browser = await chromium.launch({ headless: true });
    try {
        await runRolloverScenario(browser, {
            name: 'positive UTC offset',
            timezoneId: 'Asia/Kathmandu',
            initialTime: '2026-09-05T18:20:00Z',
            sameDayTime: '2026-09-06T10:00:00Z',
            nextDayTime: '2026-09-06T18:20:00Z',
            initialLocalDate: '2026-09-06',
            nextLocalDate: '2026-09-07'
        });
        await runRolloverScenario(browser, {
            name: 'negative UTC offset',
            timezoneId: 'America/Los_Angeles',
            initialTime: '2026-09-06T06:30:00Z',
            sameDayTime: '2026-09-06T06:45:00Z',
            nextDayTime: '2026-09-06T07:05:00Z',
            initialLocalDate: '2026-09-05',
            nextLocalDate: '2026-09-06'
        });
        await runReminderDateScenario(browser, {
            name: 'positive UTC offset near midnight',
            timezoneId: 'Asia/Kathmandu',
            time: '2026-09-06T18:20:00Z',
            reminderTime: '00:01',
            localDate: '2026-09-07'
        });
        await runReminderDateScenario(browser, {
            name: 'negative UTC offset near midnight',
            timezoneId: 'America/Los_Angeles',
            time: '2026-09-06T06:30:00Z',
            reminderTime: '23:00',
            localDate: '2026-09-05'
        });
    } finally {
        await browser.close();
    }
})().catch(error => {
    console.error(`FAIL: ${error.message}`);
    process.exitCode = 1;
});