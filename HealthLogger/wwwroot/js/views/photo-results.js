// Photo Results view + camera/file handling
Object.assign(App.prototype, {
    showPhotoSourceDialog() {
        const overlay = document.createElement('div');
        overlay.className = 'portion-dialog';
        overlay.innerHTML = `
            <div class="portion-content">
                <h3>${this.t('photo_source_title')}</h3>
                <div class="photo-source-buttons">
                    <button class="btn btn-primary photo-source-btn" id="btn-photo-camera">${this.t('photo_source_camera')}</button>
                    <button class="btn btn-secondary photo-source-btn" id="btn-photo-file">${this.t('photo_source_file')}</button>
                </div>
                <div class="portion-buttons" style="margin-top: 0.5rem;">
                    <button class="btn btn-secondary" id="btn-photo-source-cancel">${this.t('btn_cancel')}</button>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);
        this.dismissOverlayOnClickOutside(overlay);
        overlay.querySelector('#btn-photo-source-cancel').onclick = () => overlay.remove();
        overlay.querySelector('#btn-photo-camera').onclick = () => {
            overlay.remove();
            this._openCamera();
        };
        overlay.querySelector('#btn-photo-file').onclick = () => {
            overlay.remove();
            this._openPhotoFile();
        };
    },

    _openPhotoFile() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/jpeg,image/png,image/webp';
        input.onchange = (e) => {
            const file = e.target.files[0];
            if (!file) return;

            if (file.size > 10 * 1024 * 1024) {
                this.showToast(this.t('error_image_too_large'), 'error');
                return;
            }

            this._pendingPhotoFile = file;
            this.navigate('photo-results');
        };
        input.click();
    },

    async _openCamera() {
        let stream;
        try {
            stream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } }
            });
        } catch (err) {
            this.showToast(this.t('camera_not_available'), 'error');
            return;
        }

        const overlay = document.createElement('div');
        overlay.className = 'camera-overlay';
        overlay.innerHTML = `
            <video id="camera-video" autoplay playsinline></video>
            <div class="camera-controls">
                <button class="btn btn-secondary camera-ctrl-btn" id="camera-cancel">${this.t('btn_cancel')}</button>
                <button class="btn btn-primary camera-shutter" id="camera-shutter">📸</button>
                <div style="width:48px"></div>
            </div>
        `;
        document.body.appendChild(overlay);

        const video = overlay.querySelector('#camera-video');
        video.srcObject = stream;

        const stopCamera = () => {
            stream.getTracks().forEach(t => t.stop());
            overlay.remove();
        };

        overlay.querySelector('#camera-cancel').onclick = stopCamera;

        overlay.querySelector('#camera-shutter').onclick = () => {
            const canvas = document.createElement('canvas');
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            canvas.getContext('2d').drawImage(video, 0, 0);
            stopCamera();

            canvas.toBlob((blob) => {
                if (!blob) return;
                const file = new File([blob], `photo-${Date.now()}.jpg`, { type: 'image/jpeg' });
                this._pendingPhotoFile = file;
                this.navigate('photo-results');
            }, 'image/jpeg', 0.85);
        };
    },

    async setupPhotoResults() {
        const file = this._pendingPhotoFile;
        if (!file) {
            this.navigate('log-meal');
            return;
        }

        const preview = document.getElementById('photo-preview');
        const loading = document.getElementById('photo-loading');
        const errorDiv = document.getElementById('photo-error');
        const itemsList = document.getElementById('photo-items-list');
        const actionsDiv = document.getElementById('photo-actions');

        if (preview) {
            preview.src = URL.createObjectURL(file);
        }

        if (loading) loading.style.display = 'block';

        let photoMealType = this.getEstimatedMealType();
        const consumptionTimeInput = document.getElementById('photo-consumption-time');
        if (consumptionTimeInput) consumptionTimeInput.value = this.getCurrentTimeValue();
        document.querySelectorAll('#photo-meal-type-selector .meal-type').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('#photo-meal-type-selector .meal-type').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                photoMealType = btn.dataset.meal;
            });
        });
        const estimatedMealButton = document.querySelector(`#photo-meal-type-selector [data-meal="${photoMealType}"]`);
        if (estimatedMealButton) {
            document.querySelectorAll('#photo-meal-type-selector .meal-type').forEach(b => b.classList.remove('active'));
            estimatedMealButton.classList.add('active');
        }

        try {
            const result = await API.analyzePhoto(file);
            this.photoResults = result;

            if (loading) loading.style.display = 'none';

            if (result.errorMessage && (!result.identifiedItems || result.identifiedItems.length === 0)) {
                if (errorDiv) {
                    errorDiv.textContent = result.errorMessage;
                    errorDiv.style.display = 'block';
                }
                if (actionsDiv) actionsDiv.style.display = 'flex';
                return;
            }

            this.photoItems = (result.identifiedItems || []).map((item, idx) => ({
                index: idx,
                included: true,
                nameFi: item.nameFi || '',
                nameEn: item.nameEn || '',
                portion: item.estimatedPortionGrams || 100,
                estimatedCalories: item.estimatedCalories || 0,
                matchedFoodItemId: item.matchedFoodItemId || null,
                matchedFoodName: item.matchedFoodName || null,
                matchConfidence: item.matchConfidence || 0,
                fineliKcal: item.fineliEnergyKcalPer100g || null,
                fineliProtein: item.fineliProteinPer100g || null,
                fineliCarbs: item.fineliCarbsPer100g || null,
                fineliFat: item.fineliFatPer100g || null,
            }));

            this.renderPhotoItems();
            if (itemsList) itemsList.style.display = 'block';
            if (actionsDiv) actionsDiv.style.display = 'flex';
        } catch (e) {
            if (loading) loading.style.display = 'none';
            if (errorDiv) {
                errorDiv.textContent = `${this.t('analysis_failed')} ${e.message || ''}`.trim();
                errorDiv.style.display = 'block';
            }
            if (actionsDiv) actionsDiv.style.display = 'flex';
        }

        document.getElementById('btn-save-photo-meal')?.addEventListener('click', async () => {
            const included = this.photoItems.filter(i => i.included);
            if (included.length === 0) {
                this.showToast(this.t('select_at_least_one_food'), 'error');
                return;
            }
            try {
                const today = new Date().toISOString().split('T')[0];
                const entry = await API.createEntry({
                    entryDate: today,
                    mealType: photoMealType,
                    consumptionTime: this.toApiConsumptionTime(consumptionTimeInput?.value || this.getCurrentTimeValue())
                });
                for (const item of included) {
                    const calories = item.fineliKcal
                        ? item.fineliKcal * item.portion / 100
                        : item.estimatedCalories;
                    const entryItem = {
                        portionGrams: item.portion,
                        customCalories: Math.round(calories)
                    };
                    if (item.matchedFoodItemId) {
                        entryItem.foodItemId = item.matchedFoodItemId;
                        delete entryItem.customCalories;
                    }
                    await API.addEntryItem(entry.id, entryItem);
                }
                if (this.photoResults?.photoId) {
                    try { await fetch(`/api/photos/${this.photoResults.photoId}/confirm/${entry.id}`, { method: 'POST', credentials: 'same-origin' }); } catch (_) {}
                }
                this.showToast(this.t('meal_saved'));
                this._pendingPhotoFile = null;
                this.photoResults = null;
                this.photoItems = [];
                this.navigate('dashboard');
            } catch (e) {
                this.showToast(this.t('toast_save_failed'), 'error');
            }
        });

        document.getElementById('btn-photo-retake')?.addEventListener('click', () => {
            this._pendingPhotoFile = null;
            this.navigate('log-meal');
            setTimeout(() => document.getElementById('btn-camera')?.click(), 300);
        });

        document.getElementById('btn-photo-cancel')?.addEventListener('click', () => {
            this._pendingPhotoFile = null;
            this.navigate('log-meal');
        });
    },

    renderPhotoItems() {
        const container = document.getElementById('photo-items');
        const totalEl = document.getElementById('photo-total-calories');
        if (!container) return;

        container.innerHTML = this.photoItems.map((item, idx) => {
            const confidenceClass = item.matchConfidence >= 0.8 ? 'confidence-high' :
                                    item.matchConfidence >= 0.5 ? 'confidence-medium' :
                                    item.matchConfidence > 0 ? 'confidence-low' : 'confidence-none';
            const confidenceLabel = item.matchConfidence >= 0.8 ? this.t('confidence_good') :
                                    item.matchConfidence >= 0.5 ? this.t('confidence_moderate') :
                                    item.matchConfidence > 0 ? this.t('confidence_weak') : this.t('confidence_no_match');
            const primaryName = this.getLocalizedName(item);
            const secondaryName = this.getSecondaryName(item);
            const calories = item.fineliKcal ? Math.round(item.fineliKcal * item.portion / 100) : Math.round(item.estimatedCalories);
            const fineliInfo = item.fineliKcal
                ? `<div class="photo-item-fineli">
                    <span class="fineli-label">${this.t('fineli_label')}:</span>
                    <span class="fineli-macros">
                        <span>${Math.round(item.fineliKcal)} ${this.t('kcal')}/100g</span>
                        <span>P ${item.fineliProtein?.toFixed(1) || '?'} g</span>
                        <span>C ${item.fineliCarbs?.toFixed(1) || '?'} g</span>
                        <span>F ${item.fineliFat?.toFixed(1) || '?'} g</span>
                    </span>
                   </div>` : '';

            return `
                <div class="photo-item-card ${item.included ? '' : 'excluded'}" data-idx="${idx}">
                    <div class="photo-item-card-header">
                        <div class="photo-item-info">
                            <div class="photo-item-name">${primaryName}</div>
                            <div class="photo-item-name-en">${secondaryName}</div>
                        </div>
                        <span class="confidence-badge ${confidenceClass}">${confidenceLabel}</span>
                        <div class="photo-item-actions">
                            <button class="btn-search-match" data-idx="${idx}" title="${this.t('change_match')}">🔍</button>
                            <button class="remove-item" data-idx="${idx}" title="${item.included ? this.t('remove') : this.t('restore')}">
                                ${item.included ? '✕' : '↩'}
                            </button>
                        </div>
                    </div>
                    <div class="photo-item-details">
                        <div class="photo-item-portion">
                            <label>${this.t('portion')}:</label>
                            <input type="number" value="${item.portion}" min="1" step="5" data-idx="${idx}" class="portion-input" />
                            <span>g</span>
                        </div>
                        <div class="photo-item-cal">${this.formatCalories(calories)}</div>
                    </div>
                    ${item.matchedFoodName ? `<div class="photo-item-fineli"><span class="fineli-label">→ ${item.matchedFoodName}</span></div>` : ''}
                    ${fineliInfo}
                    <div class="photo-inline-search" id="inline-search-${idx}" style="display:none;">
                        <input type="text" placeholder="${this.t('search_fineli_placeholder')}" class="inline-search-input" data-idx="${idx}" />
                        <div class="inline-results" id="inline-results-${idx}"></div>
                    </div>
                </div>`;
        }).join('');

        const totalCal = this.photoItems.filter(i => i.included).reduce((sum, item) => {
            return sum + (item.fineliKcal ? item.fineliKcal * item.portion / 100 : item.estimatedCalories);
        }, 0);
        if (totalEl) totalEl.textContent = this.formatTotalCalories(totalCal);

        container.querySelectorAll('.portion-input').forEach(input => {
            input.addEventListener('change', (e) => {
                const idx = parseInt(e.target.dataset.idx);
                this.photoItems[idx].portion = parseFloat(e.target.value) || 100;
                this.renderPhotoItems();
            });
        });

        container.querySelectorAll('.remove-item').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const idx = parseInt(e.target.closest('[data-idx]').dataset.idx);
                this.photoItems[idx].included = !this.photoItems[idx].included;
                this.renderPhotoItems();
            });
        });

        container.querySelectorAll('.btn-search-match').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const idx = parseInt(e.target.closest('[data-idx]').dataset.idx);
                const searchDiv = document.getElementById(`inline-search-${idx}`);
                if (searchDiv) {
                    searchDiv.style.display = searchDiv.style.display === 'none' ? 'block' : 'none';
                    if (searchDiv.style.display === 'block') {
                        const input = searchDiv.querySelector('.inline-search-input');
                        if (input) {
                            input.value = this.getLocalizedName(this.photoItems[idx]);
                            input.focus();
                            this.doInlineSearch(idx, input.value);
                        }
                    }
                }
            });
        });

        container.querySelectorAll('.inline-search-input').forEach(input => {
            let timeout;
            input.addEventListener('input', () => {
                clearTimeout(timeout);
                timeout = setTimeout(() => {
                    const idx = parseInt(input.dataset.idx);
                    this.doInlineSearch(idx, input.value.trim());
                }, 300);
            });
        });
    },

    async doInlineSearch(idx, query) {
        const resultsDiv = document.getElementById(`inline-results-${idx}`);
        if (!resultsDiv || query.length < 2) {
            if (resultsDiv) resultsDiv.innerHTML = '';
            return;
        }

        try {
            const results = await this.searchFoods(query);
            resultsDiv.innerHTML = results.slice(0, 8).map(f => {
                const primaryName = this.getLocalizedName(f);
                return `
                    <div class="inline-result" data-id="${f.id}" data-name="${primaryName}"
                         data-kcal="${f.energyKcal}" data-protein="${f.protein}" data-fat="${f.fat}" data-carbs="${f.carbohydrate}">
                        <span>${primaryName}</span>
                        <span>${Math.round(f.energyKcal)} ${this.t('kcal')}/100g</span>
                    </div>
                `;
            }).join('');

            resultsDiv.querySelectorAll('.inline-result').forEach(el => {
                el.addEventListener('click', () => {
                    this.photoItems[idx].matchedFoodItemId = el.dataset.id;
                    this.photoItems[idx].matchedFoodName = el.dataset.name;
                    this.photoItems[idx].fineliKcal = parseFloat(el.dataset.kcal) || null;
                    this.photoItems[idx].fineliProtein = parseFloat(el.dataset.protein) || null;
                    this.photoItems[idx].fineliCarbs = parseFloat(el.dataset.carbs) || null;
                    this.photoItems[idx].fineliFat = parseFloat(el.dataset.fat) || null;
                    this.photoItems[idx].matchConfidence = 1.0;
                    this.renderPhotoItems();
                });
            });
        } catch (e) {
            resultsDiv.innerHTML = '';
        }
    }
});
