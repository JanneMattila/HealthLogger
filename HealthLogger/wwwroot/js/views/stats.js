// Stats view
Object.assign(App.prototype, {
    async setupStats() {
        let days = 7;
        const loadStats = async () => {
            const to = new Date().toISOString().split('T')[0];
            const from = new Date(Date.now() - days * 86400000).toISOString().split('T')[0];
            try {
                const [calories, wellness, macros] = await Promise.all([
                    API.getCalorieTrend(from, to),
                    API.getWellnessTrend(from, to),
                    API.getMacroDistribution(from, to)
                ]);

                const summary = document.getElementById('stats-summary');
                if (summary && macros) {
                    const avgSleep = wellness.length > 0
                        ? (wellness.filter(w => w.sleepHours).reduce((s, w) => s + (w.sleepHours || 0), 0) / wellness.filter(w => w.sleepHours).length) || 0
                        : 0;
                    const avgMood = wellness.length > 0
                        ? (wellness.filter(w => w.moodRating).reduce((s, w) => s + (w.moodRating || 0), 0) / wellness.filter(w => w.moodRating).length) || 0
                        : 0;
                    summary.innerHTML = `
                        <div class="stat-card"><div class="stat-value">${Math.round(macros.avgDailyCalories)}</div><div class="stat-label">${this.t('avg_kcal_per_day')}</div></div>
                        <div class="stat-card"><div class="stat-value">${macros.avgDailyProtein} g</div><div class="stat-label">${this.t('avg_protein_per_day')}</div></div>
                        <div class="stat-card"><div class="stat-value">${avgSleep > 0 ? avgSleep.toFixed(1) : '—'}h</div><div class="stat-label">${this.t('avg_sleep')}</div></div>
                        <div class="stat-card"><div class="stat-value">${avgMood > 0 ? avgMood.toFixed(1) : '—'}/5</div><div class="stat-label">${this.t('avg_mood')}</div></div>
                    `;
                }

                this.destroyChart('chart-calories');
                if (calories.length > 0) {
                    this.charts['chart-calories'] = new Chart(document.getElementById('chart-calories'), {
                        type: 'bar',
                        data: {
                            labels: calories.map(c => c.date),
                            datasets: [{ label: this.t('kcal'), data: calories.map(c => Math.round(c.totalCalories)), backgroundColor: '#2d7a4f88' }]
                        },
                        options: { responsive: true }
                    });
                }

                this.destroyChart('chart-macro-dist');
                if (macros && (macros.proteinPercent > 0 || macros.fatPercent > 0 || macros.carbsPercent > 0)) {
                    this.charts['chart-macro-dist'] = new Chart(document.getElementById('chart-macro-dist'), {
                        type: 'doughnut',
                        data: {
                            labels: [this.t('protein_short'), this.t('fat_short'), this.t('carbs_short')],
                            datasets: [{
                                data: [macros.proteinPercent, macros.fatPercent, macros.carbsPercent],
                                backgroundColor: ['#10b981', '#f59e0b', '#6366f1'],
                                borderWidth: 2,
                                borderColor: 'var(--bg-card)'
                            }]
                        },
                        options: {
                            responsive: true,
                            plugins: {
                                legend: { position: 'bottom' },
                                tooltip: {
                                    callbacks: {
                                        label: (ctx) => `${ctx.label}: ${ctx.parsed}%`
                                    }
                                }
                            }
                        }
                    });
                }

                this.destroyChart('chart-wellness');
                if (wellness.length > 0) {
                    this.charts['chart-wellness'] = new Chart(document.getElementById('chart-wellness'), {
                        type: 'line',
                        data: {
                            labels: wellness.map(w => w.date),
                            datasets: [
                                { label: this.t('chart_mood'), data: wellness.map(w => w.moodRating), borderColor: '#10b981', tension: 0.3 },
                                { label: this.t('chart_energy'), data: wellness.map(w => w.energyLevel), borderColor: '#f59e0b', tension: 0.3 },
                                { label: this.t('chart_sleep'), data: wellness.map(w => w.sleepQuality), borderColor: '#6366f1', tension: 0.3 }
                            ]
                        },
                        options: { responsive: true, scales: { y: { min: 0, max: 5 } } }
                    });
                }

                const insights = document.getElementById('correlation-insights');
                if (insights && wellness.length > 0) {
                    const withSleepAndMood = wellness.filter(w => w.sleepHours != null && w.moodRating != null);
                    let insightHtml = `<h3>${this.t('insights_title')}</h3>`;
                    if (withSleepAndMood.length >= 2) {
                        const goodSleep = withSleepAndMood.filter(w => w.sleepHours >= 7);
                        const poorSleep = withSleepAndMood.filter(w => w.sleepHours < 7);
                        const avgMoodGoodSleep = goodSleep.length > 0
                            ? (goodSleep.reduce((s, w) => s + w.moodRating, 0) / goodSleep.length).toFixed(1) : null;
                        const avgMoodPoorSleep = poorSleep.length > 0
                            ? (poorSleep.reduce((s, w) => s + w.moodRating, 0) / poorSleep.length).toFixed(1) : null;
                        if (avgMoodGoodSleep && avgMoodPoorSleep) {
                            insightHtml += `<div class="insight">${this.t('insight_sleep_comparison', { good: avgMoodGoodSleep, poor: avgMoodPoorSleep })}</div>`;
                        } else if (avgMoodGoodSleep) {
                            insightHtml += `<div class="insight">${this.t('insight_sleep_average', { good: avgMoodGoodSleep })}</div>`;
                        }
                    }
                    if (macros && macros.daysWithData > 0) {
                        insightHtml += `<div class="insight">${this.t('insight_data_period', { days: macros.daysWithData })}</div>`;
                    }
                    insights.innerHTML = insightHtml;
                }
            } catch (e) { console.error('Stats load failed:', e); }
        };

        document.querySelectorAll('.period-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.period-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                days = parseInt(btn.dataset.days);
                loadStats();
            });
        });

        await loadStats();
    }
});
