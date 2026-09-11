// Log Meal view
Object.assign(App.prototype, {
    async setupLogMeal() {
        this.mealItems = [];
        const searchInput = document.getElementById('food-search-input');
        const searchResults = document.getElementById('search-results');
        const categorySelect = document.getElementById('meal-ingredient-category');
        const drinkSearchInput = document.getElementById('meal-drink-search');
        const drinkResults = document.getElementById('meal-drink-results');
        const mealDateInput = document.getElementById('meal-entry-date');
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
                    <details class="today-meal-group" data-meal-type="${mealType}">
                        <summary><span class="today-meal-group-header">
                            <span class="today-meal-group-title">${this.t(`meal_${mealType}`)}</span>
                            <span class="today-meal-group-total">${this.formatCalories(calories)}</span>
                        </span></summary>
                        <div class="today-meal-group-content">${displayUnits.length ? displayUnits.map(unit => {
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
                        }).join('') : `<div class="today-meal-empty">${this.t('no_meal_items')}</div>`}</div>
                    </details>`;
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
            try {
                renderTodayMeals(await API.getEntries(mealDateInput?.value || this.getLocalDateValue()));
            } catch (error) {
                console.error('Meals load failed:', error);
            }
        };

        if (!searchInput) {
            document.getElementById('btn-add-meal-from-today')?.addEventListener('click', () => this.navigate('add-meal'));
            await loadTodayMeals();
            return;
        }

        const updateMealItemsHeading = () => {
            const heading = document.getElementById('meal-items-title');
            if (heading) heading.textContent = `${this.t('meal_items_title')} · ${this.t(`meal_${this.currentMealType}`)}`;
        };

        const renderSearchResults = (results, container = searchResults) => {
            const sortedResults = this.sortFavoritesFirst(results);
            let previousFavorite;
            container.innerHTML = sortedResults.map(f => {
                const primaryName = this.getLocalizedName(f);
                const secondaryName = this.getSecondaryName(f);
                const isFavorite = this.isFavorite(f.id);
                const sectionTitle = container === searchResults && isFavorite !== previousFavorite
                    && (isFavorite || previousFavorite === true)
                    ? `<h3 class="ingredients-section-title">${this.t(isFavorite ? 'favorites_title' : 'other_products')}</h3>`
                    : '';
                previousFavorite = isFavorite;
                return `
                    ${sectionTitle}
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

            container.querySelectorAll('.search-result').forEach(el => {
                const food = sortedResults.find(item => item.id === el.dataset.id);
                const showIngredient = async () => {
                    if (!food) return;
                    try {
                        this.showMealIngredientDialog(await API.getFood(food.id));
                    } catch {
                        this.showMealIngredientDialog(food);
                    }
                };
                el.addEventListener('click', showIngredient);
                el.setAttribute('role', 'button');
                el.tabIndex = 0;
                el.addEventListener('keydown', event => {
                    if (event.target !== el) return;
                    if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        showIngredient();
                    }
                });
            });
            container.querySelectorAll('.search-favorite').forEach(button => {
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
                    renderSearchResults(results, container);
                });
                button.addEventListener('keydown', event => event.stopPropagation());
            });
        };

        let builtInDrinks;
        const renderDrinks = () => {
            if (!builtInDrinks || !drinkResults) return;
            const locale = window.i18n?.lang || 'en';
            const query = drinkSearchInput?.value.trim().toLocaleLowerCase(locale) || '';
            const matches = query
                ? builtInDrinks.filter(drink => [drink.nameFi, drink.nameEn]
                    .some(name => String(name || '').toLocaleLowerCase(locale).includes(query)))
                : builtInDrinks;
            if (matches.length) renderSearchResults(matches, drinkResults);
            else drinkResults.innerHTML = `<p class="meal-source-empty">${this.t('no_drink_matches')}</p>`;
        };
        const loadDrinks = async () => {
            if (builtInDrinks || !drinkResults) return;
            drinkResults.innerHTML = `<p class="meal-source-empty">${this.t('loading')}</p>`;
            try {
                builtInDrinks = await Promise.all(this.getBuiltInDrinkFineliIds().map(id => this.getBuiltInDrink(id)));
                renderDrinks();
            } catch (error) {
                console.error('Drink load failed:', error);
                drinkResults.innerHTML = `<p class="meal-source-empty">${this.t('error_loading')}</p>`;
            }
        };
        drinkSearchInput?.addEventListener('input', renderDrinks);

        const sourceTabs = document.querySelectorAll('.meal-source-tab');
        const selectSourceTab = selectedTab => {
            sourceTabs.forEach(tab => {
                const selected = tab === selectedTab;
                tab.classList.toggle('active', selected);
                tab.setAttribute('aria-selected', String(selected));
                tab.tabIndex = selected ? 0 : -1;
                document.getElementById(`meal-panel-${tab.dataset.panel}`).hidden = !selected;
            });
            if (selectedTab.dataset.panel === 'lookup') searchInput.focus();
            if (selectedTab.dataset.panel === 'drinks') {
                drinkSearchInput?.focus();
                loadDrinks();
            }
        };
        sourceTabs.forEach(tab => {
            tab.addEventListener('click', () => selectSourceTab(tab));
            tab.addEventListener('keydown', event => {
                if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
                event.preventDefault();
                const tabs = Array.from(sourceTabs);
                const direction = event.key === 'ArrowRight' ? 1 : -1;
                const nextTab = tabs[(tabs.indexOf(tab) + direction + tabs.length) % tabs.length];
                nextTab.focus();
                selectSourceTab(nextTab);
            });
        });

        const requestedMealDraft = this.pendingMealDraft;
        this.pendingMealDraft = null;
        this.currentMealType = requestedMealDraft?.mealType || this.getEstimatedMealType();
        const consumptionTimeInput = document.getElementById('meal-consumption-time');
        const requestedMealDate = this.pendingMealDate;
        this.pendingMealDate = null;
        mealDateInput.value = requestedMealDraft?.entryDate || requestedMealDate || this.getLocalDateValue();
        mealDateInput.addEventListener('change', loadTodayMeals);
        if (consumptionTimeInput) consumptionTimeInput.value = requestedMealDraft?.consumptionTime || this.getCurrentTimeValue();
        const mealTypeButtons = document.querySelectorAll('.meal-composer-details .meal-type-selector .meal-type');
        mealTypeButtons.forEach(btn => {
            const selected = btn.dataset.meal === this.currentMealType;
            btn.classList.toggle('active', selected);
            btn.setAttribute('aria-checked', String(selected));
            btn.addEventListener('click', () => {
                mealTypeButtons.forEach(b => {
                    b.classList.remove('active');
                    b.setAttribute('aria-checked', 'false');
                });
                btn.classList.add('active');
                btn.setAttribute('aria-checked', 'true');
                this.currentMealType = btn.dataset.meal;
                updateMealItemsHeading();
            });
        });

        try {
            const categories = await API.getFoodCategories();
            categories.forEach(category => {
                const option = document.createElement('option');
                option.value = category;
                option.textContent = category;
                categorySelect.appendChild(option);
            });
        } catch (e) { /* category filtering remains optional when categories cannot be loaded */ }

        this.enhanceSelectWithSearch(categorySelect);

        const refreshSearchResults = async () => {
            const query = searchInput.value.trim();
            const category = categorySelect?.value || '';
            const requestId = ++searchRequestId;

            try {
                const [results, favorites] = await Promise.all([query.length >= 2
                    ? this.searchFoods(query)
                    : category ? API.browseFoods(category, window.i18n?.lang || 'en', 100, 0) : [],
                    this.loadFavoriteFoods()]);
                if (requestId !== searchRequestId) return;
                const normalizedQuery = query.toLowerCase();
                const matchingFavorites = favorites.filter(food => (!category || food.category === category)
                    && (query.length < 2 || [food.nameFi, food.nameEn]
                        .some(name => (name || '').toLowerCase().includes(normalizedQuery))));
                const favoriteIds = new Set(matchingFavorites.map(food => food.id));
                renderSearchResults([...matchingFavorites, ...results.filter(food => !favoriteIds.has(food.id)
                    && (!category || food.category === category))]);
            } catch (e) {
                console.error('Search failed:', e);
            }
        };

        let searchRequestId = 0;
        searchInput?.addEventListener('input', () => {
            searchRequestId++;
            clearTimeout(searchTimeout);
            searchTimeout = setTimeout(refreshSearchResults, 300);
        });
        categorySelect?.addEventListener('change', () => {
            clearTimeout(searchTimeout);
            refreshSearchResults();
        });

        document.getElementById('btn-cancel-add-meal')?.addEventListener('click', () => this.navigate('meals'));

        document.getElementById('btn-barcode-meal')?.addEventListener('click', () => {
            this.showBarcodeDialog(food => this.showMealIngredientDialog(food));
        });

        document.getElementById('btn-save-meal')?.addEventListener('click', async () => {
            if (this.mealItems.length === 0) return;
            try {
                await API.createMeal({
                    entryDate: mealDateInput.value,
                    mealType: this.currentMealType,
                    consumptionTime: this.toApiConsumptionTime(consumptionTimeInput?.value || this.getCurrentTimeValue()),
                    notes: null,
                    items: this.mealItems.map(item => ({
                        foodItemId: item.id || undefined,
                        portionGrams: item.portion,
                        customCalories: item.customCalories ?? undefined,
                        notes: item.id ? null : item.name
                    }))
                });
                this.saveRecentFoods(this.mealItems);
                this.mealItems = [];
                this.updateMealItemsList();
                this.showToast(this.t('meal_saved'));
                this.pendingMealDate = mealDateInput.value;
                this.navigate('meals');
            } catch (e) {
                alert(`${this.t('toast_save_failed')}: ${e.message}`);
            }
        });

        updateMealItemsHeading();
        this.renderRecentFoods();
        this.renderRecipeQuickAdd();
        refreshSearchResults();
    },

    async setupAddMeal() {
        await this.setupLogMeal();
    },

    showMealIngredientDialog(food) {
        this.showIngredientDetail(food, window.i18n?.lang || 'en', {
            getMealContext: () => ({
                entryDate: document.getElementById('meal-entry-date')?.value,
                mealType: this.currentMealType,
                consumptionTime: document.getElementById('meal-consumption-time')?.value
            }),
            onAdd: ({ name, portionGrams, nutrition }) => {
                this.mealItems.push({
                    id: food.id,
                    name,
                    portion: portionGrams,
                    calories: nutrition.energyKcal || 0,
                    customCalories: null,
                    kcalPer100: Number(food.energyKcal) || 0,
                    protein: Number(food.protein) || 0,
                    fat: Number(food.fat) || 0,
                    carbs: Number(food.carbohydrate) || 0
                });
                this.updateMealItemsList();
            }
        });
    },

    saveRecentFoods(items) {
        try {
            let recent = JSON.parse(localStorage.getItem('recentFoods') || '[]');
            for (const item of items) {
                if (!item.id) continue;
                recent = recent.filter(r => r.id !== item.id);
                recent.unshift({
                    id: item.id,
                    name: item.name,
                    kcal: item.calories,
                    portion: item.portion,
                    kcalPer100: item.kcalPer100,
                    protein: item.protein,
                    fat: item.fat,
                    carbohydrate: item.carbs
                });
            }
            localStorage.setItem('recentFoods', JSON.stringify(recent.slice(0, 250)));
        } catch (e) { /* localStorage unavailable */ }
    },

    renderRecentFoods() {
        try {
            const recent = JSON.parse(localStorage.getItem('recentFoods') || '[]');
            const container = document.getElementById('meal-recent-items');
            if (!container) return;
            container.className = 'recent-foods';
            let visibleCount = 25;
            let query = '';
            const renderPage = () => {
                const locale = window.i18n?.lang || 'en';
                const normalizedQuery = query.toLocaleLowerCase(locale);
                const filteredRecent = normalizedQuery
                    ? recent.filter(food => String(food.name || '').toLocaleLowerCase(locale).includes(normalizedQuery))
                    : recent;
                const visible = filteredRecent.slice(0, visibleCount);
                container.innerHTML = `<h3>${this.t('recent_foods')}</h3>
                    <input type="search" class="recent-food-search" value="${escapeIngredientHtml(query)}"
                           placeholder="${this.t('recent_foods_search_placeholder')}"
                           aria-label="${this.t('recent_foods_search_placeholder')}">`
                    + (visible.length ? visible.map((f, index) => `
                    <div class="search-result" data-recent-index="${index}">
                        <div class="food-name">${escapeIngredientHtml(f.name)}</div>
                        <div class="food-cal">${this.formatCalories(f.kcal)} (${f.portion} g)</div>
                    </div>
                `).join('') : `<p class="meal-source-empty">${this.t(recent.length ? 'no_recent_food_matches' : 'no_recent_items')}</p>`)
                    + (visibleCount < filteredRecent.length
                        ? `<button type="button" class="btn btn-secondary recent-load-more">${this.t('btn_load_more')}</button>`
                        : '');
                const filterInput = container.querySelector('.recent-food-search');
                filterInput?.addEventListener('input', event => {
                    query = event.target.value.trim();
                    visibleCount = 25;
                    renderPage();
                    container.querySelector('.recent-food-search')?.focus();
                });
                container.querySelectorAll('.search-result').forEach(el => {
                    const recentFood = visible[Number(el.dataset.recentIndex)];
                    const showIngredient = async () => {
                        try {
                            this.showMealIngredientDialog(await API.getFood(recentFood.id));
                        } catch {
                            const kcalPer100 = Number(recentFood.kcalPer100)
                                || (Number(recentFood.portion) > 0 ? Number(recentFood.kcal) / Number(recentFood.portion) * 100 : 0);
                            this.showMealIngredientDialog({
                                id: recentFood.id,
                                nameEn: recentFood.name,
                                nameFi: recentFood.name,
                                defaultPortionGrams: Number(recentFood.portion) || 100,
                                energyKcal: kcalPer100,
                                protein: Number(recentFood.protein) || 0,
                                fat: Number(recentFood.fat) || 0,
                                carbohydrate: Number(recentFood.carbohydrate) || 0
                            });
                        }
                    };
                    el.addEventListener('click', showIngredient);
                    el.setAttribute('role', 'button');
                    el.tabIndex = 0;
                    el.addEventListener('keydown', event => {
                        if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault();
                            showIngredient();
                        }
                    });
                });
                container.querySelector('.recent-load-more')?.addEventListener('click', () => {
                    visibleCount += 25;
                    renderPage();
                });
            };
            renderPage();
        } catch (e) { /* localStorage unavailable */ }
    },

    async renderRecipeQuickAdd() {
        const container = document.getElementById('meal-recipe-items');
        if (!container) return;
        container.className = 'recipe-quick-add';
        container.innerHTML = `<p class="meal-source-empty" role="status">${this.t('loading')}</p>`;
        try {
            const recipes = await API.getRecipes();
            if (!container.isConnected) return;
            if (!recipes || recipes.length === 0) {
                container.innerHTML = `<p class="meal-source-empty">${this.t('no_recipes')}</p>`;
                return;
            }
            container.innerHTML = `<h3>${this.t('my_recipes')}</h3>` + recipes.map(r => {
                const totalKcal = r.ingredients?.length ? r.ingredients.reduce((sum, ing) => {
                    const food = ing.foodItem;
                    return sum + (food ? food.energyKcal * ing.portionGrams / 100 : 0);
                }, 0) : Number(r.customCalories || 0) * (r.nutritionMode === 'per100g' ? (Number(r.productWeightG) || 100) / 100 : 1);
                return `
                    <div class="search-result recipe-quick-item" data-recipe-id="${r.id}">
                        <div>
                            <div class="food-name">${escapeIngredientHtml(r.name)}</div>
                            <div class="food-cal">${(r.ingredients || []).length} ${this.t('ingredients_count')}</div>
                        </div>
                        <div class="food-cal">${this.formatCalories(totalKcal)}</div>
                    </div>`;
            }).join('');
            container.querySelectorAll('.recipe-quick-item').forEach(el => {
                const selectRecipe = () => {
                    const recipe = recipes.find(item => item.id === el.dataset.recipeId);
                    if (recipe) this.showRecipePortionSelector(recipe, this.currentMealType,
                        document.getElementById('meal-consumption-time')?.value,
                        document.getElementById('meal-entry-date')?.value);
                };
                el.addEventListener('click', selectRecipe);
                el.setAttribute('role', 'button');
                el.tabIndex = 0;
                el.addEventListener('keydown', event => {
                    if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        selectRecipe();
                    }
                });
            });
        } catch (e) {
            if (container.isConnected) container.innerHTML = `<p class="meal-source-empty" role="alert">${this.t('error_loading_recipes')}</p>`;
        }
    },

    showMealItemEditor(entry, item, onSaved) {
        const name = item.foodItem ? this.getLocalizedName(item.foodItem) : (item.notes || this.t('unknown'));
        const overlay = document.createElement('div');
        overlay.className = 'portion-dialog';
        overlay.innerHTML = `
            <div class="portion-content">
                <h3>${this.t('edit_meal_item')}</h3>
                <p>${name}</p>
                <label for="edit-meal-item-grams">${this.t('amount_grams')}</label>
                <input type="number" id="edit-meal-item-grams" value="${item.portionGrams}" min="0.01" step="any" />
                <div class="portion-buttons">
                    <button type="button" class="btn btn-secondary" id="btn-edit-meal-cancel">${this.t('btn_cancel')}</button>
                    <button type="button" class="btn btn-primary" id="btn-edit-meal-save">${this.t('btn_save')}</button>
                </div>
            </div>`;
        document.body.appendChild(overlay);

        overlay.querySelector('#btn-edit-meal-cancel').addEventListener('click', () => overlay.remove());
        overlay.querySelector('#btn-edit-meal-save').addEventListener('click', async () => {
            const portionGrams = parseFloat(overlay.querySelector('#edit-meal-item-grams').value);
            if (!Number.isFinite(portionGrams) || portionGrams <= 0) return;
            overlay.querySelectorAll('button').forEach(button => { button.disabled = true; });
            try {
                await API.updateEntryItem(entry.id, item.id, { portionGrams });
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
