// Tools view
Object.assign(App.prototype, {
    toolsCalorieNutrients: [
        { key: 'protein', labelKey: 'tools_protein', kcalPerGram: 4 },
        { key: 'carbs', labelKey: 'tools_carbs', kcalPerGram: 4 },
        { key: 'fat', labelKey: 'tools_fat', kcalPerGram: 9 },
        { key: 'fiber', labelKey: 'tools_fiber', kcalPerGram: 2 },
        { key: 'alcohol', labelKey: 'tools_alcohol', kcalPerGram: 7 }
    ],

    async setupTools() {
        const form = document.getElementById('tools-calorie-form');
        const rows = document.getElementById('tools-calorie-rows');
        const weightInput = document.getElementById('tools-weight');
        if (!form || !rows || !weightInput) return;

        const storageKey = 'HealthLogger_tools_calories';
        let saved = {};
        try { saved = JSON.parse(localStorage.getItem(storageKey) || '{}') || {}; } catch (e) { saved = {}; }

        rows.innerHTML = this.toolsCalorieNutrients.map(n => `
            <tr data-nutrient="${n.key}">
                <th scope="row">${this.t(n.labelKey)} <span class="tools-factor">(${n.kcalPerGram} kcal/g)</span></th>
                <td><input type="number" name="${n.key}" min="0" step="0.1" inputmode="decimal" aria-label="${this.t(n.labelKey)} (g)" /></td>
                <td class="tools-kcal">0</td>
                <td class="tools-gkg">—</td>
            </tr>`).join('');

        this.toolsCalorieNutrients.forEach(n => {
            if (saved[n.key] != null && saved[n.key] !== '') form.elements[n.key].value = saved[n.key];
        });
        if (saved.weightKg) weightInput.value = saved.weightKg;

        const round1 = value => Math.round(value * 10) / 10;
        const formatNumber = (value, digits) => value.toLocaleString(window.i18n?.lang || 'en', {
            minimumFractionDigits: digits, maximumFractionDigits: digits
        });
        const parse = input => {
            const value = parseFloat(String(input?.value ?? '').replace(',', '.'));
            return Number.isFinite(value) && value > 0 ? value : 0;
        };

        const recalculate = () => {
            const weightKg = parse(weightInput);
            let totalGrams = 0;
            let totalKcal = 0;
            const state = { weightKg: weightInput.value };

            this.toolsCalorieNutrients.forEach(n => {
                const input = form.elements[n.key];
                const grams = parse(input);
                const kcal = grams * n.kcalPerGram;
                totalGrams += grams;
                totalKcal += kcal;
                state[n.key] = input.value;

                const row = rows.querySelector(`tr[data-nutrient="${n.key}"]`);
                row.querySelector('.tools-kcal').textContent = formatNumber(Math.round(kcal), 0);
                row.querySelector('.tools-gkg').textContent = weightKg > 0 ? formatNumber(grams / weightKg, 2) : '—';
            });

            document.getElementById('tools-total-grams').textContent = formatNumber(round1(totalGrams), 1);
            document.getElementById('tools-total-kcal').textContent = formatNumber(Math.round(totalKcal), 0);
            document.getElementById('tools-kcal-per-kg').textContent = weightKg > 0
                ? `${formatNumber(totalKcal / weightKg, 1)} kcal/kg`
                : '—';

            localStorage.setItem(storageKey, JSON.stringify(state));
        };

        form.addEventListener('input', recalculate);
        form.addEventListener('submit', e => e.preventDefault());
        document.getElementById('tools-clear')?.addEventListener('click', () => {
            this.toolsCalorieNutrients.forEach(n => { form.elements[n.key].value = ''; });
            recalculate();
        });

        recalculate();

        if (!saved.weightKg) {
            try {
                const latest = await API.getLatestMetrics();
                if (latest?.weightKg != null && !weightInput.value && document.body.contains(weightInput)) {
                    weightInput.value = latest.weightKg;
                    recalculate();
                }
            } catch (e) { /* no metrics yet */ }
        }
    }
});
