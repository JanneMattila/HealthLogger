// Shared utility methods for App
Object.assign(App.prototype, {
    getMealTypes() {
        return ['breakfast', 'lunch', 'snack', 'dinner', 'supper'];
    },

    getEstimatedMealType(date = new Date()) {
        const minutes = date.getHours() * 60 + date.getMinutes();
        if (minutes < 10 * 60) return 'breakfast';
        if (minutes < 14 * 60) return 'lunch';
        if (minutes < 15 * 60 + 30) return 'snack';
        if (minutes < 19 * 60) return 'dinner';
        return 'supper';
    },

    getCurrentTimeValue(date = new Date()) {
        return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
    },

    getLocalDateValue(date = new Date()) {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    },

    toApiConsumptionTime(time) {
        return time ? `${time}:00` : null;
    },

    formatCalories(value) {
        return `${Math.round(value)} ${this.t('kcal')}`;
    },

    formatTotalCalories(value) {
        return `${this.t('total')}: ${this.formatCalories(value)}`;
    },

    getLocalizedName(item) {
        if (!item) return this.t('unknown');

        const lang = window.i18n?.lang || 'en';
        const primaryName = lang === 'fi'
            ? item.nameFi || item.name || item.nameEn
            : item.nameEn || item.name || item.nameFi;

        return primaryName || this.t('unknown');
    },

    getSecondaryName(item) {
        if (!item) return '';

        const lang = window.i18n?.lang || 'en';
        const primaryName = this.getLocalizedName(item);
        const secondaryName = lang === 'fi' ? item.nameEn : item.nameFi;

        return secondaryName && secondaryName !== primaryName ? secondaryName : '';
    },

    isImperial() {
        return localStorage.getItem('HealthLogger_units') === 'imperial';
    },

    formatWeight(kg) {
        if (this.isImperial()) return `${Math.round(kg * 2.20462 * 10) / 10} lb`;
        return `${Math.round(kg * 10) / 10} kg`;
    },

    formatHeight(cm) {
        if (this.isImperial()) {
            const totalInches = cm / 2.54;
            const feet = Math.floor(totalInches / 12);
            const inches = Math.round(totalInches % 12);
            return `${feet}'${inches}"`;
        }
        return `${Math.round(cm * 10) / 10} cm`;
    },

    formatWaist(cm) {
        if (this.isImperial()) return `${Math.round(cm / 2.54 * 10) / 10} in`;
        return `${Math.round(cm * 10) / 10} cm`;
    },

    formatDrinkAmount(ml) {
        if (ml >= 1000) return `${(ml / 1000).toFixed(1)} l`;
        if (ml >= 100 && ml % 100 === 0) return `${ml / 100} dl`;
        return `${ml} ml`;
    },

    convertToMl(amount, unit) {
        switch (unit) {
            case 'ml': return Math.round(amount);
            case 'dl': return Math.round(amount * 100);
            case 'l': return Math.round(amount * 1000);
            case 'cup': return Math.round(amount * 240);
            case 'glass': return Math.round(amount * 250);
            default: return Math.round(amount);
        }
    },

    showToast(message, type = 'success', options = {}) {
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        if (options.className) toast.classList.add(options.className);
        toast.setAttribute('role', 'status');
        toast.style.setProperty('--toast-visible-duration', `${Math.max((options.duration || 3000) - 300, 0)}ms`);

        const text = document.createElement('span');
        text.textContent = message;
        toast.appendChild(text);

        const dismiss = () => toast.remove();
        if (options.actionLabel && options.onAction) {
            const action = document.createElement('button');
            action.type = 'button';
            action.className = 'toast-action';
            action.textContent = options.actionLabel;
            action.addEventListener('click', () => {
                dismiss();
                options.onAction();
            });
            toast.appendChild(action);
        }

        document.body.appendChild(toast);
        setTimeout(dismiss, options.duration || 3000);
    },

    destroyChart(id) {
        if (this.charts[id]) {
            this.charts[id].destroy();
            delete this.charts[id];
        }
    },

    async searchFoods(query) {
        return API.searchFoods(query, window.i18n?.lang || 'en');
    },

    enhanceSelectWithSearch(select) {
        if (!select || select.dataset.searchable === 'true') return;
        select.dataset.searchable = 'true';
        select.classList.add('searchable-select-native');

        const wrapper = document.createElement('div');
        wrapper.className = 'searchable-select';
        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'searchable-select-input';
        input.autocomplete = 'off';
        input.setAttribute('role', 'combobox');
        input.setAttribute('aria-autocomplete', 'list');
        input.setAttribute('aria-expanded', 'false');
        input.setAttribute('aria-label', this.t('filter_categories'));
        input.placeholder = this.t('filter_categories');

        const listId = `${select.id || 'searchable-select'}-options`;
        const list = document.createElement('div');
        list.id = listId;
        list.className = 'searchable-select-options';
        list.setAttribute('role', 'listbox');
        input.setAttribute('aria-controls', listId);

        const toggle = document.createElement('button');
        toggle.type = 'button';
        toggle.className = 'searchable-select-toggle';
        toggle.textContent = '⌄';
        toggle.setAttribute('aria-label', this.t('filter_categories'));

        wrapper.append(input, toggle, list);
        select.after(wrapper);

        let filteredOptions = [];
        let activeIndex = -1;
        let showingSelection = true;
        const options = () => Array.from(select.options);
        const selectedText = () => select.selectedOptions[0]?.textContent || '';

        const close = () => {
            wrapper.classList.remove('open');
            input.setAttribute('aria-expanded', 'false');
            input.removeAttribute('aria-activedescendant');
            activeIndex = -1;
        };

        const setActive = (index) => {
            const items = list.querySelectorAll('[role="option"]');
            items.forEach(item => item.classList.remove('active'));
            activeIndex = Math.max(0, Math.min(index, items.length - 1));
            const active = items[activeIndex];
            if (active) {
                active.classList.add('active');
                input.setAttribute('aria-activedescendant', active.id);
                active.scrollIntoView({ block: 'nearest' });
            }
        };

        const choose = (option) => {
            select.value = option.value;
            input.value = option.textContent;
            showingSelection = true;
            select.dispatchEvent(new Event('change', { bubbles: true }));
            close();
        };

        const render = (query = '') => {
            const normalizedQuery = query.trim().toLocaleLowerCase();
            filteredOptions = options().filter(option =>
                option.textContent.toLocaleLowerCase().includes(normalizedQuery)
            );
            list.innerHTML = filteredOptions.map((option, index) => `
                <div id="${listId}-${index}" class="searchable-select-option"
                     role="option" aria-selected="${option.value === select.value}" data-index="${index}">
                    ${option.textContent}
                </div>
            `).join('');
            wrapper.classList.add('open');
            input.setAttribute('aria-expanded', 'true');
        };

        list.addEventListener('mousedown', event => {
            const item = event.target.closest('[role="option"]');
            if (!item) return;
            event.preventDefault();
            choose(filteredOptions[Number(item.dataset.index)]);
        });
        input.addEventListener('focus', () => {
            if (showingSelection) {
                input.value = '';
                showingSelection = false;
            }
            render(input.value);
        });
        input.addEventListener('input', () => {
            showingSelection = false;
            render(input.value);
        });
        input.addEventListener('keydown', event => {
            const isTyping = event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey;
            if (isTyping && showingSelection) {
                input.value = '';
                showingSelection = false;
                render('');
            }
            if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                event.preventDefault();
                if (!wrapper.classList.contains('open')) render(input.value);
                const nextIndex = activeIndex === -1 && event.key === 'ArrowUp'
                    ? filteredOptions.length - 1
                    : activeIndex + (event.key === 'ArrowDown' ? 1 : -1);
                setActive(nextIndex);
            } else if (event.key === 'Enter') {
                const option = filteredOptions[activeIndex]
                    || options().find(item => item.textContent.toLocaleLowerCase() === input.value.trim().toLocaleLowerCase());
                if (option) {
                    event.preventDefault();
                    choose(option);
                }
            } else if (event.key === 'Escape') {
                input.value = selectedText();
                showingSelection = true;
                close();
            }
        });
        input.addEventListener('blur', () => {
            const exact = options().find(option =>
                option.textContent.toLocaleLowerCase() === input.value.trim().toLocaleLowerCase()
            );
            if (exact && exact.value !== select.value) choose(exact);
            else {
                input.value = selectedText();
                showingSelection = true;
            }
            close();
        });
        toggle.addEventListener('click', () => {
            if (wrapper.classList.contains('open')) {
                input.value = selectedText();
                showingSelection = true;
                close();
            } else {
                input.focus();
                render('');
            }
        });

        input.value = selectedText();
    },

    dismissOverlayOnClickOutside(overlay, onClose = () => overlay.remove()) {
        const content = overlay.querySelector('.portion-content');
        if (content) {
            const closeBtn = document.createElement('button');
            closeBtn.className = 'dialog-close-btn';
            closeBtn.innerHTML = '✕';
            closeBtn.setAttribute('aria-label', this.t('btn_close'));
            closeBtn.title = this.t('btn_close');
            closeBtn.onclick = onClose;
            content.prepend(closeBtn);
        }
    }
});
