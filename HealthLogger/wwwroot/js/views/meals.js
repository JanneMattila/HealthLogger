// Meals view — manages grouped food entries by date and shared consumption time
Object.assign(App.prototype, {
    async setupMeals() {
        const dateInput = document.getElementById('meals-date');
        const list = document.getElementById('meals-list');
        const escapeHtml = value => String(value ?? '')
            .replaceAll('&', '&amp;')
            .replaceAll('<', '&lt;')
            .replaceAll('>', '&gt;')
            .replaceAll('"', '&quot;')
            .replaceAll("'", '&#39;');
        const itemCalories = item => item.customCalories
            ?? ((item.foodItem?.energyKcal || 0) * item.portionGrams / 100);
        const formatGrams = value => `${parseFloat(Number(value).toFixed(1))} g`;
        const today = this.getLocalDateValue();

        dateInput.value = this.pendingMealDate || today;
        this.pendingMealDate = null;

        const renderMeals = entries => {
            if (!entries.length) {
                list.innerHTML = `<div class="meals-empty"><p>${this.t('no_meals_for_date')}</p><button type="button" class="btn btn-primary meals-empty-add">${this.t('btn_add_meal')}</button></div>`;
                list.querySelector('.meals-empty-add').addEventListener('click', () => {
                    this.pendingMealDate = dateInput.value;
                    this.navigate('add-meal');
                });
                return;
            }

            const renderMealCard = entry => {
                const items = entry.items || [];
                const calories = items.reduce((sum, item) => sum + itemCalories(item), 0);
                return `
                    <article class="meal-card" data-entry-id="${entry.id}">
                        <header class="meal-card-header">
                            <div>
                                <span class="meal-card-time">${entry.consumptionTime?.slice(0, 5) || this.t('time_not_set')}</span>
                            </div>
                            <strong>${this.formatCalories(calories)}</strong>
                        </header>
                        ${entry.notes ? `<p class="meal-card-notes">${escapeHtml(entry.notes)}</p>` : ''}
                        <div class="meal-card-items">
                            ${items.length ? items.map(item => {
                                const name = item.foodItem
                                    ? this.getLocalizedName(item.foodItem)
                                    : (item.sourceRecipeName || item.notes || this.t('unknown'));
                                return `
                                    <div class="meal-card-item" data-item-id="${item.id}">
                                        <div><strong>${escapeHtml(name)}</strong><small>${formatGrams(item.portionGrams)}</small></div>
                                        <span>${this.formatCalories(itemCalories(item))}</span>
                                        <div class="meal-card-item-actions">
                                            <button type="button" class="btn btn-icon meal-item-edit" title="${this.t('btn_edit')}" aria-label="${this.t('edit_meal_item')}">✎</button>
                                            <button type="button" class="btn btn-icon meal-item-delete" title="${this.t('btn_delete')}" aria-label="${this.t('btn_delete')}">✕</button>
                                        </div>
                                    </div>`;
                            }).join('') : `<p class="meal-card-empty">${this.t('no_meal_items')}</p>`}
                        </div>
                        <footer class="meal-card-actions">
                            <button type="button" class="btn btn-secondary meal-edit">${this.t('btn_edit_meal')}</button>
                            <button type="button" class="btn btn-danger meal-delete">${this.t('btn_delete')}</button>
                        </footer>
                    </article>`;
            };

            list.innerHTML = this.getMealTypes().map(mealType => {
                const mealEntries = entries.filter(entry => entry.mealType === mealType);
                if (!mealEntries.length) return '';
                return `
                    <section class="meals-type-group" data-meal-type="${mealType}">
                        <h3 class="meals-type-group-title">${this.t(`meal_${mealType}`)}</h3>
                        <div class="meals-type-group-entries">${mealEntries.map(renderMealCard).join('')}</div>
                    </section>`;
            }).join('');

            list.querySelectorAll('.meal-edit').forEach(button => {
                button.addEventListener('click', () => {
                    const entry = entries.find(candidate => candidate.id === button.closest('.meal-card').dataset.entryId);
                    if (entry) this.showMealEditor(entry, loadMeals);
                });
            });
            list.querySelectorAll('.meal-delete').forEach(button => {
                button.addEventListener('click', async () => {
                    if (!window.confirm(this.t('confirm_delete_meal'))) return;
                    button.disabled = true;
                    try {
                        await API.deleteEntry(button.closest('.meal-card').dataset.entryId);
                        await loadMeals();
                        this.showToast(this.t('meal_deleted'));
                    } catch {
                        button.disabled = false;
                        this.showToast(this.t('toast_delete_failed'), 'error');
                    }
                });
            });
            list.querySelectorAll('.meal-item-edit').forEach(button => {
                button.addEventListener('click', () => {
                    const card = button.closest('.meal-card');
                    const row = button.closest('.meal-card-item');
                    const entry = entries.find(candidate => candidate.id === card.dataset.entryId);
                    const item = entry?.items?.find(candidate => candidate.id === row.dataset.itemId);
                    if (entry && item) this.showMealItemEditor(entry, item, loadMeals);
                });
            });
            list.querySelectorAll('.meal-item-delete').forEach(button => {
                button.addEventListener('click', async () => {
                    if (!window.confirm(this.t('confirm_delete_meal_item'))) return;
                    const card = button.closest('.meal-card');
                    const row = button.closest('.meal-card-item');
                    button.disabled = true;
                    try {
                        await API.removeEntryItem(card.dataset.entryId, row.dataset.itemId);
                        await loadMeals();
                    } catch {
                        button.disabled = false;
                        this.showToast(this.t('toast_delete_failed'), 'error');
                    }
                });
            });
        };

        const loadMeals = async () => {
            list.innerHTML = `<p class="loading">${this.t('loading')}</p>`;
            try {
                renderMeals(await API.getEntries(dateInput.value));
            } catch {
                list.innerHTML = `<p class="error">${this.t('error_load_failed')}</p>`;
            }
        };

        dateInput.addEventListener('change', loadMeals);
        document.getElementById('btn-previous-meals-date').addEventListener('click', () => {
            const date = new Date(`${dateInput.value}T12:00:00`);
            date.setDate(date.getDate() - 1);
            dateInput.value = this.getLocalDateValue(date);
            loadMeals();
        });
        document.getElementById('btn-next-meals-date').addEventListener('click', () => {
            const date = new Date(`${dateInput.value}T12:00:00`);
            date.setDate(date.getDate() + 1);
            dateInput.value = this.getLocalDateValue(date);
            loadMeals();
        });
        document.getElementById('btn-new-meal').addEventListener('click', () => {
            this.pendingMealDate = dateInput.value;
            this.navigate('add-meal');
        });
        await loadMeals();
    },

    showMealEditor(entry, onSaved) {
        const mealTypes = this.getMealTypes();
        let selectedMealType = entry.mealType;
        const overlay = document.createElement('div');
        overlay.className = 'portion-dialog';
        overlay.innerHTML = `
            <div class="portion-content meal-editor" role="dialog" aria-modal="true" aria-labelledby="meal-editor-title">
                <h3 id="meal-editor-title">${this.t('edit_meal_title')}</h3>
                <label for="edit-meal-date">${this.t('meal_date')}</label>
                <input type="date" id="edit-meal-date" value="${entry.entryDate}" required />
                <label for="edit-meal-time">${this.t('consumption_time')}</label>
                <input type="time" id="edit-meal-time" value="${entry.consumptionTime?.slice(0, 5) || this.getCurrentTimeValue()}" required />
                <label>${this.t('meal_type_label')}</label>
                <div class="meal-type-selector edit-meal-type-selector" role="radiogroup" aria-label="${this.t('meal_type_label')}">
                    ${mealTypes.map(mealType => `
                        <button type="button" class="meal-type ${mealType === selectedMealType ? 'active' : ''}"
                                data-meal-type="${mealType}" role="radio" aria-checked="${mealType === selectedMealType}">${this.t(`meal_${mealType}`)}</button>
                    `).join('')}
                </div>
                <label for="edit-meal-notes">${this.t('label_notes')}</label>
                <textarea id="edit-meal-notes" rows="2">${String(entry.notes || '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')}</textarea>
                <div class="portion-buttons">
                    <button type="button" class="btn btn-secondary meal-edit-cancel">${this.t('btn_cancel')}</button>
                    <button type="button" class="btn btn-primary meal-edit-save">${this.t('btn_save')}</button>
                </div>
            </div>`;
        document.body.appendChild(overlay);
        this.dismissOverlayOnClickOutside(overlay);

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
        overlay.querySelector('.meal-edit-cancel').addEventListener('click', () => overlay.remove());
        overlay.querySelector('.meal-edit-save').addEventListener('click', async () => {
            const entryDate = overlay.querySelector('#edit-meal-date').value;
            const consumptionTime = overlay.querySelector('#edit-meal-time').value;
            if (!entryDate || !consumptionTime) return;
            overlay.querySelectorAll('button').forEach(button => { button.disabled = true; });
            try {
                await API.updateEntry(entry.id, {
                    entryDate,
                    consumptionTime: this.toApiConsumptionTime(consumptionTime),
                    mealType: selectedMealType,
                    notes: overlay.querySelector('#edit-meal-notes').value.trim() || null
                });
                overlay.remove();
                await onSaved();
                this.showToast(this.t('meal_updated'));
            } catch {
                overlay.querySelectorAll('button').forEach(button => { button.disabled = false; });
                this.showToast(this.t('toast_save_failed'), 'error');
            }
        });
    }
});
