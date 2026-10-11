Object.assign(App.prototype, {
    async setupHistory() {
        const container = document.getElementById('history-today');
        const dateInput = document.getElementById('history-date');
        const calendar = document.getElementById('history-calendar');
        const periodTitle = document.getElementById('history-period-title');
        const modeSelect = document.getElementById('history-calendar-mode');
        const locale = window.i18n?.lang === 'fi' ? 'fi-FI' : 'en-GB';
        const makeDate = (year, month, day) => {
            const date = new Date(0);
            date.setFullYear(year, month, day);
            date.setHours(12, 0, 0, 0);
            return date;
        };
        const dateValue = date => `${String(date.getFullYear()).padStart(4, '0')}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
        const parseDate = value => {
            if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return null;
            const [year, month, day] = value.split('-').map(Number);
            const date = makeDate(year, month - 1, day);
            return year >= 1 && year <= 9999 && dateValue(date) === value ? date : null;
        };
        const requestedDate = new URLSearchParams(window.location.search).get('date');
        let selectedDate = parseDate(requestedDate || this.historySelectedDate || this.getLocalDateValue());
        if (!selectedDate) {
            this.showToast(this.t('history_date_invalid'), 'error');
            selectedDate = parseDate(this.getLocalDateValue());
        }
        let period = makeDate(selectedDate.getFullYear(), selectedDate.getMonth(), selectedDate.getDate());
        modeSelect.value = this.historyCalendarMode || 'month';
        dateInput.value = dateValue(selectedDate);
        container.appendChild(document.getElementById('tmpl-log-meal').content.cloneNode(true));
        this.applyTranslations(container);

        const updateSelectedDate = (historyMode = 'replace') => {
            this.historySelectedDate = dateValue(selectedDate);
            const url = `/history?date=${this.historySelectedDate}`;
            if (window.location.pathname + window.location.search !== url) {
                window.history[historyMode === 'push' ? 'pushState' : 'replaceState']({ page: 'history' }, '', url);
            }
            container.querySelector('h2').textContent = selectedDate.toLocaleDateString(locale, { dateStyle: 'full' });
            container.querySelector('[data-i18n="today_nutrition"]').textContent = this.t('history_nutrition');
            container.querySelector('[data-i18n="today_meals"]').textContent = this.t('history_meals');
        };
        const renderCalendar = () => {
            const mode = modeSelect.value;
            this.historyCalendarMode = mode;
            calendar.classList.toggle('history-year-grid', mode === 'year');
            periodTitle.textContent = mode === 'year' ? String(period.getFullYear())
                : period.toLocaleDateString(locale, { month: 'long', year: 'numeric' });
            periodTitle.disabled = mode === 'year';
            if (mode === 'year') {
                calendar.innerHTML = Array.from({ length: 12 }, (_, month) => {
                    const date = makeDate(period.getFullYear(), month, 1);
                    return `<button type="button" class="btn btn-secondary history-month" data-month="${month}">${date.toLocaleDateString(locale, { month: 'long' })}</button>`;
                }).join('');
                return;
            }
            const start = mode === 'week'
                ? makeDate(period.getFullYear(), period.getMonth(), period.getDate() - (period.getDay() + 6) % 7)
                : makeDate(period.getFullYear(), period.getMonth(), 1);
            const offset = mode === 'week' ? 0 : (start.getDay() + 6) % 7;
            const days = mode === 'week' ? 7 : makeDate(period.getFullYear(), period.getMonth() + 1, 0).getDate();
            const headers = Array.from({ length: 7 }, (_, index) =>
                `<span class="history-weekday">${makeDate(2026, 0, 5 + index).toLocaleDateString(locale, { weekday: 'short' })}</span>`).join('');
            calendar.innerHTML = headers + '<span aria-hidden="true"></span>'.repeat(offset)
                + Array.from({ length: days }, (_, index) => {
                    const date = makeDate(start.getFullYear(), start.getMonth(), start.getDate() + index);
                    const value = dateValue(date);
                    const selected = value === dateValue(selectedDate);
                    const today = value === this.getLocalDateValue();
                    return `<button type="button" class="history-day${selected ? ' selected' : ''}${today ? ' today' : ''}"
                        data-date="${value}" aria-label="${escapeIngredientHtml(date.toLocaleDateString(locale, { dateStyle: 'full' }))}"
                        aria-pressed="${selected}" ${today ? 'aria-current="date"' : ''} ${date.getFullYear() < 1 || date.getFullYear() > 9999 ? 'disabled' : ''}>${date.getDate()}</button>`;
                }).join('');
            if (mode === 'week') {
                const end = makeDate(start.getFullYear(), start.getMonth(), start.getDate() + 6);
                periodTitle.textContent = `${start.toLocaleDateString(locale)} – ${end.toLocaleDateString(locale)}`;
            }
        };
        const selectDate = (value, notify = true) => {
            const date = parseDate(value);
            if (!date) {
                dateInput.value = dateValue(selectedDate);
                this.showToast(this.t('history_date_invalid'), 'error');
                return;
            }
            selectedDate = date;
            period = makeDate(date.getFullYear(), date.getMonth(), date.getDate());
            dateInput.value = dateValue(date);
            updateSelectedDate('push');
            renderCalendar();
            if (notify) dateInput.dispatchEvent(new Event('change'));
        };
        dateInput.addEventListener('change', () => {
            if (dateInput.value !== dateValue(selectedDate)) selectDate(dateInput.value, false);
        });
        calendar.addEventListener('click', event => {
            const day = event.target.closest('[data-date]');
            const month = event.target.closest('[data-month]');
            if (day) {
                selectDate(day.dataset.date);
                calendar.querySelector(`[data-date="${dateValue(selectedDate)}"]`)?.focus();
            }
            if (month) {
                period = makeDate(period.getFullYear(), Number(month.dataset.month), 1);
                modeSelect.value = 'month';
                renderCalendar();
            }
        });
        modeSelect.addEventListener('change', renderCalendar);
        periodTitle.addEventListener('click', () => {
            modeSelect.value = 'year';
            renderCalendar();
        });
        document.querySelectorAll('[data-history-direction]').forEach(button => {
            button.addEventListener('click', () => {
                const direction = Number(button.dataset.historyDirection);
                const mode = modeSelect.value;
                const next = mode === 'year' ? makeDate(period.getFullYear() + direction, period.getMonth(), 1)
                    : mode === 'month' ? makeDate(period.getFullYear(), period.getMonth() + direction, 1)
                    : makeDate(period.getFullYear(), period.getMonth(), period.getDate() + direction * 7);
                if (next.getFullYear() >= 1 && next.getFullYear() <= 9999) {
                    period = next;
                    renderCalendar();
                }
            });
        });
        document.getElementById('history-today-button').addEventListener('click', () => selectDate(this.getLocalDateValue()));
        updateSelectedDate();
        renderCalendar();
        await this.setupLogMeal({ dateInput });
    }
});
