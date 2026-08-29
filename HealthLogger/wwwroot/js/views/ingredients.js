// Ingredients view — with in-memory cache for categories and browse results
const _ingredientsCache = {
    categories: null,
    browse: {},   // keyed by `${category}|${lang}`
    allItems: null, // all items loaded for client-side search
    ttl: 5 * 60 * 1000, // 5 minutes
    clear() { this.categories = null; this.browse = {}; this.allItems = null; }
};

Object.assign(App.prototype, {
    async setupIngredients() {
        const listEl = document.getElementById('ingredients-list');
        const searchInput = document.getElementById('ingredients-search');
        const categorySelect = document.getElementById('ingredients-category');
        const lang = window.i18n?.lang || 'en';
        let searchTimeout;
        let favoriteFoodsPromise;

        const loadFavoriteFoods = () => {
            if (favoriteFoodsPromise) return favoriteFoodsPromise;
            const favorites = this.getFavorites().filter(favorite => favorite.type === 'food');
            favoriteFoodsPromise = Promise.all(favorites.map(async favorite => {
                try {
                    return await API.getFood(favorite.id);
                } catch {
                    return {
                        id: favorite.id,
                        nameFi: favorite.name,
                        nameEn: favorite.name,
                        energyKcal: favorite.kcalPer100,
                        protein: favorite.protein,
                        fat: favorite.fat,
                        carbohydrate: favorite.carbs
                    };
                }
            }));
            return favoriteFoodsPromise;
        };

        const mergeFavorites = async (items, predicate = () => true) => {
            const favorites = (await loadFavoriteFoods()).filter(predicate);
            const favoriteIds = new Set(favorites.map(food => food.id));
            return [...favorites, ...items.filter(food => !favoriteIds.has(food.id))];
        };

        const renderItems = (items, groupMatchingFavorites = false) => {
            if (!items || items.length === 0) {
                listEl.innerHTML = `<p class="empty">${this.t('no_data')}</p>`;
                return;
            }
            const favoriteIds = new Set(this.getFavorites().map(favorite => favorite.id));
            const favorites = groupMatchingFavorites
                ? items.filter(food => favoriteIds.has(food.id))
                : [];
            const otherItems = groupMatchingFavorites
                ? items.filter(food => !favoriteIds.has(food.id))
                : items;
            const renderCards = foods => foods.map(f => {
                const name = lang === 'fi' ? (f.nameFi || f.nameEn) : (f.nameEn || f.nameFi);
                const secondary = lang === 'fi' ? f.nameEn : f.nameFi;
                const isFavorite = favoriteIds.has(f.id);
                return `
                    <div class="ingredient-card" data-food-json="${encodeURIComponent(JSON.stringify(f))}">
                        <div class="ingredient-card-header">
                            <div class="ingredient-name">${name}</div>
                            <button class="btn-favorite ingredient-result-favorite ${isFavorite ? 'active' : ''}"
                                    type="button" title="${this.t('toggle_favorite')}"
                                    aria-label="${this.t('toggle_favorite')}">${isFavorite ? '★' : '☆'}</button>
                        </div>
                        ${secondary && secondary !== name ? `<div class="ingredient-secondary">${secondary}</div>` : ''}
                        ${f.category ? `<div class="ingredient-category">${f.category}</div>` : ''}
                        <div class="ingredient-macros">
                            <span>${Math.round(f.energyKcal)} kcal</span>
                            <span>P ${parseFloat(f.protein.toFixed(1))} g</span>
                            <span>F ${parseFloat(f.fat.toFixed(1))} g</span>
                            <span>C ${parseFloat(f.carbohydrate.toFixed(1))} g</span>
                        </div>
                    </div>`;
            }).join('');

            listEl.innerHTML = `
                ${favorites.length ? `<h3 class="ingredients-section-title">${this.t('favorites_title')}</h3>${renderCards(favorites)}` : ''}
                ${favorites.length && otherItems.length ? `<h3 class="ingredients-section-title">${this.t('other_products')}</h3>` : ''}
                ${renderCards(otherItems)}
            `;

            listEl.querySelectorAll('.ingredient-card').forEach(card => {
                card.addEventListener('click', () => {
                    const food = JSON.parse(decodeURIComponent(card.dataset.foodJson));
                    this.showIngredientDetail(food, lang);
                });
            });
            listEl.querySelectorAll('.ingredient-result-favorite').forEach(button => {
                button.addEventListener('click', event => {
                    event.stopPropagation();
                    const card = button.closest('.ingredient-card');
                    const food = JSON.parse(decodeURIComponent(card.dataset.foodJson));
                    const name = lang === 'fi' ? (food.nameFi || food.nameEn) : (food.nameEn || food.nameFi);
                    this.toggleFavorite({
                        id: food.id,
                        name,
                        type: 'food',
                        kcalPer100: Number(food.energyKcal) || 0,
                        protein: Number(food.protein) || 0,
                        fat: Number(food.fat) || 0,
                        carbs: Number(food.carbohydrate) || 0
                    });
                    favoriteFoodsPromise = null;
                    renderItems(items, groupMatchingFavorites);
                });
            });
        };

        const loadItems = async (category) => {
            const cacheKey = `${category || ''}|${lang}`;
            const cached = _ingredientsCache.browse[cacheKey];
            if (cached && Date.now() - cached.time < _ingredientsCache.ttl) {
                const items = await mergeFavorites(cached.data, food => !category || food.category === category);
                renderItems(items);
                return;
            }
            try {
                const items = await API.browseFoods(category || null, lang, 100, 0);
                _ingredientsCache.browse[cacheKey] = { data: items, time: Date.now() };
                const mergedItems = await mergeFavorites(items, food => !category || food.category === category);
                renderItems(mergedItems);
            } catch (e) {
                if (cached) {
                    const items = await mergeFavorites(cached.data, food => !category || food.category === category);
                    renderItems(items);
                    return;
                }
                listEl.innerHTML = `<p class="empty">${this.t('error_load_failed')}</p>`;
            }
        };

        // Load categories (cached)
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

        categorySelect?.addEventListener('change', () => {
            searchInput.value = '';
            loadItems(categorySelect.value);
        });

        // Load all items into cache for client-side search
        const ensureAllItems = async () => {
            if (_ingredientsCache.allItems) return _ingredientsCache.allItems;
            try {
                const items = await API.browseFoods(null, lang, 10000, 0);
                _ingredientsCache.allItems = items;
                return items;
            } catch (e) {
                return null;
            }
        };

        const searchLocal = (query, items) => {
            const q = query.toLowerCase();
            return items.filter(f => {
                const nameFi = (f.nameFi || '').toLowerCase();
                const nameEn = (f.nameEn || '').toLowerCase();
                return nameFi.includes(q) || nameEn.includes(q);
            }).slice(0, 100);
        };

        searchInput?.addEventListener('input', () => {
            clearTimeout(searchTimeout);
            searchTimeout = setTimeout(async () => {
                const query = searchInput.value.trim();
                if (query.length < 2) {
                    loadItems(categorySelect?.value);
                    return;
                }
                const allItems = await ensureAllItems();
                if (allItems) {
                    const matchesQuery = food => {
                        const normalizedQuery = query.toLowerCase();
                        return (food.nameFi || '').toLowerCase().includes(normalizedQuery)
                            || (food.nameEn || '').toLowerCase().includes(normalizedQuery);
                    };
                    const matches = searchLocal(query, allItems);
                    const items = await mergeFavorites(matches, matchesQuery);
                    renderItems(items, true);
                }
            }, 300);
        });

        document.getElementById('btn-barcode-ingredient')?.addEventListener('click', () => {
            this.showBarcodeDialog(food => {
                _ingredientsCache.clear();
                this.showToast(this.t('barcode_food_saved'));
                this.showIngredientDetail(food, lang);
            });
        });

        await loadItems('');
    },

    showIngredientDetail(food, lang) {
        const name = lang === 'fi' ? (food.nameFi || food.nameEn) : (food.nameEn || food.nameFi);
        const secondary = lang === 'fi' ? food.nameEn : food.nameFi;
        let defaultPortionGrams = food.defaultPortionGrams || 100;
        let unitWeightGrams = food.unitWeightGrams > 0 ? Number(food.unitWeightGrams) : null;
        const portionPresets = [...new Set([defaultPortionGrams, 25, 50, 100, 250])].sort((left, right) => left - right);
        const fmt = value => value != null ? parseFloat(Number(value).toFixed(1)) : '—';
        const isFavorite = this.isFavorite(food.id);
        const estimatedMealType = this.getEstimatedMealType();

        const overlay = document.createElement('div');
        overlay.className = 'portion-dialog';
        overlay.innerHTML = `
            <div class="portion-content ingredient-detail">
                <div class="portion-header">
                    <h3>${name}</h3>
                    <button class="btn-favorite ${isFavorite ? 'active' : ''}" id="btn-ingredient-favorite"
                            title="${this.t('toggle_favorite')}" aria-label="${this.t('toggle_favorite')}">${isFavorite ? '★' : '☆'}</button>
                </div>
                ${secondary && secondary !== name ? `<p class="ingredient-detail-secondary">${secondary}</p>` : ''}
                ${food.category ? `<p class="ingredient-detail-category">${food.category}</p>` : ''}
                <h4 id="ingredient-nutrition-heading"></h4>
                <table class="nutrient-table">
                    <tr><td>${this.t('energy')}</td><td class="nutrient-value" data-nutrient="energy"></td></tr>
                    <tr><td>${this.t('protein_short')}</td><td class="nutrient-value" data-nutrient="protein"></td></tr>
                    <tr><td>${this.t('fat_short')}</td><td class="nutrient-value" data-nutrient="fat"></td></tr>
                    <tr class="nutrient-sub"><td>${this.t('saturated_fat')}</td><td class="nutrient-value" data-nutrient="saturatedFat"></td></tr>
                    <tr><td>${this.t('carbs_short')}</td><td class="nutrient-value" data-nutrient="carbohydrate"></td></tr>
                    <tr class="nutrient-sub"><td>${this.t('sugar')}</td><td class="nutrient-value" data-nutrient="sugar"></td></tr>
                    <tr><td>${this.t('fiber_short')}</td><td class="nutrient-value" data-nutrient="fiber"></td></tr>
                    <tr><td>${this.t('salt')}</td><td class="nutrient-value" data-nutrient="salt"></td></tr>
                </table>
                ${food.fineliId ? `<p class="ingredient-source">Fineli #${food.fineliId}</p>` : ''}
                <div class="ingredient-weight-settings">
                    <h4>${this.t('ingredient_weights_title')}</h4>
                    <div class="ingredient-weight-grid">
                        <label for="ingredient-default-weight">${this.t('default_weight_grams')}</label>
                        <input type="number" id="ingredient-default-weight" value="${defaultPortionGrams}" min="0.1" step="0.1" />
                        <label for="ingredient-unit-weight">${this.t('unit_weight_grams')}</label>
                        <input type="number" id="ingredient-unit-weight" value="${unitWeightGrams ?? ''}" min="0.1" step="0.1" />
                    </div>
                    <button type="button" class="btn btn-secondary btn-sm ingredient-save-weights">${this.t('btn_save')}</button>
                </div>
                <div class="ingredient-consumption">
                    <h4>${this.t('add_as_consumption')}</h4>
                    <label for="ingredient-portion-amount">${this.t('ingredient_amount_label')}</label>
                    <div class="ingredient-amount-row">
                        <input type="number" id="ingredient-portion-amount" value="${unitWeightGrams ? 1 : defaultPortionGrams}" min="0.1" step="0.1" />
                        <select id="ingredient-portion-unit">
                            <option value="g">${this.t('unit_grams')}</option>
                            <option value="kg">${this.t('unit_kg')}</option>
                            <option value="unit" ${unitWeightGrams ? 'selected' : 'disabled'}>${this.t('unit_singular')}</option>
                        </select>
                    </div>
                    <div class="ingredient-portion-presets">
                        ${portionPresets.map(portion => `<button type="button" class="btn btn-secondary btn-sm ingredient-portion-preset" data-grams="${portion}">${fmt(portion)} g</button>`).join('')}
                    </div>
                    <div class="ingredient-meal-buttons">
                        ${this.getMealTypes().map(mealType => `
                            <button class="btn btn-primary ingredient-add-btn ${mealType === estimatedMealType ? 'active' : ''}" data-meal="${mealType}">${this.t(`meal_${mealType}`)}</button>
                        `).join('')}
                    </div>
                    <div class="consumption-time-field">
                        <label for="ingredient-consumption-time">${this.t('consumption_time')}</label>
                        <input type="time" id="ingredient-consumption-time" value="${this.getCurrentTimeValue()}" step="60" />
                    </div>
                </div>
                <button class="btn btn-secondary ingredient-close-btn">${this.t('btn_close')}</button>
            </div>
        `;
        document.body.appendChild(overlay);
        this.dismissOverlayOnClickOutside(overlay);

        const amountInput = overlay.querySelector('#ingredient-portion-amount');
        const unitSelect = overlay.querySelector('#ingredient-portion-unit');
        const unitOption = unitSelect.querySelector('option[value="unit"]');
        const defaultWeightInput = overlay.querySelector('#ingredient-default-weight');
        const unitWeightInput = overlay.querySelector('#ingredient-unit-weight');
        const getPortionGrams = () => {
            const amount = parseFloat(amountInput.value);
            if (!Number.isFinite(amount) || amount <= 0) return 0;
            if (unitSelect.value === 'unit') return unitWeightGrams ? amount * unitWeightGrams : 0;
            return unitSelect.value === 'kg' ? amount * 1000 : amount;
        };
        const scaledNutrient = (value, portionGrams) => value == null ? null : Number(value) * portionGrams / 100;
        const getNutrition = portionGrams => ({
            energyKcal: scaledNutrient(food.energyKcal || 0, portionGrams),
            energyKj: scaledNutrient(food.energyKj || 0, portionGrams),
            protein: scaledNutrient(food.protein, portionGrams),
            fat: scaledNutrient(food.fat, portionGrams),
            saturatedFat: scaledNutrient(food.saturatedFat, portionGrams),
            carbohydrate: scaledNutrient(food.carbohydrate, portionGrams),
            sugar: scaledNutrient(food.sugar, portionGrams),
            fiber: scaledNutrient(food.fiber, portionGrams),
            salt: scaledNutrient(food.salt, portionGrams)
        });
        const updateNutritionTable = () => {
            const portionGrams = getPortionGrams();
            const nutrition = getNutrition(portionGrams);
            overlay.querySelector('#ingredient-nutrition-heading').textContent = this.t('nutrition_for_portion', { amount: fmt(portionGrams) });
            overlay.querySelector('[data-nutrient="energy"]').textContent = `${Math.round(nutrition.energyKcal || 0)} kcal${nutrition.energyKj ? ` / ${Math.round(nutrition.energyKj)} kJ` : ''}`;
            ['protein', 'fat', 'saturatedFat', 'carbohydrate', 'sugar', 'fiber', 'salt'].forEach(nutrient => {
                overlay.querySelector(`[data-nutrient="${nutrient}"]`).textContent = `${fmt(nutrition[nutrient])} g`;
            });
        };
        amountInput.addEventListener('input', updateNutritionTable);
        let previousUnit = unitSelect.value;
        unitSelect.addEventListener('change', () => {
            if (unitSelect.value === 'unit') {
                amountInput.value = 1;
            } else if (previousUnit === 'unit') {
                amountInput.value = unitSelect.value === 'kg' ? defaultPortionGrams / 1000 : defaultPortionGrams;
            }
            previousUnit = unitSelect.value;
            updateNutritionTable();
        });
        overlay.querySelector('.ingredient-save-weights').addEventListener('click', async event => {
            const parsedDefaultWeight = parseFloat(defaultWeightInput.value);
            const unitWeightText = unitWeightInput.value.trim();
            const parsedUnitWeight = unitWeightText ? parseFloat(unitWeightText) : null;
            if (!Number.isFinite(parsedDefaultWeight) || parsedDefaultWeight <= 0
                || (parsedUnitWeight !== null && (!Number.isFinite(parsedUnitWeight) || parsedUnitWeight <= 0))) {
                this.showToast(this.t('ingredient_weights_invalid'), 'error');
                return;
            }

            const saveButton = event.currentTarget;
            saveButton.disabled = true;
            try {
                const updatedFood = await API.updateFoodWeights(food.id, {
                    defaultPortionGrams: parsedDefaultWeight,
                    unitWeightGrams: parsedUnitWeight
                });
                defaultPortionGrams = updatedFood.defaultPortionGrams;
                unitWeightGrams = updatedFood.unitWeightGrams;
                food.defaultPortionGrams = defaultPortionGrams;
                food.unitWeightGrams = unitWeightGrams;
                const updateCachedFood = items => items?.forEach(item => {
                    if (item.id === food.id) Object.assign(item, food);
                });
                updateCachedFood(_ingredientsCache.allItems);
                Object.values(_ingredientsCache.browse).forEach(entry => updateCachedFood(entry.data));
                document.querySelectorAll('.ingredient-card').forEach(card => {
                    const cardFood = JSON.parse(decodeURIComponent(card.dataset.foodJson));
                    if (cardFood.id === food.id) {
                        card.dataset.foodJson = encodeURIComponent(JSON.stringify({ ...cardFood, ...food }));
                    }
                });
                unitOption.disabled = !unitWeightGrams;
                if (!unitWeightGrams && unitSelect.value === 'unit') {
                    unitSelect.value = 'g';
                    previousUnit = 'g';
                    amountInput.value = defaultPortionGrams;
                }
                updateNutritionTable();
                this.showToast(this.t('ingredient_weights_saved'));
            } catch {
                this.showToast(this.t('save_failed'), 'error');
            } finally {
                saveButton.disabled = false;
            }
        });
        overlay.querySelectorAll('.ingredient-portion-preset').forEach(button => {
            button.addEventListener('click', () => {
                amountInput.value = button.dataset.grams;
                unitSelect.value = 'g';
                previousUnit = 'g';
                updateNutritionTable();
            });
        });
        updateNutritionTable();

        const favoriteButton = overlay.querySelector('#btn-ingredient-favorite');
        favoriteButton.addEventListener('click', () => {
            this.toggleFavorite({
                id: food.id,
                name,
                type: 'food',
                kcalPer100: Number(food.energyKcal) || 0,
                protein: Number(food.protein) || 0,
                fat: Number(food.fat) || 0,
                carbs: Number(food.carbohydrate) || 0
            });
            const nowFavorite = this.isFavorite(food.id);
            favoriteButton.textContent = nowFavorite ? '★' : '☆';
            favoriteButton.classList.toggle('active', nowFavorite);
        });

        overlay.querySelector('.ingredient-close-btn').addEventListener('click', () => overlay.remove());
        overlay.querySelectorAll('.ingredient-add-btn').forEach(button => {
            button.addEventListener('click', () => {
                const portionGrams = getPortionGrams();
                if (portionGrams <= 0) return;
                const mealType = button.dataset.meal;
                const nutrition = getNutrition(portionGrams);
                const confirmation = document.createElement('div');
                confirmation.className = 'portion-dialog ingredient-confirmation';
                confirmation.innerHTML = `
                    <div class="portion-content ingredient-confirmation-content">
                        <h3>${this.t('confirm_ingredient_add')}</h3>
                        <div class="ingredient-confirmation-summary">
                            <strong>${name}</strong>
                            <span>${this.t(`meal_${mealType}`)} · ${overlay.querySelector('#ingredient-consumption-time').value} · ${fmt(portionGrams)} g</span>
                        </div>
                        <table class="nutrient-table">
                            <tr><td>${this.t('energy')}</td><td class="nutrient-value">${Math.round(nutrition.energyKcal || 0)} kcal${nutrition.energyKj ? ` / ${Math.round(nutrition.energyKj)} kJ` : ''}</td></tr>
                            <tr><td>${this.t('protein_short')}</td><td class="nutrient-value">${fmt(nutrition.protein)} g</td></tr>
                            <tr><td>${this.t('fat_short')}</td><td class="nutrient-value">${fmt(nutrition.fat)} g</td></tr>
                            <tr><td>${this.t('carbs_short')}</td><td class="nutrient-value">${fmt(nutrition.carbohydrate)} g</td></tr>
                        </table>
                        <div class="portion-buttons">
                            <button type="button" class="btn btn-secondary ingredient-confirm-cancel">${this.t('btn_cancel')}</button>
                            <button type="button" class="btn btn-primary ingredient-confirm-add">${this.t('btn_add')}</button>
                        </div>
                    </div>`;
                document.body.appendChild(confirmation);
                this.dismissOverlayOnClickOutside(confirmation);
                confirmation.querySelector('.ingredient-confirm-cancel').addEventListener('click', () => confirmation.remove());
                confirmation.querySelector('.ingredient-confirm-add').addEventListener('click', async () => {
                    const confirmationButtons = confirmation.querySelectorAll('button');
                    confirmationButtons.forEach(item => { item.disabled = true; });
                    try {
                        const today = new Date().toISOString().split('T')[0];
                        const consumptionTime = overlay.querySelector('#ingredient-consumption-time').value;
                        const entry = await API.createEntry({ entryDate: today, mealType, consumptionTime: this.toApiConsumptionTime(consumptionTime) });
                        await API.addEntryItem(entry.id, { foodItemId: food.id, portionGrams });
                        this.saveRecentFoods([{ id: food.id, name, calories: nutrition.energyKcal, portion: portionGrams }]);
                        confirmation.remove();
                        overlay.remove();
                        this.showToast(this.t('ingredient_consumption_added'));
                    } catch (e) {
                        confirmationButtons.forEach(item => { item.disabled = false; });
                        this.showToast(this.t('add_failed'), 'error');
                    }
                });
            });
        });
    }
});
