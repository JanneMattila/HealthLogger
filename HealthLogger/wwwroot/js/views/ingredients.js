// Ingredients view — with in-memory cache for categories and browse results
const _ingredientsCache = {
    categories: null,
    browse: {},   // keyed by `${category}|${lang}`
    allItems: null, // all items loaded for client-side search
    ttl: 5 * 60 * 1000, // 5 minutes
    clear() { this.categories = null; this.browse = {}; this.allItems = null; }
};

const escapeIngredientHtml = value => String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');

const ingredientNumber = value => Number.isFinite(Number(value)) ? Number(value) : 0;
let ingredientDialogSequence = 0;

const getIngredientFocusTarget = () => document.activeElement instanceof HTMLElement
    ? document.activeElement
    : null;

const restoreIngredientFocus = target => {
    setTimeout(() => {
        if (target?.isConnected) target.focus();
    }, 0);
};

const updateIngredientReferences = (food, lang) => {
    const updateItems = items => items?.forEach(item => {
        if (item.id === food.id) Object.assign(item, food);
    });
    updateItems(_ingredientsCache.allItems);
    Object.values(_ingredientsCache.browse).forEach(entry => updateItems(entry.data));

    document.querySelectorAll('.ingredient-card').forEach(card => {
        const cardFood = JSON.parse(decodeURIComponent(card.dataset.foodJson));
        if (cardFood.id !== food.id) return;

        card.dataset.foodJson = encodeURIComponent(JSON.stringify({ ...cardFood, ...food }));
        const name = lang === 'fi' ? (food.nameFi || food.nameEn) : (food.nameEn || food.nameFi);
        const secondary = lang === 'fi' ? food.nameEn : food.nameFi;
        card.querySelector('.ingredient-name').textContent = name;

        let secondaryElement = card.querySelector('.ingredient-secondary');
        if (secondary && secondary !== name) {
            if (!secondaryElement) {
                secondaryElement = document.createElement('div');
                secondaryElement.className = 'ingredient-secondary';
                card.querySelector('.ingredient-card-header').after(secondaryElement);
            }
            secondaryElement.textContent = secondary;
        } else {
            secondaryElement?.remove();
        }

        let categoryElement = card.querySelector('.ingredient-category');
        if (food.category) {
            if (!categoryElement) {
                categoryElement = document.createElement('div');
                categoryElement.className = 'ingredient-category';
                (secondaryElement || card.querySelector('.ingredient-card-header')).after(categoryElement);
            }
            categoryElement.textContent = food.category;
        } else {
            categoryElement?.remove();
        }

        const macros = card.querySelectorAll('.ingredient-macros span');
        if (macros.length === 4) {
            macros[0].textContent = `${Math.round(ingredientNumber(food.energyKcal))} kcal`;
            macros[1].textContent = `P ${parseFloat(ingredientNumber(food.protein).toFixed(1))} g`;
            macros[2].textContent = `F ${parseFloat(ingredientNumber(food.fat).toFixed(1))} g`;
            macros[3].textContent = `C ${parseFloat(ingredientNumber(food.carbohydrate).toFixed(1))} g`;
        }
    });
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
                    <div class="ingredient-card" role="button" tabindex="0" data-food-json="${encodeURIComponent(JSON.stringify(f))}">
                        <div class="ingredient-card-header">
                            <div class="ingredient-name">${escapeIngredientHtml(name)}</div>
                            <button class="btn-favorite ingredient-result-favorite ${isFavorite ? 'active' : ''}"
                                    type="button" title="${this.t('toggle_favorite')}"
                                    aria-label="${this.t('toggle_favorite')}">${isFavorite ? '★' : '☆'}</button>
                        </div>
                        ${secondary && secondary !== name ? `<div class="ingredient-secondary">${escapeIngredientHtml(secondary)}</div>` : ''}
                        ${f.category ? `<div class="ingredient-category">${escapeIngredientHtml(f.category)}</div>` : ''}
                        <div class="ingredient-macros">
                            <span>${Math.round(ingredientNumber(f.energyKcal))} kcal</span>
                            <span>P ${parseFloat(ingredientNumber(f.protein).toFixed(1))} g</span>
                            <span>F ${parseFloat(ingredientNumber(f.fat).toFixed(1))} g</span>
                            <span>C ${parseFloat(ingredientNumber(f.carbohydrate).toFixed(1))} g</span>
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
                card.addEventListener('keydown', event => {
                    if (event.target !== card || (event.key !== 'Enter' && event.key !== ' ')) return;
                    event.preventDefault();
                    card.click();
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

        document.getElementById('btn-barcode-ingredient')?.addEventListener('click', event => {
            const returnFocus = event.currentTarget;
            this.showBarcodeDialog(food => {
                _ingredientsCache.clear();
                this.showToast(this.t('barcode_food_saved'));
                this.showIngredientDetail(food, lang);
            }, {
                onManualEntry: () => this.showIngredientEditor(null, lang, { returnFocus })
            });
        });

        listEl.refreshIngredients = () => {
            favoriteFoodsPromise = null;
            return loadItems(categorySelect?.value);
        };
        await loadItems('');
    },

    showIngredientDetail(food, lang, options = {}) {
        const name = lang === 'fi' ? (food.nameFi || food.nameEn) : (food.nameEn || food.nameFi);
        const secondary = lang === 'fi' ? food.nameEn : food.nameFi;
        const returnFocus = options.returnFocus ?? getIngredientFocusTarget();
        const dialogId = `ingredient-detail-${++ingredientDialogSequence}`;
        const ids = {
            title: `${dialogId}-title`,
            favorite: `${dialogId}-favorite`,
            nutrition: `${dialogId}-nutrition`,
            defaultWeight: `${dialogId}-default-weight`,
            unitWeight: `${dialogId}-unit-weight`,
            amount: `${dialogId}-amount`,
            unit: `${dialogId}-unit`,
            consumptionTime: `${dialogId}-consumption-time`,
            mealType: `${dialogId}-meal-type`
        };
        let defaultPortionGrams = food.defaultPortionGrams || 100;
        let unitWeightGrams = food.unitWeightGrams > 0 ? Number(food.unitWeightGrams) : null;
        const portionPresets = [...new Set([defaultPortionGrams, 25, 50, 100, 250])].sort((left, right) => left - right);
        const unitPresets = [1, 2, 3, 4, 5];
        const fmt = value => value != null ? parseFloat(Number(value).toFixed(1)) : '—';
        const isFavorite = this.isFavorite(food.id);
        const estimatedMealType = this.getEstimatedMealType();

        const overlay = document.createElement('div');
        overlay.className = 'portion-dialog';
        overlay.innerHTML = `
            <div class="portion-content ingredient-detail" role="dialog" aria-modal="true" aria-labelledby="${ids.title}">
                <div class="portion-header">
                    <h3 class="ingredient-detail-title" id="${ids.title}">${escapeIngredientHtml(name)}</h3>
                    ${food.isUserCreated ? `<button class="btn btn-secondary btn-sm ingredient-edit-btn" type="button">${this.t('btn_edit')}</button>` : ''}
                    <button class="btn-favorite btn-ingredient-favorite ${isFavorite ? 'active' : ''}" id="${ids.favorite}"
                            title="${this.t('toggle_favorite')}" aria-label="${this.t('toggle_favorite')}">${isFavorite ? '★' : '☆'}</button>
                </div>
                ${secondary && secondary !== name ? `<p class="ingredient-detail-secondary">${escapeIngredientHtml(secondary)}</p>` : ''}
                ${food.category ? `<p class="ingredient-detail-category">${escapeIngredientHtml(food.category)}</p>` : ''}
                <h4 class="ingredient-nutrition-heading" id="${ids.nutrition}"></h4>
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
                        <label for="${ids.defaultWeight}">${this.t('default_weight_grams')}</label>
                        <input type="number" id="${ids.defaultWeight}" value="${defaultPortionGrams}" min="0.1" step="0.1" />
                        <label for="${ids.unitWeight}">${this.t('unit_weight_grams')}</label>
                        <input type="number" id="${ids.unitWeight}" value="${unitWeightGrams ?? ''}" min="0.1" step="0.1" />
                    </div>
                    <button type="button" class="btn btn-secondary btn-sm ingredient-save-weights">${this.t('btn_save')}</button>
                </div>
                <div class="ingredient-consumption">
                    <h4>${this.t('add_as_consumption')}</h4>
                    <label for="${ids.amount}">${this.t('ingredient_amount_label')}</label>
                    <div class="ingredient-amount-row">
                        <input class="ingredient-portion-amount" type="number" id="${ids.amount}" value="${unitWeightGrams ? 1 : defaultPortionGrams}" min="0.1" step="0.1" />
                        <label class="visually-hidden" for="${ids.unit}">${this.t('unit_singular')}</label>
                        <select id="${ids.unit}">
                            <option value="g">${this.t('unit_grams')}</option>
                            <option value="unit" ${unitWeightGrams ? 'selected' : 'disabled'}>${this.t('unit_singular')}</option>
                        </select>
                    </div>
                    <div class="ingredient-portion-presets">
                    </div>
                    ${options.onAdd ? '' : `<div class="consumption-time-field">
                        <label for="${ids.consumptionTime}">${this.t('consumption_time')}</label>
                        <input type="time" id="${ids.consumptionTime}" value="${this.getCurrentTimeValue()}" step="60" />
                    </div>
                    <div class="ingredient-meal-field">
                        <label for="${ids.mealType}">${this.t('meal_type_label')}</label>
                        <select id="${ids.mealType}">
                            ${this.getMealTypes().map(mealType => `
                                <option value="${mealType}" ${mealType === estimatedMealType ? 'selected' : ''}>${this.t(`meal_${mealType}`)}</option>
                            `).join('')}
                        </select>
                    </div>`}
                    <button type="button" class="btn btn-primary ingredient-add-btn">${this.t('btn_add')}</button>
                </div>
                <button class="btn btn-secondary ingredient-close-btn">${this.t('btn_close')}</button>
            </div>
        `;
        document.body.appendChild(overlay);
        const closeDetail = (restoreFocus = true) => {
            overlay.remove();
            if (restoreFocus) restoreIngredientFocus(returnFocus);
        };
        this.dismissOverlayOnClickOutside(overlay, closeDetail);

        overlay.querySelector('.ingredient-edit-btn')?.addEventListener('click', () => {
            closeDetail(false);
            this.showIngredientEditor(food, lang, { ...options, returnFocus });
        });

        const amountInput = overlay.querySelector(`#${ids.amount}`);
        const unitSelect = overlay.querySelector(`#${ids.unit}`);
        const unitOption = unitSelect.querySelector('option[value="unit"]');
        const defaultWeightInput = overlay.querySelector(`#${ids.defaultWeight}`);
        const unitWeightInput = overlay.querySelector(`#${ids.unitWeight}`);
        const getPortionGrams = () => {
            const amount = parseFloat(amountInput.value);
            if (!Number.isFinite(amount) || amount <= 0) return 0;
            if (unitSelect.value === 'unit') return unitWeightGrams ? amount * unitWeightGrams : 0;
            return amount;
        };
        const renderPortionPresets = () => {
            const presets = unitSelect.value === 'unit' ? unitPresets : portionPresets;
            const isUnit = unitSelect.value === 'unit';
            overlay.querySelector('.ingredient-portion-presets').innerHTML = presets.map(portion =>
                `<button type="button" class="btn btn-secondary btn-sm ingredient-portion-preset" data-amount="${portion}">${isUnit ? `+ ${fmt(portion)}` : `+${fmt(portion)} g`}</button>`
            ).join('');
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
            overlay.querySelector(`#${ids.nutrition}`).textContent = this.t('nutrition_for_portion', { amount: fmt(portionGrams) });
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
                amountInput.value = defaultPortionGrams;
            }
            previousUnit = unitSelect.value;
            renderPortionPresets();
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
                updateIngredientReferences(food, lang);
                unitOption.disabled = !unitWeightGrams;
                if (!unitWeightGrams && unitSelect.value === 'unit') {
                    unitSelect.value = 'g';
                    previousUnit = 'g';
                    amountInput.value = defaultPortionGrams;
                }
                updateNutritionTable();
                this.showToast(this.t('ingredient_weights_saved'));
            } catch {
                this.showToast(this.t('toast_save_failed'), 'error');
            } finally {
                saveButton.disabled = false;
            }
        });
        overlay.querySelector('.ingredient-portion-presets').addEventListener('click', event => {
            const button = event.target.closest('.ingredient-portion-preset');
            if (!button) return;
            const currentAmount = Number(amountInput.value) || 0;
            amountInput.value = parseFloat((currentAmount + Number(button.dataset.amount)).toFixed(1));
            updateNutritionTable();
        });
        renderPortionPresets();
        updateNutritionTable();

        const favoriteButton = overlay.querySelector('.btn-ingredient-favorite');
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

        overlay.querySelector('.ingredient-close-btn').addEventListener('click', closeDetail);
        const consumptionTimeInput = overlay.querySelector(`#${ids.consumptionTime}`);
        const mealTypeSelect = overlay.querySelector(`#${ids.mealType}`);
        consumptionTimeInput?.addEventListener('change', () => {
            const [hours, minutes] = consumptionTimeInput.value.split(':').map(Number);
            if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return;
            const selectedTime = new Date();
            selectedTime.setHours(hours, minutes, 0, 0);
            mealTypeSelect.value = this.getEstimatedMealType(selectedTime);
        });
        overlay.querySelector('.ingredient-add-btn').addEventListener('click', event => {
            const portionGrams = getPortionGrams();
            if (portionGrams <= 0) return;
            const nutrition = getNutrition(portionGrams);
            const mealContext = options.getMealContext?.() || {};
            const mealType = mealContext.mealType || mealTypeSelect.value;
            const consumptionTime = mealContext.consumptionTime || consumptionTimeInput.value;
            const confirmation = document.createElement('div');
            const confirmationId = `ingredient-confirmation-${++ingredientDialogSequence}`;
            const confirmationTitleId = `${confirmationId}-title`;
            const confirmationReturnFocus = event.currentTarget;
            confirmation.className = 'portion-dialog ingredient-confirmation';
            confirmation.innerHTML = `
                <div class="portion-content ingredient-confirmation-content" role="dialog" aria-modal="true" aria-labelledby="${confirmationTitleId}">
                    <h3 id="${confirmationTitleId}">${this.t('confirm_ingredient_add')}</h3>
                    <div class="ingredient-confirmation-summary">
                        <strong>${escapeIngredientHtml(name)}</strong>
                        <span>${this.t(`meal_${mealType}`)} · ${consumptionTime} · ${fmt(portionGrams)} g</span>
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
            const closeConfirmation = (restoreFocus = true) => {
                confirmation.remove();
                if (restoreFocus) restoreIngredientFocus(confirmationReturnFocus);
            };
            this.dismissOverlayOnClickOutside(confirmation, closeConfirmation);
            const confirmationCancel = confirmation.querySelector('.ingredient-confirm-cancel');
            confirmationCancel.addEventListener('click', closeConfirmation);
            confirmation.querySelector('.ingredient-confirm-add').addEventListener('click', async () => {
                const confirmationButtons = confirmation.querySelectorAll('button');
                confirmationButtons.forEach(item => { item.disabled = true; });
                if (options.onAdd) {
                    options.onAdd({ food, name, portionGrams, nutrition });
                    closeConfirmation(false);
                    closeDetail();
                    return;
                }
                try {
                    const today = this.getLocalDateValue();
                    const entry = await API.createEntry({ entryDate: today, mealType, consumptionTime: this.toApiConsumptionTime(consumptionTime) });
                    await API.addEntryItem(entry.id, { foodItemId: food.id, portionGrams });
                    this.saveRecentFoods([{ id: food.id, name, calories: nutrition.energyKcal, portion: portionGrams }]);
                    closeConfirmation(false);
                    closeDetail();
                    this.showToast(this.t('ingredient_consumption_added'));
                } catch (e) {
                    confirmationButtons.forEach(item => { item.disabled = false; });
                    this.showToast(this.t('add_failed'), 'error');
                }
            });
            confirmationCancel.focus();
        });
        amountInput.focus();
    },

    async showIngredientEditor(food, lang, options = {}) {
        const isCreate = !food;
        food ??= {};
        const returnFocus = options.returnFocus ?? getIngredientFocusTarget();
        const dialogId = `ingredient-editor-${++ingredientDialogSequence}`;
        const ids = {
            title: `${dialogId}-title`,
            nameFi: `${dialogId}-name-fi`,
            nameEn: `${dialogId}-name-en`,
            category: `${dialogId}-category`,
            defaultWeight: `${dialogId}-default-weight`,
            unitWeight: `${dialogId}-unit-weight`,
            energyKcal: `${dialogId}-energy-kcal`,
            energyKj: `${dialogId}-energy-kj`,
            protein: `${dialogId}-protein`,
            fat: `${dialogId}-fat`,
            saturatedFat: `${dialogId}-saturated-fat`,
            carbohydrate: `${dialogId}-carbohydrate`,
            sugar: `${dialogId}-sugar`,
            fiber: `${dialogId}-fiber`,
            salt: `${dialogId}-salt`
        };
        const overlay = document.createElement('div');
        overlay.className = 'portion-dialog';
        overlay.innerHTML = `
            <div class="portion-content ingredient-editor" role="dialog" aria-modal="true" aria-labelledby="${ids.title}">
                <h3 class="ingredient-editor-title" id="${ids.title}">${this.t(isCreate ? 'add_ingredient_title' : 'edit_ingredient_title')}</h3>
                <form class="ingredient-edit-form">
                    <div class="barcode-name-grid">
                        <div class="nutrition-input"><label for="${ids.nameFi}">${this.t('ingredient_name_fi')}</label><input id="${ids.nameFi}" name="nameFi" /></div>
                        <div class="nutrition-input"><label for="${ids.nameEn}">${this.t('ingredient_name_en')}</label><input id="${ids.nameEn}" name="nameEn" /></div>
                    </div>
                    <div class="nutrition-input ingredient-category-editor">
                        <label for="${ids.category}">${this.t('ingredient_category')}</label>
                        <select id="${ids.category}" name="category">
                            <option value="">${this.t('all_categories')}</option>
                        </select>
                    </div>
                    <div class="ingredient-weight-settings">
                        <h4>${this.t('ingredient_weights_title')}</h4>
                        <div class="ingredient-weight-grid">
                            <label for="${ids.defaultWeight}">${this.t('default_weight_grams')}</label>
                            <input id="${ids.defaultWeight}" type="number" inputmode="decimal" name="defaultPortionGrams" min="0.1" step="0.1" required />
                            <label for="${ids.unitWeight}">${this.t('unit_weight_grams')}</label>
                            <input id="${ids.unitWeight}" type="number" inputmode="decimal" name="unitWeightGrams" min="0.1" step="0.1" />
                        </div>
                    </div>
                    <h4>${this.t('per_100g')}</h4>
                    <div class="manual-nutrition-grid">
                        <div class="nutrition-input"><label for="${ids.energyKcal}">kcal</label><input id="${ids.energyKcal}" type="number" inputmode="decimal" name="energyKcal" min="0" step="0.01" /></div>
                        <div class="nutrition-input"><label for="${ids.energyKj}">kJ</label><input id="${ids.energyKj}" type="number" inputmode="decimal" name="energyKj" min="0" step="0.01" /></div>
                        <div class="nutrition-input"><label for="${ids.protein}">${this.t('protein_short')}</label><input id="${ids.protein}" type="number" inputmode="decimal" name="protein" min="0" step="0.01" /></div>
                        <div class="nutrition-input"><label for="${ids.fat}">${this.t('fat_short')}</label><input id="${ids.fat}" type="number" inputmode="decimal" name="fat" min="0" step="0.01" /></div>
                        <div class="nutrition-input"><label for="${ids.saturatedFat}">${this.t('saturated_fat')}</label><input id="${ids.saturatedFat}" type="number" inputmode="decimal" name="saturatedFat" min="0" step="0.01" /></div>
                        <div class="nutrition-input"><label for="${ids.carbohydrate}">${this.t('carbs_short')}</label><input id="${ids.carbohydrate}" type="number" inputmode="decimal" name="carbohydrate" min="0" step="0.01" /></div>
                        <div class="nutrition-input"><label for="${ids.sugar}">${this.t('sugar')}</label><input id="${ids.sugar}" type="number" inputmode="decimal" name="sugar" min="0" step="0.01" /></div>
                        <div class="nutrition-input"><label for="${ids.fiber}">${this.t('fiber_short')}</label><input id="${ids.fiber}" type="number" inputmode="decimal" name="fiber" min="0" step="0.01" /></div>
                        <div class="nutrition-input"><label for="${ids.salt}">${this.t('salt')}</label><input id="${ids.salt}" type="number" inputmode="decimal" name="salt" min="0" step="0.01" /></div>
                    </div>
                    <p class="ingredient-edit-status" role="status" aria-live="polite"></p>
                    <div class="portion-buttons">
                        <button type="button" class="btn btn-secondary ingredient-edit-cancel">${this.t('btn_cancel')}</button>
                        <button type="submit" class="btn btn-primary">${this.t('btn_save')}</button>
                    </div>
                </form>
            </div>`;
        document.body.appendChild(overlay);
        const closeEditor = (restoreFocus = true) => {
            overlay.remove();
            if (restoreFocus) restoreIngredientFocus(returnFocus);
        };
        this.dismissOverlayOnClickOutside(overlay, closeEditor);

        const form = overlay.querySelector('.ingredient-edit-form');
        const status = overlay.querySelector('.ingredient-edit-status');
        const values = {
            nameFi: food.nameFi,
            nameEn: food.nameEn,
            defaultPortionGrams: food.defaultPortionGrams || 100,
            unitWeightGrams: food.unitWeightGrams,
            energyKcal: food.energyKcal,
            energyKj: food.energyKj,
            protein: food.protein,
            fat: food.fat,
            saturatedFat: food.saturatedFat,
            carbohydrate: food.carbohydrate,
            sugar: food.sugar,
            fiber: food.fiber,
            salt: food.salt
        };
        Object.entries(values).forEach(([fieldName, value]) => {
            form.elements[fieldName].value = value ?? '';
        });
        form.elements.nameFi.focus();

        const closeAndReopen = () => {
            if (isCreate) {
                closeEditor();
            } else {
                closeEditor(false);
                this.showIngredientDetail(food, lang, { ...options, returnFocus });
            }
        };
        form.querySelector('.ingredient-edit-cancel').addEventListener('click', closeAndReopen);

        const categorySelect = form.elements.category;
        const loadCategories = async () => {
            try {
                let categories = _ingredientsCache.categories;
                if (!categories) {
                    categories = await API.getFoodCategories();
                    _ingredientsCache.categories = categories;
                }
                const currentCategory = food.category?.trim();
                if (currentCategory && !categories.includes(currentCategory)) categories = [...categories, currentCategory];
                categories.forEach(category => {
                    const option = document.createElement('option');
                    option.value = category;
                    option.textContent = category;
                    categorySelect.appendChild(option);
                });
                categorySelect.value = currentCategory || '';
            } catch {
                if (food.category) {
                    categorySelect.add(new Option(food.category, food.category));
                    categorySelect.value = food.category;
                }
            }
            this.enhanceSelectWithSearch(categorySelect);
        };
        loadCategories();

        form.addEventListener('submit', async event => {
            event.preventDefault();
            const nameFi = form.elements.nameFi.value.trim();
            const nameEn = form.elements.nameEn.value.trim();
            if (!nameFi && !nameEn) {
                status.textContent = this.t('ingredient_name_required');
                status.classList.add('error');
                return;
            }
            if (!form.reportValidity()) return;

            const numberValue = fieldName => {
                const value = Number(form.elements[fieldName].value);
                return Number.isFinite(value) && value >= 0 ? value : 0;
            };
            const optionalNumberValue = fieldName => form.elements[fieldName].value.trim()
                ? numberValue(fieldName)
                : null;
            const unitWeightText = form.elements.unitWeightGrams.value.trim();
            const updatedValues = {
                nameFi: nameFi || nameEn,
                nameEn: nameEn || nameFi,
                category: categorySelect.value || null,
                defaultPortionGrams: numberValue('defaultPortionGrams'),
                unitWeightGrams: unitWeightText ? numberValue('unitWeightGrams') : null,
                energyKcal: numberValue('energyKcal'),
                energyKj: numberValue('energyKj'),
                protein: numberValue('protein'),
                fat: numberValue('fat'),
                saturatedFat: optionalNumberValue('saturatedFat'),
                carbohydrate: numberValue('carbohydrate'),
                sugar: optionalNumberValue('sugar'),
                fiber: optionalNumberValue('fiber'),
                salt: optionalNumberValue('salt')
            };

            const saveButton = form.querySelector('button[type="submit"]');
            saveButton.disabled = true;
            status.textContent = '';
            status.classList.remove('error');
            try {
                const updatedFood = isCreate
                    ? await API.createFood(updatedValues)
                    : await API.updateFood(food.id, updatedValues);
                Object.assign(food, updatedFood);
                updateIngredientReferences(food, lang);
                _ingredientsCache.clear();
                document.getElementById('ingredients-list')?.refreshIngredients?.();
                this.showToast(this.t('ingredient_saved'));
                closeEditor(false);
                this.showIngredientDetail(food, lang, { ...options, returnFocus });
            } catch {
                status.textContent = this.t('toast_save_failed');
                status.classList.add('error');
                saveButton.disabled = false;
            }
        });
    }
});
