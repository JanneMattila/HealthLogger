// Check-in view
Object.assign(App.prototype, {
    async setupCheckin() {
        document.getElementById('checkin-form')?.addEventListener('keydown', event => {
            if (event.key !== 'Enter' || event.isComposing || !event.target.matches('input')) return;
            event.preventDefault();
            event.stopPropagation();
            const nextGroup = event.target.closest('.checkin-group')?.nextElementSibling;
            const nextField = nextGroup?.querySelector('.rating-buttons .selected')
                || nextGroup?.querySelector('button, input, select, textarea')
                || event.currentTarget.querySelector('button[type="submit"]');
            nextField?.focus();
        });

        document.querySelectorAll('.rating-buttons').forEach(group => {
            group.querySelectorAll('button').forEach(btn => {
                btn.addEventListener('click', () => {
                    group.querySelectorAll('button').forEach(b => b.classList.remove('selected'));
                    btn.classList.add('selected');
                    this.updateRatingDescription(group, btn);
                });
                const label = this.t(btn.dataset.ratingLabel);
                btn.title = `${btn.dataset.value}/5 — ${label}`;
                btn.setAttribute('aria-label', `${btn.dataset.value}/5 — ${label}`);
            });
        });

        const today = this.getLocalDateValue();
        try {
            const checkin = await API.getCheckin(today);
            if (checkin) {
                this.populateCheckinForm(checkin);
            }
        } catch (e) { /* no existing check-in for today */ }

        document.getElementById('checkin-form')?.addEventListener('submit', async (e) => {
            e.preventDefault();
            const form = e.target;
            const checkin = {
                checkinDate: today,
                sleepQuality: this.getSelectedRating('sleepQuality'),
                sleepHours: parseFloat(form.sleepHours?.value) || null,
                moodRating: this.getSelectedRating('moodRating'),
                energyLevel: this.getSelectedRating('energyLevel'),
                stressLevel: this.getSelectedRating('stressLevel'),
                stepCount: form.stepCount?.value ? Number(form.stepCount.value) : null,
                notes: form.notes?.value || null
            };
            try {
                await API.saveCheckin(checkin);
                this.showToast(this.t('toast_saved'));
                this.navigate('dashboard');
            } catch (e) {
                this.showToast(this.t('toast_save_failed'), 'error');
            }
        });
    },

    getSelectedRating(field) {
        const selected = document.querySelector(`.rating-buttons[data-field="${field}"] .selected`);
        return selected ? parseInt(selected.dataset.value) : null;
    },

    populateCheckinForm(checkin) {
        if (checkin.sleepQuality) this.selectRating('sleepQuality', checkin.sleepQuality);
        if (checkin.moodRating) this.selectRating('moodRating', checkin.moodRating);
        if (checkin.energyLevel) this.selectRating('energyLevel', checkin.energyLevel);
        if (checkin.stressLevel) this.selectRating('stressLevel', checkin.stressLevel);

        const form = document.getElementById('checkin-form');
        if (form) {
            if (checkin.sleepHours) form.sleepHours.value = checkin.sleepHours;
            if (checkin.stepCount != null) form.stepCount.value = checkin.stepCount;
            if (checkin.notes) form.notes.value = checkin.notes;
        }
    },

    selectRating(field, value) {
        const btn = document.querySelector(`.rating-buttons[data-field="${field}"] [data-value="${value}"]`);
        if (btn) {
            btn.classList.add('selected');
            this.updateRatingDescription(btn.closest('.rating-buttons'), btn);
        }
    },

    updateRatingDescription(group, button) {
        const description = document.querySelector(`[data-rating-description="${group.dataset.field}"]`);
        if (description) {
            description.textContent = `${button.dataset.value}/5 — ${this.t(button.dataset.ratingLabel)}`;
        }
    }
});
