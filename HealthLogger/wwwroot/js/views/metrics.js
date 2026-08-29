// Metrics view
Object.assign(App.prototype, {
    async setupMetrics() {
        const formatDate = (dateStr) => {
            if (!dateStr) return '';
            const d = new Date(dateStr);
            return d.toLocaleDateString(window.i18n?.lang || 'en', { year: 'numeric', month: 'short', day: 'numeric' });
        };

        try {
            const latest = await API.getLatestMetrics();
            if (latest) {
                const form = document.getElementById('metrics-form');
                const weightDate = formatDate(latest.weightMeasurementDate);
                const waistDate = formatDate(latest.waistMeasurementDate);
                const bpDate = formatDate([
                    latest.systolicBPMeasurementDate,
                    latest.diastolicBPMeasurementDate
                ].filter(Boolean).sort().at(-1));

                if (form) {
                    if (latest.weightKg != null) {
                        form.weightKg.value = latest.weightKg;
                        form.weightKg.title = `${this.t('previous_value')}: ${this.formatWeight(latest.weightKg)}`;
                    }
                    if (latest.waistCircumferenceCm != null) {
                        form.waistCircumferenceCm.value = latest.waistCircumferenceCm;
                        form.waistCircumferenceCm.title = `${this.t('previous_value')}: ${this.formatWaist(latest.waistCircumferenceCm)}`;
                    }
                    if (latest.systolicBP != null) {
                        form.systolicBP.value = latest.systolicBP;
                        form.systolicBP.title = `${this.t('previous_value')}: ${latest.systolicBP}`;
                    }
                    if (latest.diastolicBP != null) {
                        form.diastolicBP.value = latest.diastolicBP;
                        form.diastolicBP.title = `${this.t('previous_value')}: ${latest.diastolicBP}`;
                    }
                }

                const hintWeight = document.getElementById('hint-weight');
                const hintWaist = document.getElementById('hint-waist');
                const hintBp = document.getElementById('hint-bp');

                if (hintWeight && latest.weightKg != null) {
                    hintWeight.textContent = `${this.t('last_updated')}: ${weightDate} — ${this.formatWeight(latest.weightKg)}`;
                }
                if (hintWaist && latest.waistCircumferenceCm != null) {
                    hintWaist.textContent = `${this.t('last_updated')}: ${waistDate} — ${this.formatWaist(latest.waistCircumferenceCm)}`;
                }
                if (hintBp && (latest.systolicBP != null || latest.diastolicBP != null)) {
                    hintBp.textContent = `${this.t('last_updated')}: ${bpDate} — ${latest.systolicBP ?? '—'}/${latest.diastolicBP ?? '—'}`;
                }

                const container = document.getElementById('latest-metrics');
                if (container) {
                    container.innerHTML = `
                        ${latest.weightKg != null ? `<div><div class="metric-value">${this.formatWeight(latest.weightKg)}</div><div class="metric-label">${this.t('metric_weight')}</div></div>` : ''}
                        ${latest.waistCircumferenceCm != null ? `<div><div class="metric-value">${this.formatWaist(latest.waistCircumferenceCm)}</div><div class="metric-label">${this.t('metric_waist')}</div></div>` : ''}
                        ${latest.systolicBP != null || latest.diastolicBP != null ? `<div><div class="metric-value">${latest.systolicBP ?? '—'}/${latest.diastolicBP ?? '—'}</div><div class="metric-label">${this.t('metric_bp')}</div></div>` : ''}
                    `;
                }
            }
        } catch (e) { /* no metrics yet */ }

        document.getElementById('metrics-form')?.addEventListener('submit', async (e) => {
            e.preventDefault();
            const form = e.target;
            const today = new Date().toISOString().split('T')[0];
            const metric = {
                measurementDate: today,
                weightKg: parseFloat(form.weightKg?.value) || null,
                waistCircumferenceCm: parseFloat(form.waistCircumferenceCm?.value) || null,
                systolicBP: parseInt(form.systolicBP?.value) || null,
                diastolicBP: parseInt(form.diastolicBP?.value) || null,
                notes: form.notes?.value || null
            };
            try {
                await API.saveMetric(metric);
                this.showToast(this.t('toast_saved'));
                this.navigate('dashboard');
            } catch (e) {
                this.showToast(this.t('toast_save_failed'), 'error');
            }
        });

        try {
            const to = new Date().toISOString().split('T')[0];
            const from = new Date(Date.now() - 90 * 86400000).toISOString().split('T')[0];
            const metrics = await API.getMetrics(from, to);

            if (metrics.length > 0) {
                const weightData = metrics.filter(m => m.weightKg);
                const waistData = metrics.filter(m => m.waistCircumferenceCm);

                if (weightData.length > 0) {
                    this.destroyChart('chart-weight');
                    const weightValues = this.isImperial() ? weightData.map(m => Math.round(m.weightKg * 2.20462 * 10) / 10) : weightData.map(m => m.weightKg);
                    this.charts['chart-weight'] = new Chart(document.getElementById('chart-weight'), {
                        type: 'line',
                        data: {
                            labels: weightData.map(m => m.measurementDate),
                            datasets: [{ label: this.t('chart_weight'), data: weightValues, borderColor: '#2d7a4f', fill: false, tension: 0.3 }]
                        },
                        options: { responsive: true, plugins: { legend: { display: true } } }
                    });
                }
                if (waistData.length > 0) {
                    this.destroyChart('chart-waist');
                    const waistValues = this.isImperial() ? waistData.map(m => Math.round(m.waistCircumferenceCm / 2.54 * 10) / 10) : waistData.map(m => m.waistCircumferenceCm);
                    this.charts['chart-waist'] = new Chart(document.getElementById('chart-waist'), {
                        type: 'line',
                        data: {
                            labels: waistData.map(m => m.measurementDate),
                            datasets: [{ label: this.t('chart_waist'), data: waistValues, borderColor: '#f59e0b', fill: false, tension: 0.3 }]
                        },
                        options: { responsive: true, plugins: { legend: { display: true } } }
                    });
                }
            }
        } catch (e) { console.error('Metrics load failed:', e); }
    }
});
