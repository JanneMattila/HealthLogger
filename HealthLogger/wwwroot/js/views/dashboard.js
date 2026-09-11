// Dashboard view
Object.assign(App.prototype, {
    async setupDashboard() {
        this.refreshDashboardCheckinReminder();
        try {
            const today = this.getLocalDateValue();
            const [data, todayEntries] = await Promise.all([
                API.getDashboard(),
                API.getEntries(today)
            ]);
            document.getElementById('calories-today').textContent = Math.round(data.caloriesToday);
            if (data.calorieTarget) {
                document.getElementById('calorie-target-info').textContent =
                    `${this.t('calorie_target_label')}: ${data.calorieTarget} ${this.t('kcal')} (${Math.round(data.caloriesToday / data.calorieTarget * 100)}%)`;
            }

            const macros = document.getElementById('macro-bars');
            macros.innerHTML = `
                <div class="macro-bar dashboard-nutrient-link" data-nutrient="protein" role="button" tabindex="0"><div class="value">${Math.round(data.proteinToday)} g</div><div class="label">${this.t('protein_short')}</div></div>
                <div class="macro-bar dashboard-nutrient-link" data-nutrient="fat" role="button" tabindex="0"><div class="value">${Math.round(data.fatToday)} g</div><div class="label">${this.t('fat_short')}</div></div>
                <div class="macro-bar dashboard-nutrient-link" data-nutrient="carbs" role="button" tabindex="0"><div class="value">${Math.round(data.carbsToday)} g</div><div class="label">${this.t('carbs_short')}</div></div>
            `;

            const openNutrientDrilldown = nutrient => {
                this.todayNutrientTarget = nutrient;
                this.navigate('log-meal');
            };
            document.querySelectorAll('.dashboard-nutrient-link').forEach(tile => {
                tile.addEventListener('click', () => openNutrientDrilldown(tile.dataset.nutrient));
                tile.addEventListener('keydown', event => {
                    if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        openNutrientDrilldown(tile.dataset.nutrient);
                    }
                });
            });
            const calorieSummary = document.querySelector('.calorie-summary');
            if (calorieSummary) {
                calorieSummary.classList.add('dashboard-nutrient-link');
                calorieSummary.dataset.nutrient = 'calories';
                calorieSummary.setAttribute('role', 'button');
                calorieSummary.tabIndex = 0;
                calorieSummary.addEventListener('click', () => openNutrientDrilldown('calories'));
                calorieSummary.addEventListener('keydown', event => {
                    if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        openNutrientDrilldown('calories');
                    }
                });
            }

            this.renderDashboardDrinks(todayEntries);

            document.querySelector('[data-action="quick-meal"]')?.addEventListener('click', () => this.navigate('add-meal'));
            document.querySelector('[data-action="manage-meals"]')?.addEventListener('click', () => this.navigate('meals'));
            document.querySelector('[data-action="quick-drink"]')?.addEventListener('click', () => this.navigate('drinks'));
            document.querySelector('[data-action="quick-checkin"]')?.addEventListener('click', () => this.navigate('checkin'));

            if (data.weeklyCalorieTrend?.length > 0) {
                const ctx = document.getElementById('chart-weekly-calories');
                if (ctx) {
                    new Chart(ctx, {
                        type: 'bar',
                        data: {
                            labels: data.weeklyCalorieTrend.map(t => t.date),
                            datasets: [{
                                label: this.t('kcal'),
                                data: data.weeklyCalorieTrend.map(t => Math.round(t.calories)),
                                backgroundColor: '#2d7a4f88'
                            }]
                        },
                        options: { responsive: true, plugins: { legend: { display: false } } }
                    });
                }
            }
        } catch (e) {
            console.error('Dashboard load failed:', e);
        }
    },

    async refreshDashboardCheckinReminder() {
        const container = document.getElementById('dashboard-checkin-reminder');
        if (!container) return;
        const requestId = this.dashboardCheckinRequestId = (this.dashboardCheckinRequestId || 0) + 1;
        const today = this.getLocalDateValue();
        const dismissalKey = 'HealthLogger_checkin_banner_dismissed';
        try {
            const reminders = JSON.parse(localStorage.getItem('HealthLogger_reminders') || '[]');
            const now = new Date();
            const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
            const lastReminder = Array.isArray(reminders)
                ? reminders.filter(time => typeof time === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(time)).sort().at(-1)
                : null;
            if (localStorage.getItem('HealthLogger_notifications') !== 'true' || !lastReminder
                || currentTime < lastReminder || localStorage.getItem(dismissalKey) === today) {
                container.hidden = true;
                return;
            }
            let checkin;
            try {
                checkin = await API.getCheckin(today);
            } catch (error) {
                if (error.status !== 404) throw error;
            }
            if (!container.isConnected || requestId !== this.dashboardCheckinRequestId
                || today !== this.getLocalDateValue()) return;
            if (checkin || localStorage.getItem(dismissalKey) === today) {
                container.hidden = true;
                return;
            }
            if (!container.hidden) return;
            container.innerHTML = `
                <button type="button" class="dashboard-checkin-action">${this.t('reminder_checkin')}</button>
                <button type="button" class="dashboard-checkin-dismiss" title="${this.t('btn_close')}" aria-label="${this.t('btn_close')}">&times;</button>
            `;
            container.querySelector('.dashboard-checkin-action').addEventListener('click', () => this.navigate('checkin'));
            container.querySelector('.dashboard-checkin-dismiss').addEventListener('click', () => {
                localStorage.setItem(dismissalKey, this.getLocalDateValue());
                container.hidden = true;
            });
            container.hidden = false;
        } catch {
            if (requestId === this.dashboardCheckinRequestId) container.hidden = true;
        }
    },

    async refreshDashboardDrinks() {
        const today = this.getLocalDateValue();
        this.renderDashboardDrinks(await API.getEntries(today));
    },

    renderDashboardDrinks(entries) {
        const ingredientDrinks = this.getBuiltInDrinksFromEntries(entries);
        const waterMl = ingredientDrinks
            .filter(drink => drink.fineliId === 922)
            .reduce((sum, drink) => sum + drink.amountMl, 0);
        const coffeeMl = ingredientDrinks
            .filter(drink => drink.fineliId === 900)
            .reduce((sum, drink) => sum + drink.amountMl, 0);

        const drinkSummary = document.getElementById('drink-dashboard-summary');
        if (drinkSummary) {
            const builtInDrinkTotal = ingredientDrinks.reduce((sum, drink) => sum + drink.amountMl, 0);
            const drinkTotal = this.getTodayDrinkTotalMl() + builtInDrinkTotal;
            drinkSummary.innerHTML = `
                <div class="drink-dash-row" style="cursor:pointer;">
                    <span>🥤 ${this.t('drinks_today')}</span>
                    <span class="drink-dash-total">${this.formatDrinkAmount(drinkTotal)}</span>
                </div>
            `;
            drinkSummary.querySelector('.drink-dash-row')?.addEventListener('click', () => this.navigate('drinks'));
        }

        const waterTile = document.getElementById('water-intake-tile');
        if (waterTile) {
            waterTile.innerHTML = `
                <div class="water-tile" style="cursor:pointer;">
                    <span class="water-tile-icon">💧</span>
                    <div class="water-tile-info">
                        <div class="water-tile-value">${this.formatDrinkAmount(waterMl)}</div>
                        <div class="water-tile-label">${this.t('water_today')}</div>
                    </div>
                    <span class="water-tile-add">+</span>
                </div>
            `;
            waterTile.querySelector('.water-tile')?.addEventListener('click', () => this.showWaterDialog());
        }

        const coffeeTile = document.getElementById('coffee-intake-tile');
        if (coffeeTile) {
            coffeeTile.innerHTML = `
                <div class="water-tile coffee-tile" style="cursor:pointer;">
                    <span class="water-tile-icon">☕</span>
                    <div class="water-tile-info">
                        <div class="water-tile-value coffee-tile-value">${this.formatDrinkAmount(coffeeMl)}</div>
                        <div class="water-tile-label">${this.t('coffee_today')}</div>
                    </div>
                    <span class="water-tile-add">+</span>
                </div>
            `;
            coffeeTile.querySelector('.coffee-tile')?.addEventListener('click', () => this.showCoffeeDialog());
        }

        this.renderOtherDashboardDrinks(ingredientDrinks);
    },

    renderOtherDashboardDrinks(ingredientDrinks) {
        const container = document.getElementById('other-drink-intake-tiles');
        if (!container) return;

        const drinksByKey = new Map();
        ingredientDrinks
            .filter(drink => drink.fineliId !== 900 && drink.fineliId !== 922)
            .forEach(drink => {
                const key = `ingredient:${drink.fineliId}`;
                const existing = drinksByKey.get(key);
                if (existing) {
                    existing.amountMl += drink.amountMl;
                } else {
                    drinksByKey.set(key, { ...drink, type: 'ingredient' });
                }
            });

        this.getTodayDrinks().forEach(drink => {
            const key = `custom:${drink.name.trim().toLocaleLowerCase()}`;
            const existing = drinksByKey.get(key);
            if (existing) {
                existing.amountMl += drink.amountMl;
            } else {
                drinksByKey.set(key, { ...drink, type: 'custom' });
            }
        });

        const iconsByFineliId = new Map([
            [902, '🍺'],
            [906, '🥃'],
            [910, '🥤'],
            [920, '🥤']
        ]);
        container.replaceChildren(...Array.from(drinksByKey.values()).map(drink => {
            const tile = document.createElement('div');
            tile.className = 'water-tile';
            tile.style.cursor = 'pointer';

            const icon = document.createElement('span');
            icon.className = 'water-tile-icon';
            icon.textContent = drink.type === 'ingredient' ? (iconsByFineliId.get(drink.fineliId) || '🥤') : '🥤';

            const info = document.createElement('div');
            info.className = 'water-tile-info';
            const value = document.createElement('div');
            value.className = 'water-tile-value';
            value.textContent = this.formatDrinkAmount(drink.amountMl);
            const label = document.createElement('div');
            label.className = 'water-tile-label';
            label.textContent = drink.name;
            info.append(value, label);

            const add = document.createElement('span');
            add.className = 'water-tile-add';
            add.textContent = '+';
            tile.append(icon, info, add);
            tile.addEventListener('click', () => {
                if (drink.type === 'ingredient') {
                    this.showQuickDrinkDialog(icon.textContent, drink.fineliId);
                } else {
                    this.showDrinkDialog(drink.name);
                }
            });
            return tile;
        }));
    }
});
