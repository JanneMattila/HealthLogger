// Recipes view
Object.assign(App.prototype, {
    async setupRecipes() {
        const listView = document.getElementById('recipe-list-view');
        const createView = document.getElementById('recipe-create-view');
        const detailView = document.getElementById('recipe-detail-view');
        const recipeList = document.getElementById('recipe-list');
        const recipeForm = document.getElementById('recipe-form');
        let recipeIngredients = [];
        let editingRecipeId = null;
        let openRecipeEditor;

        const showView = (view) => {
            [listView, createView, detailView].forEach(v => { if (v) v.style.display = 'none'; });
            if (view) view.style.display = 'block';
        };

        const loadRecipes = async () => {
            try {
                const recipes = await API.getRecipes();
                if (!recipes || recipes.length === 0) {
                    recipeList.innerHTML = `<p class="empty">${this.t('no_recipes')}</p>`;
                    return;
                }

                const rows = recipes.map(r => {
                    const totalKcal = (r.ingredients || []).length > 0
                        ? (r.ingredients || []).reduce((sum, ing) => {
                            const food = ing.foodItem;
                            return sum + (food ? food.energyKcal * ing.portionGrams / 100 : 0);
                        }, 0)
                        : (r.customCalories || 0);
                    return `
                        <tr class="recipe-table-row" data-id="${r.id}" tabindex="0">
                            <td class="recipe-table-name">${r.name}</td>
                            <td class="recipe-table-number">${(r.ingredients || []).length}</td>
                            <td class="recipe-table-calories">${this.formatCalories(totalKcal)}</td>
                            <td>
                                <div class="recipe-table-actions">
                                <button class="btn btn-secondary btn-sm btn-use-recipe" data-id="${r.id}">${this.t('recipe_use')}</button>
                                <button class="btn btn-secondary btn-sm btn-edit-recipe" data-id="${r.id}">${this.t('btn_edit')}</button>
                                    <button class="btn btn-secondary btn-sm btn-view-recipe" data-id="${r.id}">${this.t('btn_view')}</button>
                                </div>
                            </td>
                        </tr>`;
                }).join('');
                recipeList.innerHTML = `
                    <div class="recipe-table-container">
                        <table class="recipe-table">
                            <thead>
                                <tr>
                                    <th>${this.t('label_name')}</th>
                                    <th>${this.t('ingredients')}</th>
                                    <th>${this.t('chart_calories')}</th>
                                    <th>${this.t('actions')}</th>
                                </tr>
                            </thead>
                            <tbody>${rows}</tbody>
                        </table>
                    </div>`;

                recipeList.querySelectorAll('.btn-view-recipe').forEach(btn => {
                    btn.addEventListener('click', () => showRecipeDetail(recipes.find(r => r.id === btn.dataset.id)));
                });
                recipeList.querySelectorAll('.btn-use-recipe').forEach(btn => {
                    btn.addEventListener('click', () => {
                        const recipe = recipes.find(r => r.id === btn.dataset.id);
                        if (recipe) this.showRecipePortionSelector(recipe);
                    });
                });
                recipeList.querySelectorAll('.btn-edit-recipe').forEach(btn => {
                    btn.addEventListener('click', () => {
                        const recipe = recipes.find(r => r.id === btn.dataset.id);
                        if (recipe) openRecipeEditor(recipe);
                    });
                });
                recipeList.querySelectorAll('.recipe-table-row').forEach(row => {
                    const showRowRecipe = () => showRecipeDetail(recipes.find(r => r.id === row.dataset.id));
                    row.addEventListener('click', (e) => {
                        if (e.target.closest('button')) return;
                        showRowRecipe();
                    });
                    row.addEventListener('keydown', (e) => {
                        if (e.target.closest('button') || !['Enter', ' '].includes(e.key)) return;
                        e.preventDefault();
                        showRowRecipe();
                    });
                });
            } catch (e) {
                recipeList.innerHTML = `<p class="empty">${this.t('error_loading_recipes')}</p>`;
            }
        };

        const showRecipeDetail = (recipe) => {
            if (!recipe) return;
            showView(detailView);
            const content = document.getElementById('recipe-detail-content');
            const hasIngredients = (recipe.ingredients || []).length > 0;
            const totalKcal = hasIngredients
                ? (recipe.ingredients || []).reduce((sum, ing) => {
                    const food = ing.foodItem;
                    return sum + (food ? food.energyKcal * ing.portionGrams / 100 : 0);
                }, 0)
                : (recipe.customCalories || 0);

            let nutritionHtml = '';
            if (hasIngredients) {
                nutritionHtml = `
                    <div class="recipe-detail-ingredients">
                        <h4>${this.t('ingredients')}</h4>
                        ${(recipe.ingredients || []).map(ing => {
                            const food = ing.foodItem;
                            const ingKcal = food ? food.energyKcal * ing.portionGrams / 100 : 0;
                            return `<div class="meal-item">
                                <span>${this.getLocalizedName(food)} — ${ing.portionGrams} g</span>
                                <span>${this.formatCalories(ingKcal)}</span>
                            </div>`;
                        }).join('')}
                    </div>`;
            } else if (recipe.customCalories) {
                nutritionHtml = `
                    <div class="recipe-detail-ingredients">
                        <h4>${this.t('nutrition')}</h4>
                        <div class="macro-bars">
                            ${recipe.customProtein ? `<div class="macro-bar"><div class="value">${parseFloat(recipe.customProtein.toFixed(2))} g</div><div class="label">${this.t('protein_short')}</div></div>` : ''}
                            ${recipe.customFat ? `<div class="macro-bar"><div class="value">${parseFloat(recipe.customFat.toFixed(2))} g</div><div class="label">${this.t('fat_short')}</div></div>` : ''}
                            ${recipe.customSaturatedFat ? `<div class="macro-bar"><div class="value">${parseFloat(recipe.customSaturatedFat.toFixed(2))} g</div><div class="label">${this.t('saturated_fat')}</div></div>` : ''}
                            ${recipe.customCarbohydrate ? `<div class="macro-bar"><div class="value">${parseFloat(recipe.customCarbohydrate.toFixed(2))} g</div><div class="label">${this.t('carbs_short')}</div></div>` : ''}
                            ${recipe.customSugar ? `<div class="macro-bar"><div class="value">${parseFloat(recipe.customSugar.toFixed(2))} g</div><div class="label">${this.t('sugar')}</div></div>` : ''}
                            ${recipe.customSalt ? `<div class="macro-bar"><div class="value">${parseFloat(recipe.customSalt.toFixed(2))} g</div><div class="label">${this.t('salt')}</div></div>` : ''}
                        </div>
                    </div>`;
            }

            content.innerHTML = `
                <h3>${recipe.name}</h3>
                ${recipe.description ? `<p>${recipe.description}</p>` : ''}
                <div class="recipe-total">${this.formatTotalCalories(totalKcal)}</div>
                ${nutritionHtml}
                <div class="recipe-actions">
                    <button class="btn btn-secondary btn-edit-recipe-detail">${this.t('btn_edit')}</button>
                    <button class="btn btn-primary btn-add-recipe-to-meal" data-id="${recipe.id}">
                        ${this.t('add_to_meal')}
                    </button>
                </div>`;
            content.querySelector('.btn-edit-recipe-detail')?.addEventListener('click', () => openRecipeEditor(recipe));
            content.querySelector('.btn-add-recipe-to-meal')?.addEventListener('click', async () => {
                this.showRecipePortionSelector(recipe);
            });
        };

        document.getElementById('btn-recipe-back')?.addEventListener('click', () => {
            showView(listView);
        });

        document.getElementById('btn-new-recipe')?.addEventListener('click', () => {
            openRecipeEditor();
        });

        document.getElementById('btn-recipe-cancel')?.addEventListener('click', () => {
            showView(listView);
        });

        // Nutrition mode toggle (per 100g vs per product)
        let nutritionMode = 'per100g';
        document.querySelectorAll('.nutrition-mode').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.nutrition-mode').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                nutritionMode = btn.dataset.mode;
                const weightRow = document.getElementById('product-weight-row');
                if (weightRow) weightRow.style.display = nutritionMode === 'perProduct' ? 'block' : 'none';
            });
        });

        // Online nutrition search
        document.getElementById('btn-search-online')?.addEventListener('click', async () => {
            const query = document.getElementById('online-nutrition-search')?.value?.trim();
            if (!query) return;
            const status = document.getElementById('online-search-status');
            if (status) {
                status.style.display = 'block';
                status.innerHTML = `<div class="spinner-small"></div> ${this.t('searching')}...`;
            }
            try {
                const result = await API.searchNutritionOnline(query);
                if (result.error) {
                    if (status) status.textContent = result.error;
                    return;
                }
                const form = document.getElementById('recipe-form');
                if (!form) return;

                if (result.name && !form.name.value) form.name.value = result.name;

                const data = result.per100g || result;
                if (data.calories) form.customCalories.value = data.calories;
                if (data.caloriesKj) form.customCaloriesKj.value = data.caloriesKj;
                if (data.fat) form.customFat.value = data.fat;
                if (data.saturatedFat) form.customSaturatedFat.value = data.saturatedFat;
                if (data.carbohydrate) form.customCarbohydrate.value = data.carbohydrate;
                if (data.sugar) form.customSugar.value = data.sugar;
                if (data.protein) form.customProtein.value = data.protein;
                if (data.salt) form.customSalt.value = data.salt;

                if (result.nutritionMode === 'perProduct' && result.productWeightG) {
                    nutritionMode = 'perProduct';
                    document.querySelectorAll('.nutrition-mode').forEach(b => {
                        b.classList.toggle('active', b.dataset.mode === 'perProduct');
                    });
                    const weightRow = document.getElementById('product-weight-row');
                    if (weightRow) weightRow.style.display = 'block';
                    form.productWeightG.value = result.productWeightG;
                }

                if (status) {
                    status.textContent = `✓ ${this.t('search_found')}: ${result.name || query}`;
                    setTimeout(() => { status.style.display = 'none'; }, 3000);
                }
            } catch (e) {
                if (status) status.textContent = this.t('search_failed');
            }
        });

        const searchInput = document.getElementById('recipe-food-search');
        const searchResults = document.getElementById('recipe-search-results');
        let searchTimeout;
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
                    const renderSearchResults = () => {
                        const sortedResults = this.sortFavoritesFirst(results);
                        searchResults.innerHTML = sortedResults.map(f => {
                        const primaryName = this.getLocalizedName(f);
                        const secondaryName = this.getSecondaryName(f);
                        const isFavorite = this.isFavorite(f.id);
                        return `
                            <div class="search-result" data-id="${f.id}" data-kcal="${f.energyKcal}"
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
                            el.addEventListener('click', async () => {
                                const summary = sortedResults.find(item => item.id === el.dataset.id);
                                if (!summary) return;
                                let food = summary;
                                try {
                                    food = await API.getFood(summary.id);
                                } catch { /* use search summary */ }
                                this.showRecipePortionDialog(food, recipeIngredients, updateIngredientsList);
                            });
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
                                renderSearchResults();
                            });
                        });
                    };
                    renderSearchResults();
                } catch (e) {
                    console.error('Recipe ingredient search failed:', e);
                }
            }, 300);
        });

        const updateIngredientsList = () => {
            const list = document.getElementById('recipe-ingredients-list');
            if (!list) return;
            if (recipeIngredients.length === 0) {
                list.innerHTML = `<p class="empty">${this.t('no_ingredients')}</p>`;
                return;
            }
            const totalKcal = recipeIngredients.reduce((s, i) => s + i.kcal * i.portion / 100, 0);
            list.innerHTML = recipeIngredients.map((ing, i) => `
                <div class="meal-item recipe-ingredient-row">
                    <span class="recipe-ingredient-name">${ing.name}</span>
                    <label class="recipe-ingredient-amount">
                        <input type="number" value="${ing.portion}" min="0.01" step="any" data-index="${i}"
                               aria-label="${this.t('portion_label')}: ${ing.name}" />
                        <span>g</span>
                    </label>
                    <span class="recipe-ingredient-calories" data-index="${i}">${this.formatCalories(ing.kcal * ing.portion / 100)}</span>
                    <button class="remove-btn" data-index="${i}">✕</button>
                </div>
            `).join('') + `<div class="meal-total">${this.formatTotalCalories(totalKcal)}</div>`;
            list.querySelectorAll('.recipe-ingredient-amount input').forEach(input => {
                input.addEventListener('input', () => {
                    const index = Number(input.dataset.index);
                    const grams = parseFloat(input.value);
                    if (!Number.isFinite(grams) || grams <= 0) return;
                    recipeIngredients[index].portion = grams;
                    list.querySelector(`.recipe-ingredient-calories[data-index="${index}"]`).textContent =
                        this.formatCalories(recipeIngredients[index].kcal * grams / 100);
                    const updatedTotal = recipeIngredients.reduce((sum, ingredient) =>
                        sum + ingredient.kcal * ingredient.portion / 100, 0);
                    list.querySelector('.meal-total').textContent = this.formatTotalCalories(updatedTotal);
                });
            });
            list.querySelectorAll('.remove-btn').forEach(btn => {
                btn.onclick = () => {
                    recipeIngredients.splice(parseInt(btn.dataset.index), 1);
                    updateIngredientsList();
                };
            });
        };

        openRecipeEditor = (recipe = null) => {
            editingRecipeId = recipe?.id || null;
            recipeForm.reset();
            recipeIngredients = (recipe?.ingredients || []).map(ingredient => ({
                id: ingredient.foodItemId || ingredient.foodItem?.id,
                name: this.getLocalizedName(ingredient.foodItem),
                portion: Number(ingredient.portionGrams) || 0,
                kcal: Number(ingredient.foodItem?.energyKcal) || 0
            }));

            recipeForm.elements.name.value = recipe?.name || '';
            recipeForm.elements.description.value = recipe?.description || '';
            const nutritionFields = [
                'customCalories', 'customCaloriesKj', 'customProtein', 'customFat',
                'customSaturatedFat', 'customCarbohydrate', 'customSugar', 'customSalt', 'productWeightG'
            ];
            nutritionFields.forEach(field => {
                recipeForm.elements[field].value = recipe?.[field] ?? '';
            });

            nutritionMode = recipe?.nutritionMode || 'per100g';
            recipeForm.querySelectorAll('.nutrition-mode').forEach(button => {
                button.classList.toggle('active', button.dataset.mode === nutritionMode);
            });
            document.getElementById('product-weight-row').style.display = nutritionMode === 'perProduct' ? 'block' : 'none';
            document.getElementById('recipe-form-title').textContent = this.t(editingRecipeId ? 'edit_recipe_title' : 'create_recipe_title');
            searchInput.value = '';
            searchResults.replaceChildren();
            updateIngredientsList();
            showView(createView);
        };

        document.getElementById('btn-barcode-recipe')?.addEventListener('click', () => {
            this.showBarcodeDialog(food => {
                _ingredientsCache.clear();
                this.showToast(this.t('barcode_food_saved'));
                this.showRecipePortionDialog(food, recipeIngredients, updateIngredientsList);
            });
        });

        recipeForm?.addEventListener('submit', async (e) => {
            e.preventDefault();
            const form = e.target;
            const name = form.name.value.trim();
            const hasIngredients = recipeIngredients.length > 0;
            const hasManualNutrition = parseFloat(form.customCalories.value) > 0;
            if (!name || (!hasIngredients && !hasManualNutrition)) {
                this.showToast(this.t('name_ingredients_required'), 'error');
                return;
            }
            try {
                const recipeData = {
                    name,
                    description: form.description.value.trim() || null,
                    ingredients: recipeIngredients.map((ing, i) => ({
                        foodItemId: ing.id,
                        portionGrams: ing.portion,
                        orderIndex: i
                    }))
                };
                if (hasManualNutrition) {
                    recipeData.nutritionMode = nutritionMode;
                    recipeData.customCalories = parseFloat(form.customCalories.value) || null;
                    recipeData.customCaloriesKj = parseFloat(form.customCaloriesKj.value) || null;
                    recipeData.customProtein = parseFloat(form.customProtein.value) || null;
                    recipeData.customFat = parseFloat(form.customFat.value) || null;
                    recipeData.customSaturatedFat = parseFloat(form.customSaturatedFat.value) || null;
                    recipeData.customCarbohydrate = parseFloat(form.customCarbohydrate.value) || null;
                    recipeData.customSugar = parseFloat(form.customSugar.value) || null;
                    recipeData.customSalt = parseFloat(form.customSalt.value) || null;
                    if (nutritionMode === 'perProduct') {
                        recipeData.productWeightG = parseFloat(form.productWeightG.value) || null;
                    }
                }
                if (editingRecipeId) {
                    await API.updateRecipe(editingRecipeId, recipeData);
                    this.showToast(this.t('recipe_updated'));
                } else {
                    await API.createRecipe(recipeData);
                    this.showToast(this.t('recipe_saved'));
                }
                editingRecipeId = null;
                showView(listView);
                await loadRecipes();
            } catch (e) {
                this.showToast(this.t('toast_save_failed'), 'error');
            }
        });

        await loadRecipes();
    },

    showRecipePortionDialog(food, ingredients, updateFn) {
        const name = this.getLocalizedName(food);
        const isFavorite = this.isFavorite(food.id);
        const nutrients = [
            { label: this.t('energy'), value: food.energyKcal, unit: 'kcal' },
            { label: this.t('energy'), value: food.energyKj, unit: 'kJ' },
            { label: this.t('protein_short'), value: food.protein, unit: 'g' },
            { label: this.t('fat_short'), value: food.fat, unit: 'g' },
            { label: this.t('saturated_fat'), value: food.saturatedFat, unit: 'g' },
            { label: this.t('carbs_short'), value: food.carbohydrate, unit: 'g' },
            { label: this.t('sugar'), value: food.sugar, unit: 'g' },
            { label: this.t('fiber_short'), value: food.fiber, unit: 'g' },
            { label: this.t('salt'), value: food.salt, unit: 'g' }
        ];
        const formatNutrient = (value, unit) => value == null
            ? '—'
            : `${parseFloat(Number(value).toFixed(unit === 'g' ? 4 : 1))} ${unit}`;
        const overlay = document.createElement('div');
        overlay.className = 'portion-dialog';
        overlay.innerHTML = `
            <div class="portion-content recipe-ingredient-dialog">
                <div class="portion-header">
                    <h3>${name}</h3>
                    <button class="btn-favorite ${isFavorite ? 'active' : ''}" id="btn-recipe-ingredient-favorite"
                            title="${this.t('toggle_favorite')}" aria-label="${this.t('toggle_favorite')}">${isFavorite ? '★' : '☆'}</button>
                </div>
                <label>${this.t('portion_label')}</label>
                <input type="number" id="portion-grams" value="100" min="0.01" step="any" />
                <div class="recipe-ingredient-nutrition">
                    <h4>${this.t('nutrition_facts')}</h4>
                    <table class="nutrient-table">
                        <thead>
                            <tr><th></th><th>${this.t('per_100g')}</th><th>${this.t('for_amount')}</th></tr>
                        </thead>
                        <tbody>
                            ${nutrients.map((nutrient, index) => `
                                <tr>
                                    <td>${nutrient.label}${nutrient.unit === 'kJ' ? ' (kJ)' : ''}</td>
                                    <td class="nutrient-value">${formatNutrient(nutrient.value, nutrient.unit)}</td>
                                    <td class="nutrient-value" data-nutrient-index="${index}"></td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
                <div class="portion-buttons">
                    <button class="btn btn-secondary" id="btn-portion-cancel">${this.t('btn_cancel')}</button>
                    <button class="btn btn-primary" id="btn-portion-add">${this.t('btn_add')}</button>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);
        this.dismissOverlayOnClickOutside(overlay);
        const favoriteButton = overlay.querySelector('#btn-recipe-ingredient-favorite');
        favoriteButton.addEventListener('click', () => {
            const nowFavorite = this.toggleFavorite({
                id: food.id,
                name,
                type: 'food',
                kcalPer100: Number(food.energyKcal) || 0,
                protein: Number(food.protein) || 0,
                fat: Number(food.fat) || 0,
                carbs: Number(food.carbohydrate) || 0
            });
            favoriteButton.textContent = nowFavorite ? '★' : '☆';
            favoriteButton.classList.toggle('active', nowFavorite);
            document.querySelectorAll('.search-favorite').forEach(button => {
                if (button.dataset.favoriteId !== String(food.id)) return;
                button.textContent = nowFavorite ? '★' : '☆';
                button.classList.toggle('active', nowFavorite);
            });
        });
        const portionInput = overlay.querySelector('#portion-grams');
        const updateNutrition = () => {
            const grams = parseFloat(portionInput.value) || 0;
            overlay.querySelectorAll('[data-nutrient-index]').forEach(cell => {
                const nutrient = nutrients[Number(cell.dataset.nutrientIndex)];
                const amountValue = nutrient.value == null ? null : Number(nutrient.value) * grams / 100;
                cell.textContent = formatNutrient(amountValue, nutrient.unit);
            });
        };
        portionInput.addEventListener('input', updateNutrition);
        updateNutrition();
        overlay.querySelector('#btn-portion-cancel').onclick = () => overlay.remove();
        overlay.querySelector('#btn-portion-add').onclick = () => {
            const grams = parseFloat(portionInput.value) || 100;
            ingredients.push({
                id: food.id,
                name,
                portion: grams,
                kcal: Number(food.energyKcal) || 0
            });
            updateFn();
            const searchInput = document.getElementById('recipe-food-search');
            const searchResults = document.getElementById('recipe-search-results');
            if (searchInput) searchInput.value = '';
            if (searchResults) searchResults.replaceChildren();
            overlay.remove();
        };
    },

    showRecipePortionSelector(recipe, mealType = null, consumptionTime = null) {
        const mealTypes = this.getMealTypes().map(value => ({ value, label: this.t(`meal_${value}`) }));
        let selectedMealType = mealTypes.some(item => item.value === mealType)
            ? mealType
            : this.getEstimatedMealType();
        const ingredients = recipe.ingredients || [];
        const ingredientWeight = ingredients.reduce((sum, ingredient) => sum + Number(ingredient.portionGrams || 0), 0);
        const baseWeight = ingredientWeight || Number(recipe.productWeightG) || 100;
        const baseCalories = ingredients.length > 0
            ? ingredients.reduce((sum, ingredient) => {
                const food = ingredient.foodItem;
                return sum + (food ? Number(food.energyKcal || 0) * Number(ingredient.portionGrams || 0) / 100 : 0);
            }, 0)
            : recipe.nutritionMode === 'per100g'
                ? Number(recipe.customCalories || 0) * baseWeight / 100
                : Number(recipe.customCalories || 0);
        const nutrientDefinitions = [
            { key: 'protein', customKey: 'customProtein', label: this.t('protein_short') },
            { key: 'fat', customKey: 'customFat', label: this.t('fat_short') },
            { key: 'saturatedFat', customKey: 'customSaturatedFat', label: this.t('saturated_fat'), sub: true },
            { key: 'carbohydrate', customKey: 'customCarbohydrate', label: this.t('carbs_short') },
            { key: 'sugar', customKey: 'customSugar', label: this.t('sugar'), sub: true },
            { key: 'fiber', label: this.t('fiber_short') },
            { key: 'salt', customKey: 'customSalt', label: this.t('salt') }
        ];
        const baseNutrients = nutrientDefinitions.map(nutrient => {
            if (ingredients.length > 0) {
                return ingredients.reduce((sum, ingredient) => {
                    const value = ingredient.foodItem?.[nutrient.key];
                    return sum + (value == null ? 0 : Number(value) * Number(ingredient.portionGrams || 0) / 100);
                }, 0);
            }
            const customValue = nutrient.customKey ? Number(recipe[nutrient.customKey] || 0) : 0;
            return recipe.nutritionMode === 'per100g' ? customValue * baseWeight / 100 : customValue;
        });
        const gramPresets = [...new Set([100, 250, 500, Math.round(baseWeight)].filter(value => value > 0))]
            .sort((left, right) => left - right);
        const overlay = document.createElement('div');
        overlay.className = 'portion-dialog';
        overlay.innerHTML = `
            <div class="portion-content recipe-use-dialog">
                <h3>${recipe.name}</h3>
                <label>${this.t('meal_type_label')}</label>
                <div class="meal-type-selector recipe-meal-selector" role="radiogroup" aria-label="${this.t('meal_type_label')}">
                    ${mealTypes.map(item => `
                        <button type="button" class="meal-type ${item.value === selectedMealType ? 'active' : ''}"
                                data-meal-type="${item.value}" role="radio" aria-checked="${item.value === selectedMealType}">${item.label}</button>
                    `).join('')}
                </div>
                <div class="consumption-time-field">
                    <label for="recipe-consumption-time">${this.t('consumption_time')}</label>
                    <input type="time" id="recipe-consumption-time" value="${consumptionTime || this.getCurrentTimeValue()}" step="60" />
                </div>
                <div class="nutrition-mode-selector recipe-portion-mode" role="group" aria-label="${this.t('recipe_amount_mode')}">
                    <button type="button" class="nutrition-mode active" data-mode="quantity">${this.t('quantity')}</button>
                    <button type="button" class="nutrition-mode" data-mode="percent">${this.t('percentage')}</button>
                    <button type="button" class="nutrition-mode" data-mode="grams">${this.t('quantity_grams')}</button>
                </div>
                <div class="recipe-portion-panel" data-panel="quantity">
                    <label for="recipe-portion-quantity">${this.t('recipe_quantity')}</label>
                    <div class="portion-presets">
                        ${[1, 2, 3, 4, 5].map(quantity => `
                            <button type="button" class="btn btn-secondary portion-preset ${quantity === 1 ? 'active' : ''}" data-value="${quantity}">${quantity}</button>
                        `).join('')}
                    </div>
                    <input type="number" id="recipe-portion-quantity" value="1" min="1" max="100" step="1" />
                </div>
                <div class="recipe-portion-panel" data-panel="percent" hidden>
                    <label for="recipe-portion-percent">${this.t('recipe_percentage')}</label>
                    <div class="portion-presets">
                        ${[25, 50, 75, 100].map(percent => `
                            <button type="button" class="btn btn-secondary portion-preset ${percent === 100 ? 'active' : ''}" data-value="${percent}">${percent}%</button>
                        `).join('')}
                    </div>
                    <input type="number" id="recipe-portion-percent" value="100" min="1" max="1000" step="1" />
                </div>
                <div class="recipe-portion-panel" data-panel="grams" hidden>
                    <label for="recipe-portion-grams">${this.t('portion_label')}</label>
                    <div class="portion-presets">
                        ${gramPresets.map(grams => `
                            <button type="button" class="btn btn-secondary portion-preset ${grams === Math.round(baseWeight) ? 'active' : ''}" data-value="${grams}">${grams} g</button>
                        `).join('')}
                    </div>
                    <input type="number" id="recipe-portion-grams" value="${parseFloat(baseWeight.toFixed(1))}" min="0.01" step="any" />
                </div>
                <p class="recipe-portion-summary" aria-live="polite"></p>
                <div class="recipe-portion-nutrition">
                    <h4>${this.t('nutrition_facts')}</h4>
                    <table class="nutrient-table">
                        <tbody>
                            ${nutrientDefinitions.map((nutrient, index) => `
                                <tr class="${nutrient.sub ? 'nutrient-sub' : ''}">
                                    <td>${nutrient.label}</td>
                                    <td class="nutrient-value" data-recipe-nutrient="${index}"></td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
                <div class="portion-buttons">
                    <button class="btn btn-secondary" id="btn-rp-cancel">${this.t('btn_cancel')}</button>
                    <button class="btn btn-primary" id="btn-rp-add">${this.t('btn_add')}</button>
                </div>
            </div>`;

        document.body.appendChild(overlay);
        this.dismissOverlayOnClickOutside(overlay);
        let mode = 'quantity';
        const quantityInput = overlay.querySelector('#recipe-portion-quantity');
        const percentInput = overlay.querySelector('#recipe-portion-percent');
        const gramsInput = overlay.querySelector('#recipe-portion-grams');
        const summary = overlay.querySelector('.recipe-portion-summary');
        overlay.querySelectorAll('.recipe-meal-selector button').forEach(button => {
            button.addEventListener('click', () => {
                selectedMealType = button.dataset.mealType;
                overlay.querySelectorAll('.recipe-meal-selector button').forEach(item => {
                    const selected = item === button;
                    item.classList.toggle('active', selected);
                    item.setAttribute('aria-checked', String(selected));
                });
            });
        });
        const selectedMultiplier = () => {
            if (mode === 'quantity') return parseFloat(quantityInput.value) || 0;
            if (mode === 'percent') return (parseFloat(percentInput.value) || 0) / 100;
            return (parseFloat(gramsInput.value) || 0) / baseWeight;
        };
        const updateSummary = () => {
            const multiplier = selectedMultiplier();
            const grams = baseWeight * multiplier;
            const calories = baseCalories * multiplier;
            summary.textContent = `${parseFloat(grams.toFixed(1))} g · ${this.formatCalories(calories)}`;
            overlay.querySelectorAll('[data-recipe-nutrient]').forEach(cell => {
                const value = baseNutrients[Number(cell.dataset.recipeNutrient)] * multiplier;
                cell.textContent = `${parseFloat(value.toFixed(2))} g`;
            });
        };
        const selectPreset = button => {
            const panel = button.closest('.recipe-portion-panel');
            panel.querySelectorAll('.portion-preset').forEach(item => item.classList.remove('active'));
            button.classList.add('active');
            panel.querySelector('input').value = button.dataset.value;
            updateSummary();
        };
        overlay.querySelectorAll('.recipe-portion-mode button').forEach(button => {
            button.addEventListener('click', () => {
                mode = button.dataset.mode;
                overlay.querySelectorAll('.recipe-portion-mode button').forEach(item => item.classList.toggle('active', item === button));
                overlay.querySelectorAll('.recipe-portion-panel').forEach(panel => { panel.hidden = panel.dataset.panel !== mode; });
                updateSummary();
            });
        });
        overlay.querySelectorAll('.portion-preset').forEach(button => {
            button.addEventListener('click', () => selectPreset(button));
        });
        [quantityInput, percentInput, gramsInput].forEach(input => {
            input.addEventListener('input', () => {
                input.closest('.recipe-portion-panel').querySelectorAll('.portion-preset').forEach(button => button.classList.remove('active'));
                updateSummary();
            });
        });
        updateSummary();

        overlay.querySelector('#btn-rp-cancel').onclick = () => overlay.remove();
        overlay.querySelector('#btn-rp-add').onclick = async () => {
            const value = mode === 'quantity'
                ? parseFloat(quantityInput.value)
                : mode === 'percent'
                    ? parseFloat(percentInput.value)
                    : parseFloat(gramsInput.value);
            if (!Number.isFinite(value) || value <= 0) return;
            try {
                const today = new Date().toISOString().split('T')[0];
                const consumptionTime = overlay.querySelector('#recipe-consumption-time').value;
                const entry = await API.createEntry({ entryDate: today, mealType: selectedMealType, consumptionTime: this.toApiConsumptionTime(consumptionTime) });
                const opts = mode === 'grams'
                    ? { portionGrams: value }
                    : { portionMultiplier: mode === 'percent' ? value / 100 : value };
                await API.addRecipeToEntry(entry.id, recipe.id, opts);
                this.showToast(this.t('recipe_added'));
                overlay.remove();
                this.navigate('dashboard');
            } catch (e) {
                this.showToast(this.t('add_failed'), 'error');
            }
        };
    }
});
