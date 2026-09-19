// Drinks view
Object.assign(App.prototype, {
    getBuiltInDrinkFineliIds() {
        return [900, 902, 906, 910, 920, 922];
    },

    getDrinksStorageKey() {
        const today = this.getLocalDateValue();
        return `HealthLogger_drinks_${today}`;
    },

    getTodayDrinks() {
        try {
            return JSON.parse(localStorage.getItem(this.getDrinksStorageKey()) || '[]');
        } catch { return []; }
    },

    saveDrinks(drinks) {
        localStorage.setItem(this.getDrinksStorageKey(), JSON.stringify(drinks));
    },

    getTodayDrinkTotalMl() {
        return this.getTodayDrinks().reduce((sum, d) => sum + d.amountMl, 0);
    },

    addDrink(name, amountMl, calories = 0, mealType = this.getEstimatedMealType(), time = this.getCurrentTimeValue()) {
        const drinks = this.getTodayDrinks();
        drinks.push({ name, amountMl, calories, mealType, time });
        this.saveDrinks(drinks);
    },

    getBuiltInDrinksFromEntries(entries) {
        const builtInFineliIds = new Set(this.getBuiltInDrinkFineliIds());
        return entries.flatMap(entry => (entry.items || [])
            .filter(item => builtInFineliIds.has(item.foodItem?.fineliId))
            .map(item => ({
                source: 'ingredient',
                entryId: entry.id,
                itemId: item.id,
                mealType: entry.mealType,
                fineliId: item.foodItem.fineliId,
                name: this.getLocalizedName(item.foodItem),
                amountMl: item.portionGrams,
                calories: Math.round((item.foodItem.energyKcal || 0) * item.portionGrams / 100),
                time: entry.consumptionTime?.slice(0, 5) || new Date(item.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })
            })));
    },

    async getBuiltInDrink(fineliId) {
        this._builtInDrinkCache ??= {};
        if (!this._builtInDrinkCache[fineliId]) {
            this._builtInDrinkCache[fineliId] = await API.getFoodByFineliId(fineliId);
        }
        return this._builtInDrinkCache[fineliId];
    },

    getDrinkPortionOptions(fineliId, options = {}) {
        const isSpirit = fineliId === 906;
        const usesMl = [902, 906, 910, 920].includes(fineliId);
        return {
            defaultAmount: options.defaultAmount ?? (isSpirit ? 40 : usesMl ? 330 : 2),
            defaultUnit: options.defaultUnit ?? (usesMl ? 'ml' : 'dl'),
            presets: options.presets ?? (isSpirit ? [
                { amount: 20, label: '2 cl' },
                { amount: 40, label: '4 cl' },
                { amount: 80, label: '8 cl' }
            ] : [
                { amount: 100, label: '1 dl' },
                { amount: 200, label: '2 dl' },
                { amount: 330, label: '330 ml' },
                { amount: 500, label: '500 ml' },
                { amount: 240, label: `1 ${this.t('unit_cup')}` }
            ])
        };
    },

    async refreshAfterDrinkAdded() {
        try {
            if (this.currentPage === 'drinks') {
                this.renderDrinkFavorites();
                await this.renderDrinkLog();
            }
            if (this.currentPage === 'dashboard') await this.navigate('dashboard', { history: 'none' });
        } catch (e) {
            console.error('Drink view refresh failed:', e);
            this.showToast(this.t('error_loading'), 'error');
        }
    },

    showDrinkConsumptionDialog(food, options = {}) {
        this.showIngredientDetail(food, window.i18n?.lang || 'en', {
            ...options,
            drink: this.getDrinkPortionOptions(food.fineliId, options),
            onAdded: () => this.refreshAfterDrinkAdded()
        });
    },

    showLocalDrinkConsumptionDialog(food, returnFocus) {
        this.showDrinkConsumptionDialog(food, {
            returnFocus,
            showMealContext: true,
            onAdd: ({ name, portionGrams, nutrition, mealType, consumptionTime }) => {
                const calories = Math.round(nutrition.energyKcal || 0);
                this.addDrink(name, portionGrams, calories, mealType, consumptionTime);
                this.showToast(`${name} — ${portionGrams} ml${calories > 0 ? ` (${calories} kcal)` : ''}`);
            }
        });
    },

    async showQuickDrinkDialog(icon, fineliId, options = {}) {
        const returnFocus = getIngredientFocusTarget();
        let food;
        try {
            food = await this.getBuiltInDrink(fineliId);
        } catch (e) {
            console.error('Built-in drink load failed:', e);
            this.showToast(this.t('add_failed'), 'error');
            return;
        }

        this.showDrinkConsumptionDialog(food, { ...options, returnFocus, icon });
    },

    showWaterDialog() {
        return this.showQuickDrinkDialog('💧', 922);
    },

    showCoffeeDialog() {
        return this.showQuickDrinkDialog('☕', 900);
    },

    showBeerDialog() {
        return this.showQuickDrinkDialog('🍺', 902);
    },

    showSoftDrinkSugarDialog() {
        return this.showQuickDrinkDialog('🥤', 910);
    },

    showSoftDrinkNoSugarDialog() {
        return this.showQuickDrinkDialog('🥤', 920);
    },

    showSpiritDialog() {
        return this.showQuickDrinkDialog('🥃', 906);
    },

    showDrinkDialog(prefilledName = '') {
        const returnFocus = getIngredientFocusTarget();
        const overlay = document.createElement('div');
        overlay.className = 'portion-dialog';
        overlay.innerHTML = `
            <div class="portion-content drink-dialog">
                <div class="portion-header">
                    <button class="btn-favorite disabled" id="btn-drink-fav" title="${this.t('fav_needs_nutrition')}">☆</button>
                    <h3>${this.t('add_drink_title')}</h3>
                </div>
                <div class="drink-field">
                    <label>${this.t('drink_category_label')}</label>
                    <select id="drink-category" class="drink-category-select">
                        <option value="">${this.t('all_categories')}</option>
                    </select>
                </div>
                <div class="drink-field drink-name-field">
                    <label>${this.t('drink_name_label')}</label>
                    <input type="text" id="drink-name" value="${escapeIngredientHtml(prefilledName)}" placeholder="${this.t('drink_name_placeholder')}" autocomplete="off" />
                    <div id="drink-search-results" class="drink-search-dropdown"></div>
                </div>
                <div id="drink-nutrition-section" class="drink-nutrition-section" style="display:none;">
                    <div class="nutrition-label-header">${this.t('nutrition_facts')}</div>
                    <table class="nutrition-label-table">
                        <thead><tr><th colspan="2">${this.t('per_100ml')}</th></tr></thead>
                        <tbody>
                            <tr><td>${this.t('energy')}</td><td><input type="number" id="drink-kcal" step="0.1" min="0" class="nutrition-input-sm" /> kcal</td></tr>
                            <tr><td>${this.t('fat_short')}</td><td><input type="number" id="drink-fat" step="0.1" min="0" class="nutrition-input-sm" /> g</td></tr>
                            <tr class="indent"><td>${this.t('saturated_fat')}</td><td><input type="number" id="drink-saturated-fat" step="0.1" min="0" class="nutrition-input-sm" /> g</td></tr>
                            <tr><td>${this.t('carbs_short')}</td><td><input type="number" id="drink-carbs" step="0.1" min="0" class="nutrition-input-sm" /> g</td></tr>
                            <tr class="indent"><td>${this.t('sugar')}</td><td><input type="number" id="drink-sugar" step="0.1" min="0" class="nutrition-input-sm" /> g</td></tr>
                            <tr><td>${this.t('protein_short')}</td><td><input type="number" id="drink-protein" step="0.1" min="0" class="nutrition-input-sm" /> g</td></tr>
                            <tr><td>${this.t('salt')}</td><td><input type="number" id="drink-salt" step="0.1" min="0" class="nutrition-input-sm" /> g</td></tr>
                        </tbody>
                    </table>
                </div>
                <div id="drink-no-results" class="drink-no-results" style="display:none;">
                    <p class="drink-no-results-text">${this.t('drink_no_results')}</p>
                    <div class="drink-no-results-actions">
                        <button class="btn btn-secondary btn-sm" id="btn-drink-manual">${this.t('drink_enter_manually')}</button>
                    </div>
                </div>
                <div id="drink-nutrition-loading" style="display:none; text-align:center; padding:0.5rem; color:var(--text-secondary); font-size:0.85rem;">
                    ${this.t('loading')}
                </div>
                <div class="portion-buttons">
                    <button class="btn btn-secondary" id="btn-drink-cancel">${this.t('btn_cancel')}</button>
                    <button class="btn btn-primary" id="btn-drink-add">${this.t('btn_next')}</button>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);
        this.dismissOverlayOnClickOutside(overlay);

        const nameInput = overlay.querySelector('#drink-name');
        const nutritionSection = overlay.querySelector('#drink-nutrition-section');
        const nutritionLoading = overlay.querySelector('#drink-nutrition-loading');
        const noResultsSection = overlay.querySelector('#drink-no-results');
        const searchDropdown = overlay.querySelector('#drink-search-results');
        const favBtn = overlay.querySelector('#btn-drink-fav');
        const categorySelect = overlay.querySelector('#drink-category');
        let nutritionSearchTimeout = null;
        let hasNutrition = false;
        let customRecipes = null;

        const selectDrinkFood = (match) => {
            clearTimeout(nutritionSearchTimeout);
            overlay.remove();
            this.showLocalDrinkConsumptionDialog(match, returnFocus);
        };

        const updateFavBtn = () => {
            const drinkName = nameInput.value.trim();
            if (!drinkName || !hasNutrition) {
                favBtn.classList.add('disabled');
                favBtn.title = this.t('fav_needs_nutrition');
            } else {
                favBtn.classList.remove('disabled');
                favBtn.title = this.t('toggle_favorite');
            }
            const favId = 'drink_' + drinkName.toLowerCase();
            const isFav = drinkName ? this.isFavorite(favId) : false;
            favBtn.textContent = isFav ? '★' : '☆';
            favBtn.classList.toggle('active', isFav);
        };

        const renderDropdownResults = (items, recipes = []) => {
            items ??= [];
            if (items.length > 0 || recipes.length > 0) {
                const foodResults = items.map(f => {
                    const name = this.getLocalizedName(f);
                    const secondary = this.getSecondaryName(f);
                    return `
                        <div class="drink-search-item" data-id="${f.id}">
                            <div class="drink-search-name">${name}${secondary ? ` <span class="drink-search-secondary">${secondary}</span>` : ''}</div>
                            <div class="drink-search-kcal">${Math.round(f.energyKcal)} kcal</div>
                        </div>`;
                }).join('');
                const recipeResults = recipes.map(recipe => `
                    <div class="drink-search-item" data-recipe-id="${recipe.id}">
                        <div class="drink-search-name"><span class="drink-recipe-name"></span> <span class="drink-search-secondary">${this.t('my_recipes')}</span></div>
                    </div>
                `).join('');
                searchDropdown.innerHTML = foodResults + recipeResults;
                searchDropdown.style.display = 'block';
                searchDropdown.querySelectorAll('[data-id]').forEach(el => {
                    el.addEventListener('click', () => {
                        const match = items.find(r => r.id === el.dataset.id);
                        if (match) selectDrinkFood(match);
                    });
                });
                searchDropdown.querySelectorAll('[data-recipe-id]').forEach(el => {
                    const recipe = recipes.find(item => item.id === el.dataset.recipeId);
                    el.querySelector('.drink-recipe-name').textContent = recipe?.name || '';
                    el.addEventListener('click', () => {
                        if (!recipe) return;
                        overlay.remove();
                        this.showRecipePortionSelector(recipe, this.getEstimatedMealType(), this.getCurrentTimeValue());
                    });
                });
            } else {
                searchDropdown.innerHTML = '';
                searchDropdown.style.display = 'none';
            }
        };

        const ensureAllItems = async () => {
            if (_ingredientsCache.allItems) return _ingredientsCache.allItems;
            try {
                const lang = window.i18n?.lang || 'en';
                const items = await API.browseFoods(null, lang, 10000, 0);
                _ingredientsCache.allItems = items;
                return items;
            } catch (e) { return null; }
        };

        const searchLocal = (query, items) => {
            const q = query.toLowerCase();
            return items.filter(f => {
                const nameFi = (f.nameFi || '').toLowerCase();
                const nameEn = (f.nameEn || '').toLowerCase();
                return nameFi.includes(q) || nameEn.includes(q);
            }).slice(0, 100);
        };

        const searchDrinks = async (query) => {
            if (!query || query.length < 2) {
                searchDropdown.innerHTML = '';
                searchDropdown.style.display = 'none';
                noResultsSection.style.display = 'none';
                return;
            }
            nutritionLoading.style.display = 'block';
            noResultsSection.style.display = 'none';
            try {
                const [allItems, recipes] = await Promise.all([
                    ensureAllItems(),
                    customRecipes ? Promise.resolve(customRecipes) : API.getRecipes()
                ]);
                customRecipes = recipes || [];
                const results = allItems ? searchLocal(query, allItems) : [];
                const q = query.toLowerCase();
                const recipeResults = customRecipes.filter(recipe => recipe.name.toLowerCase().includes(q)).slice(0, 100);
                renderDropdownResults(results, recipeResults);
                if (results.length === 0 && recipeResults.length === 0) {
                    noResultsSection.style.display = 'block';
                }
            } catch (e) {
                console.error('Drink search failed:', e);
            }
            nutritionLoading.style.display = 'none';
        };

        // Listen for nutrition field changes to track hasNutrition
        nutritionSection.querySelectorAll('.nutrition-input-sm').forEach(input => {
            input.addEventListener('input', () => {
                const kcal = parseFloat(overlay.querySelector('#drink-kcal')?.value) || 0;
                hasNutrition = kcal > 0;
                updateFavBtn();
            });
        });

        nameInput?.addEventListener('input', () => {
            clearTimeout(nutritionSearchTimeout);
            nutritionSection.style.display = 'none';
            noResultsSection.style.display = 'none';
            hasNutrition = false;
            nutritionSearchTimeout = setTimeout(() => {
                searchDrinks(nameInput.value.trim());
            }, 300);
            updateFavBtn();
        });

        // Manual entry button
        overlay.querySelector('#btn-drink-manual')?.addEventListener('click', () => {
            noResultsSection.style.display = 'none';
            nutritionSection.style.display = 'block';
        });

        if (prefilledName) {
            searchDrinks(prefilledName);
        }

        // Load categories
        (async () => {
            try {
                let cats = _ingredientsCache.categories;
                if (!cats) {
                    cats = await API.getFoodCategories();
                    _ingredientsCache.categories = cats;
                }
                cats.forEach(c => {
                    const opt = document.createElement('option');
                    opt.value = c;
                    opt.textContent = c;
                    categorySelect.appendChild(opt);
                });
            } catch (e) { /* no categories */ }
            this.enhanceSelectWithSearch(categorySelect);
        })();

        categorySelect?.addEventListener('change', async () => {
            const cat = categorySelect.value;
            if (!cat) {
                searchDropdown.innerHTML = '';
                searchDropdown.style.display = 'none';
                return;
            }
            nameInput.value = '';
            nutritionSection.style.display = 'none';
            noResultsSection.style.display = 'none';
            nutritionLoading.style.display = 'block';
            try {
                const allItems = await ensureAllItems();
                if (allItems) {
                    const filtered = allItems.filter(f => f.category === cat).slice(0, 100);
                    renderDropdownResults(filtered);
                }
            } catch (e) {
                console.error('Category browse failed:', e);
            }
            nutritionLoading.style.display = 'none';
        });

        updateFavBtn();

        favBtn.onclick = () => {
            const drinkName = nameInput.value.trim();
            if (!drinkName || !hasNutrition) return;
            const favId = 'drink_' + drinkName.toLowerCase();
            this.toggleFavorite({
                id: favId,
                name: drinkName,
                type: 'drink',
                kcalPer100: parseFloat(overlay.querySelector('#drink-kcal')?.value) || 0,
                protein: parseFloat(overlay.querySelector('#drink-protein')?.value) || 0,
                fat: parseFloat(overlay.querySelector('#drink-fat')?.value) || 0,
                carbs: parseFloat(overlay.querySelector('#drink-carbs')?.value) || 0
            });
            updateFavBtn();
        };

        overlay.querySelector('#btn-drink-cancel').onclick = () => overlay.remove();
        overlay.querySelector('#btn-drink-add').onclick = () => {
            const name = nameInput.value.trim() || this.t('drink_default');
            const food = {
                id: 'drink_' + name.toLowerCase(),
                nameEn: name,
                nameFi: name,
                energyKcal: parseFloat(overlay.querySelector('#drink-kcal').value) || 0,
                fat: parseFloat(overlay.querySelector('#drink-fat').value) || 0,
                saturatedFat: parseFloat(overlay.querySelector('#drink-saturated-fat').value) || 0,
                carbohydrate: parseFloat(overlay.querySelector('#drink-carbs').value) || 0,
                sugar: parseFloat(overlay.querySelector('#drink-sugar').value) || 0,
                protein: parseFloat(overlay.querySelector('#drink-protein').value) || 0,
                salt: parseFloat(overlay.querySelector('#drink-salt').value) || 0
            };
            clearTimeout(nutritionSearchTimeout);
            overlay.remove();
            this.showLocalDrinkConsumptionDialog(food, returnFocus);
        };

        if (!prefilledName) nameInput.focus();
    },

    async _scanDrinkNutrition(drinkName) {
        this.showToast(this.t('searching'), 'success');
        try {
            const result = await API.searchNutritionOnline(drinkName);
            if (result && !result.error && result.per100g) {
                const dialog = this.showDrinkDialog(drinkName);
                // Re-open dialog is already done, need to fill after it opens
                setTimeout(() => {
                    const kcalEl = document.querySelector('#drink-kcal');
                    if (kcalEl) {
                        kcalEl.value = result.per100g.calories ?? '';
                        document.querySelector('#drink-fat').value = result.per100g.fat ?? '';
                        document.querySelector('#drink-saturated-fat').value = result.per100g.saturatedFat ?? '';
                        document.querySelector('#drink-carbs').value = result.per100g.carbohydrate ?? '';
                        document.querySelector('#drink-sugar').value = result.per100g.sugar ?? '';
                        document.querySelector('#drink-protein').value = result.per100g.protein ?? '';
                        document.querySelector('#drink-salt').value = result.per100g.salt ?? '';
                        document.querySelector('#drink-nutrition-section').style.display = 'block';
                        // Trigger input event to update hasNutrition
                        kcalEl.dispatchEvent(new Event('input'));
                    }
                }, 100);
            } else {
                this.showToast(this.t('search_failed'), 'error');
                this.showDrinkDialog(drinkName);
            }
        } catch (e) {
            console.error('AI nutrition search failed:', e);
            this.showToast(this.t('search_failed'), 'error');
            this.showDrinkDialog(drinkName);
        }
    },

    async setupDrinks() {
        document.getElementById('btn-quick-water')?.addEventListener('click', () => {
            this.showWaterDialog();
        });
        document.getElementById('btn-quick-coffee')?.addEventListener('click', () => this.showCoffeeDialog());
        document.getElementById('btn-quick-beer')?.addEventListener('click', () => this.showBeerDialog());
        document.getElementById('btn-quick-soft-drink-sugar')?.addEventListener('click', () => this.showSoftDrinkSugarDialog());
        document.getElementById('btn-quick-soft-drink-no-sugar')?.addEventListener('click', () => this.showSoftDrinkNoSugarDialog());
        document.getElementById('btn-quick-spirit')?.addEventListener('click', () => this.showSpiritDialog());
        document.getElementById('btn-add-custom-drink')?.addEventListener('click', () => {
            this.showDrinkDialog('');
        });
        this.renderDrinkFavorites();
        await this.renderDrinkLog();
    },

    renderDrinkFavorites() {
        const container = document.getElementById('drink-favorites');
        if (!container) return;
        const favs = this.getFavorites().filter(f => f.type === 'drink');
        if (favs.length === 0) {
            container.innerHTML = '';
            return;
        }
        container.innerHTML = `<h3>${this.t('favorites_title')}</h3>
            <div class="drink-favorites-list">${favs.map(f => `
                <button class="btn btn-secondary drink-quick-btn drink-fav-btn" data-name="${f.name}">
                    ⭐ ${f.name}
                </button>
            `).join('')}</div>`;
        container.querySelectorAll('.drink-fav-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                this.showDrinkDialog(btn.dataset.name);
            });
        });
    },

    async renderDrinkLog() {
        const localDrinks = this.getTodayDrinks().map((drink, localIndex) => ({
            ...drink,
            source: 'local',
            localIndex
        }));
        let ingredientDrinks = [];
        try {
            const today = this.getLocalDateValue();
            ingredientDrinks = this.getBuiltInDrinksFromEntries(await API.getEntries(today));
        } catch (e) {
            console.error('Built-in drinks load failed:', e);
        }
        const drinks = [...ingredientDrinks, ...localDrinks];
        const totalMl = drinks.reduce((sum, d) => sum + d.amountMl, 0);

        const totalEl = document.getElementById('drink-total-ml');
        if (totalEl) totalEl.textContent = totalMl;

        const list = document.getElementById('drink-log-list');
        if (!list) return;

        if (drinks.length === 0) {
            list.innerHTML = `<p class="empty">${this.t('no_drinks_yet')}</p>`;
            return;
        }

        list.innerHTML = drinks.map((d, i) => `
            <div class="meal-item drink-item" data-index="${i}" style="cursor:pointer;">
                <span class="drink-item-info">${d.time} \u2014 ${d.name}${d.mealType ? ` · ${this.t(`meal_${d.mealType}`)}` : ''}</span>
                <span class="drink-item-amount">${this.formatDrinkAmount(d.amountMl)}${d.calories ? ` \u00b7 ${d.calories} kcal` : ''}</span>
                <button class="remove-btn" data-index="${i}">\u2715</button>
            </div>
        `).join('') + `<div class="meal-total">${this.t('total')}: ${this.formatDrinkAmount(totalMl)}</div>`;

        list.querySelectorAll('.remove-btn').forEach(btn => {
            btn.onclick = async (e) => {
                e.stopPropagation();
                const drink = drinks[parseInt(btn.dataset.index)];
                if (!drink) return;
                if (drink.source === 'ingredient') {
                    await API.removeEntryItem(drink.entryId, drink.itemId);
                } else {
                    const storedDrinks = this.getTodayDrinks();
                    storedDrinks.splice(drink.localIndex, 1);
                    this.saveDrinks(storedDrinks);
                }
                await this.renderDrinkLog();
            };
        });

        list.querySelectorAll('.drink-item').forEach(el => {
            el.addEventListener('click', (e) => {
                if (e.target.classList.contains('remove-btn')) return;
                const idx = parseInt(el.dataset.index);
                const drink = drinks[idx];
                if (!drink) return;
                if (drink.source === 'ingredient') {
                    this.showEditBuiltInDrinkDialog(drink);
                } else {
                    this.showEditDrinkDialog(drink.localIndex, drink);
                }
            });
        });
    },

    showEditBuiltInDrinkDialog(drink) {
        const overlay = document.createElement('div');
        overlay.className = 'portion-dialog';
        overlay.innerHTML = `
            <div class="portion-content drink-dialog">
                <h3>${drink.name}</h3>
                <div class="drink-field">
                    <label>${this.t('drink_amount_label')}</label>
                    <div class="drink-amount-row">
                        <input type="number" id="edit-drink-amount" value="${drink.amountMl}" min="1" step="10" />
                        <span>ml</span>
                    </div>
                </div>
                <div class="portion-buttons">
                    <button class="btn btn-danger" id="btn-edit-drink-delete">${this.t('btn_delete')}</button>
                    <button class="btn btn-secondary" id="btn-edit-drink-cancel">${this.t('btn_cancel')}</button>
                    <button class="btn btn-primary" id="btn-edit-drink-save">${this.t('btn_save')}</button>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);
        this.dismissOverlayOnClickOutside(overlay);

        overlay.querySelector('#btn-edit-drink-cancel').onclick = () => overlay.remove();
        overlay.querySelector('#btn-edit-drink-delete').onclick = async () => {
            await API.removeEntryItem(drink.entryId, drink.itemId);
            overlay.remove();
            await this.renderDrinkLog();
            this.showToast(this.t('toast_deleted'));
        };
        overlay.querySelector('#btn-edit-drink-save').onclick = async () => {
            const newMl = parseInt(overlay.querySelector('#edit-drink-amount').value) || drink.amountMl;
            await API.updateEntryItem(drink.entryId, drink.itemId, {
                portionGrams: newMl,
                mealType: drink.mealType
            });
            overlay.remove();
            await this.renderDrinkLog();
            this.showToast(this.t('toast_saved'));
        };
    },

    showEditDrinkDialog(index, drink) {
        const overlay = document.createElement('div');
        overlay.className = 'portion-dialog';
        overlay.innerHTML = `
            <div class="portion-content drink-dialog">
                <h3>${drink.name}</h3>
                <div class="drink-field">
                    <label>${this.t('drink_amount_label')}</label>
                    <div class="drink-amount-row">
                        <input type="number" id="edit-drink-amount" value="${drink.amountMl}" min="1" step="10" />
                        <span>ml</span>
                    </div>
                </div>
                <div class="drink-presets">
                    <button class="btn btn-secondary btn-sm drink-preset" data-amount="100">1 dl</button>
                    <button class="btn btn-secondary btn-sm drink-preset" data-amount="200">2 dl</button>
                    <button class="btn btn-secondary btn-sm drink-preset" data-amount="330">330 ml</button>
                    <button class="btn btn-secondary btn-sm drink-preset" data-amount="500">500 ml</button>
                </div>
                <div class="portion-buttons">
                    <button class="btn btn-danger" id="btn-edit-drink-delete">${this.t('btn_delete')}</button>
                    <button class="btn btn-secondary" id="btn-edit-drink-cancel">${this.t('btn_cancel')}</button>
                    <button class="btn btn-primary" id="btn-edit-drink-save">${this.t('btn_save')}</button>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);
        this.dismissOverlayOnClickOutside(overlay);

        const amountInput = overlay.querySelector('#edit-drink-amount');

        overlay.querySelectorAll('.drink-preset').forEach(btn => {
            btn.addEventListener('click', () => {
                amountInput.value = btn.dataset.amount;
            });
        });

        overlay.querySelector('#btn-edit-drink-cancel').onclick = () => overlay.remove();
        overlay.querySelector('#btn-edit-drink-delete').onclick = () => {
            const drinks = this.getTodayDrinks();
            drinks.splice(index, 1);
            this.saveDrinks(drinks);
            overlay.remove();
            this.renderDrinkLog();
            this.showToast(this.t('toast_deleted'));
        };
        overlay.querySelector('#btn-edit-drink-save').onclick = () => {
            const newMl = parseInt(amountInput.value) || drink.amountMl;
            const drinks = this.getTodayDrinks();
            if (drinks[index]) {
                const oldMl = drinks[index].amountMl;
                drinks[index].amountMl = newMl;
                if (drinks[index].calories && oldMl > 0) {
                    drinks[index].calories = Math.round(drinks[index].calories * newMl / oldMl);
                }
                this.saveDrinks(drinks);
            }
            overlay.remove();
            this.renderDrinkLog();
            this.showToast(this.t('toast_saved'));
        };
    }
});
