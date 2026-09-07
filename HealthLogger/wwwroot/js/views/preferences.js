// Preferences view
Object.assign(App.prototype, {
    async setupPreferences() {
        const form = document.getElementById('preferences-form');
        let reminderTimes = [];
        let ingredientCategories = ['Own'];

        const renderReminders = () => {
            const list = document.getElementById('reminder-times-list');
            if (!list) return;
            list.innerHTML = reminderTimes.sort().map((time, i) => `
                <span class="reminder-tag">${time} <button class="remove-reminder" data-index="${i}">✕</button></span>
            `).join('') || `<span style="color: var(--text-secondary); font-size: 0.85rem;">${this.t('no_reminders')}</span>`;
            list.querySelectorAll('.remove-reminder').forEach(btn => {
                btn.onclick = () => {
                    reminderTimes.splice(parseInt(btn.dataset.index), 1);
                    renderReminders();
                };
            });
        };

        const renderIngredientCategories = () => {
            const list = document.getElementById('ingredient-categories-list');
            if (!list) return;
            ingredientCategories = ['Own', ...ingredientCategories
                .filter(category => category.toLocaleLowerCase() !== 'own')]
                .filter((category, index, categories) =>
                    categories.findIndex(candidate => candidate.toLocaleLowerCase() === category.toLocaleLowerCase()) === index);
            list.innerHTML = ingredientCategories.map(category => `
                <span class="reminder-tag">${category}${category === 'Own' ? '' : ` <button type="button" class="remove-ingredient-category" data-category="${encodeURIComponent(category)}">✕</button>`}</span>
            `).join('');
            list.querySelectorAll('.remove-ingredient-category').forEach(button => {
                button.onclick = () => {
                    const category = decodeURIComponent(button.dataset.category);
                    ingredientCategories = ingredientCategories.filter(item => item !== category);
                    renderIngredientCategories();
                };
            });
        };

        if (form) {
            form.language.value = window.i18n?.lang || 'en';
            form.theme.value = localStorage.getItem('HealthLogger_theme') || 'auto';
        }

        try {
            const prefs = await API.getPreferences();
            if (form && prefs) {
                form.language.value = prefs.language || window.i18n?.lang || 'en';
                form.theme.value = prefs.theme || 'auto';
                if (prefs.dailyCalorieTarget) form.dailyCalorieTarget.value = prefs.dailyCalorieTarget;
                if (prefs.sex) form.sex.value = prefs.sex;
                if (prefs.dateOfBirth) form.dateOfBirth.value = prefs.dateOfBirth.split('T')[0];
                if (prefs.heightCm) form.heightCm.value = prefs.heightCm;
                if (prefs.targetWeightKg) form.targetWeightKg.value = prefs.targetWeightKg;
                if (prefs.targetWaistCm) form.targetWaistCm.value = prefs.targetWaistCm;
                if (prefs.unitSystem) form.unitSystem.value = prefs.unitSystem;
                form.enableNotifications.checked = prefs.enableNotifications !== false;
                localStorage.setItem('HealthLogger_units', prefs.unitSystem || 'metric');
                if (prefs.ingredientCategories) {
                    try { ingredientCategories = JSON.parse(prefs.ingredientCategories) || ['Own']; } catch { ingredientCategories = ['Own']; }
                }
                if (prefs.reminderTimes) {
                    try { reminderTimes = JSON.parse(prefs.reminderTimes) || []; } catch { reminderTimes = []; }
                }
            }
        } catch (e) { /* new user */ }

        renderReminders();
        renderIngredientCategories();

        document.getElementById('btn-add-reminder')?.addEventListener('click', () => {
            const input = document.getElementById('new-reminder-time');
            const time = input?.value;
            if (time && !reminderTimes.includes(time)) {
                reminderTimes.push(time);
                renderReminders();
                input.value = '';
            }
        });

        document.getElementById('btn-add-ingredient-category')?.addEventListener('click', () => {
            const input = document.getElementById('new-ingredient-category');
            const category = input?.value.trim();
            if (category && !ingredientCategories.some(item => item.toLocaleLowerCase() === category.toLocaleLowerCase())) {
                ingredientCategories.push(category);
                renderIngredientCategories();
                input.value = '';
            }
        });

        document.getElementById('preferences-form')?.addEventListener('submit', async (e) => {
            e.preventDefault();
            const currentForm = e.target;
            const newLang = currentForm.language.value;
            try {
                const enableNotifications = currentForm.enableNotifications.checked;
                await API.savePreferences({
                    language: newLang,
                    theme: currentForm.theme.value,
                    dailyCalorieTarget: parseInt(currentForm.dailyCalorieTarget.value) || null,
                    sex: currentForm.sex.value || null,
                    dateOfBirth: currentForm.dateOfBirth.value || null,
                    heightCm: parseFloat(currentForm.heightCm.value) || null,
                    targetWeightKg: parseFloat(currentForm.targetWeightKg.value) || null,
                    targetWaistCm: parseFloat(currentForm.targetWaistCm.value) || null,
                    unitSystem: currentForm.unitSystem.value,
                    ingredientCategories: JSON.stringify(ingredientCategories),
                    enableNotifications,
                    reminderTimes: JSON.stringify(reminderTimes)
                });
                _ingredientsCache.clear();
                localStorage.setItem('HealthLogger_units', currentForm.unitSystem.value);
                localStorage.setItem('HealthLogger_reminders', JSON.stringify(reminderTimes));
                localStorage.setItem('HealthLogger_notifications', String(enableNotifications));
                document.documentElement.setAttribute('data-theme', currentForm.theme.value);
                localStorage.setItem('HealthLogger_theme', currentForm.theme.value);
                if (window.i18n) {
                    await window.i18n.setLang(newLang);
                    window.i18n.applyToDOM();
                    this.navigate(this.currentPage);
                }
                this.startReminderChecker();
                this.showToast(this.t('toast_saved'));
            } catch (e) {
                alert(this.t('toast_save_failed'));
            }
        });

        document.getElementById('btn-logout')?.addEventListener('click', () => {
            window.authManager.logout();
        });
    }
});
