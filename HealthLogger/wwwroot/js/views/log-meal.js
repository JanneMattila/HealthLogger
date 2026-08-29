// Log Meal view
Object.assign(App.prototype, {
    async setupLogMeal() {
        this.mealItems = [];
        const searchInput = document.getElementById('food-search-input');
        const searchResults = document.getElementById('search-results');
        let searchTimeout;
        const mealTypes = this.getMealTypes();

        const itemCalories = item => item.customCalories ??
            ((item.foodItem?.energyKcal || 0) * item.portionGrams / 100);
        const itemNutrient = (item, nutrient) =>
            (item.foodItem?.[nutrient] || 0) * item.portionGrams / 100;
        const formatGrams = value => `${parseFloat(Number(value).toFixed(1))} g`;

        const renderNutrientDrilldowns = allItems => {
            const container = document.getElementById('nutrient-drilldowns');
            if (!container) return;

            const nutrients = [
                { key: 'calories', label: this.t('chart_calories'), value: itemCalories, format: value => `${Math.round(value)} ${this.t('kcal')}` },
                { key: 'protein', label: this.t('protein_short'), value: item => itemNutrient(item, 'protein'), format: formatGrams },
                { key: 'fat', label: this.t('fat_short'), value: item => itemNutrient(item, 'fat'), format: formatGrams },
                { key: 'carbs', label: this.t('carbs_short'), value: item => itemNutrient(item, 'carbohydrate'), format: formatGrams }
            ];

            container.replaceChildren(...nutrients.map(nutrient => {
                const contributions = new Map();
                allItems.forEach(item => {
                    const value = nutrient.value(item);
                    if (value <= 0) return;
                    const name = item.foodItem
                        ? this.getLocalizedName(item.foodItem)
                        : (item.sourceRecipeName || item.notes || this.t('unknown'));
                    const key = item.foodItem?.id || name.toLocaleLowerCase();
                    const existing = contributions.get(key);
                    if (existing) existing.value += value;
                    else contributions.set(key, { name, value });
                });

                const sorted = Array.from(contributions.values()).sort((left, right) => right.value - left.value);
                const total = sorted.reduce((sum, contribution) => sum + contribution.value, 0);
                const section = document.createElement('section');
                section.className = 'nutrient-drilldown';
                section.id = `nutrient-drilldown-${nutrient.key}`;

                const header = document.createElement('div');
                header.className = 'nutrient-drilldown-header';
                const heading = document.createElement('h3');
                heading.textContent = this.t('nutrient_contributors', { nutrient: nutrient.label });
                const totalValue = document.createElement('strong');
                totalValue.className = 'nutrient-drilldown-total';
                totalValue.textContent = nutrient.format(total);
                header.append(heading, totalValue);
                section.appendChild(header);

                if (sorted.length === 0) {
                    const empty = document.createElement('div');
                    empty.className = 'nutrient-contribution-empty';
                    empty.textContent = this.t('no_meal_items');
                    section.appendChild(empty);
                } else {
                    sorted.forEach(contribution => {
                        const row = document.createElement('div');
                        row.className = 'nutrient-contribution-row';
                        const name = document.createElement('span');
                        name.className = 'nutrient-contribution-name';
                        name.textContent = contribution.name;
                        const amount = document.createElement('span');
                        amount.className = 'nutrient-contribution-amount';
                        const value = document.createElement('strong');
                        value.textContent = nutrient.format(contribution.value);
                        const share = document.createElement('small');
                        share.textContent = `${Math.round(contribution.value / total * 100)}%`;
                        amount.append(value, share);
                        row.append(name, amount);
                        section.appendChild(row);
                    });
                }
                return section;
            }));

            const target = this.todayNutrientTarget;
            if (target) {
                const selected = document.getElementById(`nutrient-drilldown-${target}`);
                selected?.classList.add('selected');
                requestAnimationFrame(() => selected?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
                this.todayNutrientTarget = null;
            }
        };

        const renderTodayMeals = entries => {
            const stats = document.getElementById('meal-today-stats');
            const meals = document.getElementById('today-meals');
            if (!stats || !meals) return;

            const allItems = entries.flatMap(entry => entry.items || []);
            const totals = {
                calories: allItems.reduce((sum, item) => sum + itemCalories(item), 0),
                protein: allItems.reduce((sum, item) => sum + itemNutrient(item, 'protein'), 0),
                fat: allItems.reduce((sum, item) => sum + itemNutrient(item, 'fat'), 0),
                carbs: allItems.reduce((sum, item) => sum + itemNutrient(item, 'carbohydrate'), 0)
            };
            renderNutrientDrilldowns(allItems);
            stats.innerHTML = `
                <div class="meal-today-stat" data-nutrient="calories" role="button" tabindex="0"><strong>${Math.round(totals.calories)}</strong><span>${this.t('kcal')}</span></div>
                <div class="meal-today-stat" data-nutrient="protein" role="button" tabindex="0"><strong>${formatGrams(totals.protein)}</strong><span>${this.t('protein_short')}</span></div>
                <div class="meal-today-stat" data-nutrient="fat" role="button" tabindex="0"><strong>${formatGrams(totals.fat)}</strong><span>${this.t('fat_short')}</span></div>
                <div class="meal-today-stat" data-nutrient="carbs" role="button" tabindex="0"><strong>${formatGrams(totals.carbs)}</strong><span>${this.t('carbs_short')}</span></div>
            `;
            const scrollToNutrient = nutrient => {
                document.querySelectorAll('.nutrient-drilldown').forEach(section => section.classList.remove('selected'));
                const section = document.getElementById(`nutrient-drilldown-${nutrient}`);
                section?.classList.add('selected');
                section?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            };
            stats.querySelectorAll('.meal-today-stat').forEach(tile => {
                tile.addEventListener('click', () => scrollToNutrient(tile.dataset.nutrient));
                tile.addEventListener('keydown', event => {
                    if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        scrollToNutrient(tile.dataset.nutrient);
                    }
                });
            });

            const renderItem = ({ entry, item }) => {
                const name = item.foodItem
                    ? this.getLocalizedName(item.foodItem)
                    : (item.sourceRecipeName || item.notes || this.t('unknown'));
                return `
                    <div class="today-meal-item" data-entry-id="${entry.id}" data-item-id="${item.id}">
                        <div class="today-meal-item-name"><strong>${name}</strong><small>${formatGrams(item.portionGrams)}</small></div>
                        <span>${this.formatCalories(itemCalories(item))}</span>
                        <div class="today-meal-item-actions">
                            <button type="button" class="btn btn-icon today-meal-edit" title="${this.t('btn_edit')}" aria-label="${this.t('edit_meal_item')}">✎</button>
                            <button type="button" class="btn btn-icon today-meal-delete" title="${this.t('btn_delete')}" aria-label="${this.t('btn_delete')}">✕</button>
                        </div>
                    </div>`;
            };

            meals.innerHTML = mealTypes.map(mealType => {
                const mealEntries = entries.filter(entry => entry.mealType === mealType);
                const items = mealEntries.flatMap(entry => (entry.items || []).map(item => ({ entry, item })));
                const calories = items.reduce((sum, pair) => sum + itemCalories(pair.item), 0);
                const displayUnits = [];
                const recipeGroups = new Map();
                items.forEach(pair => {
                    const instanceId = pair.item.recipeInstanceId;
                    if (!instanceId) {
                        displayUnits.push({ type: 'item', pair });
                        return;
                    }
                    if (!recipeGroups.has(instanceId)) {
                        const group = { type: 'recipe', instanceId, items: [] };
                        recipeGroups.set(instanceId, group);
                        displayUnits.push(group);
                    }
                    recipeGroups.get(instanceId).items.push(pair);
                });
                return `
                    <section class="today-meal-group" data-meal-type="${mealType}">
                        <div class="today-meal-group-header">
                            <h4>${this.t(`meal_${mealType}`)}</h4>
                            <span class="today-meal-group-total">${this.formatCalories(calories)}</span>
                        </div>
                        ${displayUnits.length ? displayUnits.map(unit => {
                            if (unit.type === 'item') return renderItem(unit.pair);
                            const recipeName = unit.items[0].item.sourceRecipeName || this.t('unknown');
                            const recipeCalories = unit.items.reduce((sum, pair) => sum + itemCalories(pair.item), 0);
                            return `
                                <details class="today-recipe-group" data-recipe-instance-id="${unit.instanceId}">
                                    <summary>
                                        <span><strong>${recipeName}</strong><small>${unit.items.length} ${this.t('ingredients_count')}</small></span>
                                        <span>${this.formatCalories(recipeCalories)}</span>
                                    </summary>
                                    <div class="today-recipe-items">${unit.items.map(renderItem).join('')}</div>
                                </details>`;
                        }).join('') : `<div class="today-meal-empty">${this.t('no_meal_items')}</div>`}
                    </section>`;
            }).join('');

            meals.querySelectorAll('.today-meal-edit').forEach(button => {
                button.addEventListener('click', () => {
                    const row = button.closest('.today-meal-item');
                    const entry = entries.find(candidate => candidate.id === row.dataset.entryId);
                    const item = entry?.items?.find(candidate => candidate.id === row.dataset.itemId);
                    if (entry && item) this.showMealItemEditor(entry, item, loadTodayMeals);
                });
            });
            meals.querySelectorAll('.today-meal-delete').forEach(button => {
                button.addEventListener('click', async () => {
                    if (!window.confirm(this.t('confirm_delete'))) return;
                    const row = button.closest('.today-meal-item');
                    button.disabled = true;
                    try {
                        await API.removeEntryItem(row.dataset.entryId, row.dataset.itemId);
                        await loadTodayMeals();
                    } catch {
                        button.disabled = false;
                        this.showToast(this.t('toast_delete_failed'), 'error');
                    }
                });
            });
        };

        const loadTodayMeals = async () => {
            const today = new Date().toISOString().split('T')[0];
            try {
                renderTodayMeals(await API.getEntries(today));
            } catch (error) {
                console.error('Today meals load failed:', error);
            }
        };

        const updateMealItemsHeading = () => {
            const heading = document.getElementById('meal-items-title');
            if (heading) heading.textContent = `${this.t('meal_items_title')} · ${this.t(`meal_${this.currentMealType}`)}`;
        };

        const renderSearchResults = (results) => {
            const sortedResults = this.sortFavoritesFirst(results);
            searchResults.innerHTML = sortedResults.map(f => {
                const primaryName = this.getLocalizedName(f);
                const secondaryName = this.getSecondaryName(f);
                const isFavorite = this.isFavorite(f.id);
                return `
                    <div class="search-result" data-id="${f.id}" data-kcal="${f.energyKcal}"
                         data-protein="${f.protein}" data-fat="${f.fat}" data-carbs="${f.carbohydrate}"
                         data-default-portion="${f.defaultPortionGrams || 100}"
                         data-name="${primaryName}">
                        <div class="search-result-info">
                            <div class="food-name">${primaryName}</div>
                            <div class="food-cal">${secondaryName}</div>
                        </div>
                        <div class="search-result-meta">
                            <div class="food-cal">${Math.round(f.energyKcal)} ${this.t('kcal')}/100g</div>
                            <button class="btn-favorite search-favorite ${isFavorite ? 'active' : ''}"
                                    data-favorite-id="${f.id}" title="${this.t('toggle_favorite')}"
                                    aria-label="${this.t('toggle_favorite')}">${isFavorite ? '★' : '☆'}</button>
                        </div>
                    </div>
                `;
            }).join('');

            searchResults.querySelectorAll('.search-result').forEach(el => {
                el.addEventListener('click', () => this.showPortionDialog(el.dataset));
            });
            searchResults.querySelectorAll('.search-favorite').forEach(button => {
                button.addEventListener('click', (event) => {
                    event.stopPropagation();
                    const food = sortedResults.find(item => item.id === button.dataset.favoriteId);
                    if (!food) return;
                    this.toggleFavorite({
                        id: food.id,
                        name: this.getLocalizedName(food),
                        type: 'food',
                        kcalPer100: food.energyKcal,
                        protein: food.protein,
                        fat: food.fat,
                        carbs: food.carbohydrate
                    });
                    renderSearchResults(results);
                });
            });
        };

        this.currentMealType = this.getEstimatedMealType();
        const consumptionTimeInput = document.getElementById('meal-consumption-time');
        if (consumptionTimeInput) consumptionTimeInput.value = this.getCurrentTimeValue();
        const mealTypeButtons = document.querySelectorAll('.log-meal > .meal-type-selector .meal-type');
        mealTypeButtons.forEach(btn => {
            btn.classList.toggle('active', btn.dataset.meal === this.currentMealType);
            btn.addEventListener('click', () => {
                mealTypeButtons.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.currentMealType = btn.dataset.meal;
                updateMealItemsHeading();
            });
        });

        searchInput?.addEventListener('input', () => {
            clearTimeout(searchTimeout);
            searchTimeout = setTimeout(async () => {
                const query = searchInput.value.trim();
                if (query.length < 2) {
                    searchResults.innerHTML = '';
                    return;
                }

                try {
                    const results = await this.searchFoods(query);
                    renderSearchResults(results);
                } catch (e) {
                    console.error('Search failed:', e);
                }
            }, 300);
        });

        document.getElementById('btn-camera')?.addEventListener('click', () => {
            this.showPhotoSourceDialog();
        });

        document.getElementById('btn-barcode-meal')?.addEventListener('click', () => {
            this.showBarcodeDialog(food => this.showPortionDialog({
                id: food.id,
                name: this.getLocalizedName(food),
                kcal: food.energyKcal,
                protein: food.protein,
                fat: food.fat,
                carbs: food.carbohydrate,
                defaultPortion: food.defaultPortionGrams
            }));
        });

        document.getElementById('btn-save-meal')?.addEventListener('click', async () => {
            if (this.mealItems.length === 0) return;
            try {
                const today = new Date().toISOString().split('T')[0];
                const entry = await API.createEntry({
                    entryDate: today,
                    mealType: this.currentMealType,
                    consumptionTime: this.toApiConsumptionTime(consumptionTimeInput?.value || this.getCurrentTimeValue())
                });
                for (const item of this.mealItems) {
                    const entryItem = {
                        foodItemId: item.id || undefined,
                        portionGrams: item.portion,
                        customCalories: item.customCalories || undefined
                    };
                    if (!item.id || item.id === '') delete entryItem.foodItemId;
                    await API.addEntryItem(entry.id, entryItem);
                }
                this.saveRecentFoods(this.mealItems);
                this.mealItems = [];
                this.updateMealItemsList();
                await loadTodayMeals();
                this.showToast(this.t('meal_saved'));
            } catch (e) {
                alert(`${this.t('toast_save_failed')}: ${e.message}`);
            }
        });

        updateMealItemsHeading();
        await loadTodayMeals();
        this.renderRecentFoods(searchResults);
        this.renderRecipeQuickAdd(searchResults);
    },

    saveRecentFoods(items) {
        try {
            let recent = JSON.parse(localStorage.getItem('recentFoods') || '[]');
            for (const item of items) {
                if (!item.id) continue;
                recent = recent.filter(r => r.id !== item.id);
                recent.unshift({ id: item.id, name: item.name, kcal: item.calories, portion: item.portion });
            }
            localStorage.setItem('recentFoods', JSON.stringify(recent.slice(0, 5)));
        } catch (e) { /* localStorage unavailable */ }
    },

    renderRecentFoods(searchResults) {
        try {
            const recent = JSON.parse(localStorage.getItem('recentFoods') || '[]');
            if (recent.length === 0) return;

            const container = document.createElement('div');
            container.className = 'recent-foods';
            container.innerHTML = `<h3>${this.t('recent_foods')}</h3>` + recent.map(f => `
                <div class="search-result" data-id="${f.id}" data-kcal="${Math.round(f.kcal / f.portion * 100)}"
                     data-name="${f.name}" data-protein="0" data-fat="0" data-carbs="0">
                    <div class="food-name">${f.name}</div>
                    <div class="food-cal">${this.formatCalories(f.kcal)} (${f.portion} g)</div>
                </div>
            `).join('');
            searchResults.parentNode.insertBefore(container, searchResults.nextSibling);
            container.querySelectorAll('.search-result').forEach(el => {
                el.addEventListener('click', () => this.showPortionDialog(el.dataset));
            });
        } catch (e) { /* localStorage unavailable */ }
    },

    async renderRecipeQuickAdd(searchResults) {
        try {
            const recipes = await API.getRecipes();
            if (!recipes || recipes.length === 0) return;

            const container = document.createElement('div');
            container.className = 'recipe-quick-add';
            container.innerHTML = `<h3>${this.t('my_recipes')}</h3>` + recipes.map(r => {
                const totalKcal = (r.ingredients || []).reduce((sum, ing) => {
                    const food = ing.foodItem;
                    return sum + (food ? food.energyKcal * ing.portionGrams / 100 : 0);
                }, 0);
                return `
                    <div class="search-result recipe-quick-item" data-recipe-id="${r.id}">
                        <div>
                            <div class="food-name">${r.name}</div>
                            <div class="food-cal">${(r.ingredients || []).length} ${this.t('ingredients_count')}</div>
                        </div>
                        <div class="food-cal">${this.formatCalories(totalKcal)}</div>
                    </div>`;
            }).join('');
            const recentSection = searchResults.parentNode.querySelector('.recent-foods');
            const insertBefore = recentSection ? recentSection.nextSibling : searchResults.nextSibling;
            searchResults.parentNode.insertBefore(container, insertBefore);

            container.querySelectorAll('.recipe-quick-item').forEach(el => {
                el.addEventListener('click', () => {
                    const recipe = recipes.find(item => item.id === el.dataset.recipeId);
                    if (recipe) this.showRecipePortionSelector(recipe, this.currentMealType);
                });
            });
        } catch (e) { /* no recipes */ }
    },

    showPortionDialog(dataset) {
        const isFav = dataset.id ? this.isFavorite(dataset.id) : false;
        const overlay = document.createElement('div');
        overlay.className = 'portion-dialog';
        overlay.innerHTML = `
            <div class="portion-content">
                <div class="portion-header">
                    <h3>${dataset.name}</h3>
                    ${dataset.id ? `<button class="btn-favorite ${isFav ? 'active' : ''}" id="btn-fav-toggle" title="${this.t('toggle_favorite')}">${isFav ? '★' : '☆'}</button>` : ''}
                </div>
                <label>${this.t('portion_label')}</label>
                <input type="number" id="portion-grams" value="${dataset.portion || dataset.defaultPortion || 100}" min="0.1" step="0.1" />
                <div class="portion-buttons">
                    <button class="btn btn-secondary" id="btn-portion-cancel">${this.t('btn_cancel')}</button>
                    <button class="btn btn-primary" id="btn-portion-add">${this.t('btn_add')}</button>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);
        this.dismissOverlayOnClickOutside(overlay);

        const favBtn = overlay.querySelector('#btn-fav-toggle');
        if (favBtn) {
            favBtn.onclick = () => {
                this.toggleFavorite({
                    id: dataset.id,
                    name: dataset.name,
                    type: 'food',
                    kcalPer100: parseFloat(dataset.kcal) || 0,
                    protein: parseFloat(dataset.protein) || 0,
                    fat: parseFloat(dataset.fat) || 0,
                    carbs: parseFloat(dataset.carbs) || 0
                });
                const nowFav = this.isFavorite(dataset.id);
                favBtn.textContent = nowFav ? '★' : '☆';
                favBtn.classList.toggle('active', nowFav);
            };
        }

        overlay.querySelector('#btn-portion-cancel').onclick = () => overlay.remove();
        overlay.querySelector('#btn-portion-add').onclick = () => {
            const grams = parseFloat(document.getElementById('portion-grams').value) || 100;
            const kcalPer100 = parseFloat(dataset.kcal) || 0;
            const isPhotoResult = dataset.source === 'photo';
            const calories = isPhotoResult ? kcalPer100 : (kcalPer100 * grams / 100);
            this.mealItems.push({
                id: dataset.id,
                name: dataset.name,
                portion: grams,
                calories,
                customCalories: isPhotoResult ? kcalPer100 : null,
                kcalPer100,
                protein: parseFloat(dataset.protein) || 0,
                fat: parseFloat(dataset.fat) || 0,
                carbs: parseFloat(dataset.carbs) || 0
            });
            this.updateMealItemsList();
            overlay.remove();
        };
    },

    showMealItemEditor(entry, item, onSaved) {
        const name = item.foodItem ? this.getLocalizedName(item.foodItem) : (item.notes || this.t('unknown'));
        const mealTypes = this.getMealTypes();
        let selectedMealType = entry.mealType;
        const overlay = document.createElement('div');
        overlay.className = 'portion-dialog';
        overlay.innerHTML = `
            <div class="portion-content">
                <h3>${this.t('edit_meal_item')}</h3>
                <p>${name}</p>
                <label for="edit-meal-item-grams">${this.t('amount_grams')}</label>
                <input type="number" id="edit-meal-item-grams" value="${item.portionGrams}" min="0.01" step="any" />
                <label>${this.t('meal_type_label')}</label>
                <div class="meal-type-selector edit-meal-type-selector" role="radiogroup" aria-label="${this.t('meal_type_label')}">
                    ${mealTypes.map(mealType => `
                        <button type="button" class="meal-type ${mealType === selectedMealType ? 'active' : ''}"
                                data-meal-type="${mealType}" role="radio" aria-checked="${mealType === selectedMealType}">${this.t(`meal_${mealType}`)}</button>
                    `).join('')}
                </div>
                <div class="portion-buttons">
                    <button type="button" class="btn btn-secondary" id="btn-edit-meal-cancel">${this.t('btn_cancel')}</button>
                    <button type="button" class="btn btn-primary" id="btn-edit-meal-save">${this.t('btn_save')}</button>
                </div>
            </div>`;
        document.body.appendChild(overlay);

        overlay.querySelectorAll('.edit-meal-type-selector button').forEach(button => {
            button.addEventListener('click', () => {
                selectedMealType = button.dataset.mealType;
                overlay.querySelectorAll('.edit-meal-type-selector button').forEach(candidate => {
                    const selected = candidate === button;
                    candidate.classList.toggle('active', selected);
                    candidate.setAttribute('aria-checked', String(selected));
                });
            });
        });
        overlay.querySelector('#btn-edit-meal-cancel').addEventListener('click', () => overlay.remove());
        overlay.querySelector('#btn-edit-meal-save').addEventListener('click', async () => {
            const portionGrams = parseFloat(overlay.querySelector('#edit-meal-item-grams').value);
            if (!Number.isFinite(portionGrams) || portionGrams <= 0) return;
            overlay.querySelectorAll('button').forEach(button => { button.disabled = true; });
            try {
                await API.updateEntryItem(entry.id, item.id, { portionGrams, mealType: selectedMealType });
                overlay.remove();
                await onSaved();
                this.showToast(this.t('toast_saved'));
            } catch {
                overlay.querySelectorAll('button').forEach(button => { button.disabled = false; });
                this.showToast(this.t('toast_save_failed'), 'error');
            }
        });
    },

    updateMealItemsList() {
        const list = document.getElementById('meal-items-list');
        const total = document.getElementById('meal-total');
        const saveBtn = document.getElementById('btn-save-meal');

        if (!list) return;

        list.innerHTML = this.mealItems.map((item, i) => `
            <div class="meal-item">
                <span>${item.name}</span>
                <input type="number" class="meal-item-portion" data-index="${i}" value="${item.portion}" min="0.01" step="any" aria-label="${this.t('amount_grams')}" />
                <span>${this.formatCalories(item.calories)}</span>
                <button class="remove-btn" data-index="${i}" title="${this.t('btn_delete')}" aria-label="${this.t('btn_delete')}">✕</button>
            </div>
        `).join('');

        list.querySelectorAll('.meal-item-portion').forEach(input => {
            input.addEventListener('change', () => {
                const item = this.mealItems[parseInt(input.dataset.index)];
                const grams = parseFloat(input.value);
                if (!item || !Number.isFinite(grams) || grams <= 0) {
                    input.value = item?.portion || 100;
                    return;
                }
                item.portion = grams;
                item.calories = item.customCalories ?? ((item.kcalPer100 || 0) * grams / 100);
                this.updateMealItemsList();
            });
        });

        list.querySelectorAll('.remove-btn').forEach(btn => {
            btn.onclick = () => {
                if (!window.confirm(this.t('confirm_delete'))) return;
                this.mealItems.splice(parseInt(btn.dataset.index), 1);
                this.updateMealItemsList();
            };
        });

        const totalCal = this.mealItems.reduce((sum, item) => sum + item.calories, 0);
        if (total) total.textContent = this.formatTotalCalories(totalCal);
        if (saveBtn) saveBtn.style.display = this.mealItems.length > 0 ? 'block' : 'none';
    }
});
