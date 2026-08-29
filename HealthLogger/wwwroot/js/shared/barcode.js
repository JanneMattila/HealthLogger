Object.assign(App.prototype, {
    showBarcodeDialog(onAccepted) {
        const overlay = document.createElement('div');
        overlay.className = 'portion-dialog';
        overlay.innerHTML = `
            <div class="portion-content barcode-dialog">
                <h3>${this.t('barcode_title')}</h3>
                <p class="barcode-help">${this.t('barcode_help')}</p>
                <button type="button" class="btn btn-primary barcode-camera-btn">${this.t('barcode_use_camera')}</button>
                <div class="barcode-camera" hidden>
                    <video playsinline muted></video>
                    <p>${this.t('barcode_camera_hint')}</p>
                </div>
                <form class="barcode-lookup-form">
                    <h4>${this.t('barcode_manual_entry')}</h4>
                    <label for="barcode-value">${this.t('barcode_label')}</label>
                    <div class="barcode-entry-row">
                        <input id="barcode-value" inputmode="numeric" autocomplete="off" maxlength="14" required />
                        <button type="submit" class="btn btn-primary">${this.t('barcode_lookup')}</button>
                    </div>
                </form>
                <div class="barcode-status" role="status" aria-live="polite"></div>
                <div class="barcode-review"></div>
            </div>`;
        document.body.appendChild(overlay);

        const input = overlay.querySelector('#barcode-value');
        const lookupForm = overlay.querySelector('.barcode-lookup-form');
        const cameraButton = overlay.querySelector('.barcode-camera-btn');
        const cameraContainer = overlay.querySelector('.barcode-camera');
        const video = cameraContainer.querySelector('video');
        const status = overlay.querySelector('.barcode-status');
        const review = overlay.querySelector('.barcode-review');
        let cameraStream = null;
        let scannerControls = null;

        const stopCamera = () => {
            scannerControls?.stop();
            scannerControls = null;
            cameraStream?.getTracks().forEach(track => track.stop());
            cameraStream = null;
            video.pause();
            video.srcObject = null;
            cameraContainer.hidden = true;
        };

        const close = () => {
            stopCamera();
            overlay.remove();
        };
        this.dismissOverlayOnClickOutside(overlay, close);

        const setStatus = (message, loading = false, error = false) => {
            status.classList.toggle('error', error);
            status.replaceChildren();
            if (loading) {
                const spinner = document.createElement('span');
                spinner.className = 'spinner-small';
                status.append(spinner, ` ${message}`);
            } else {
                status.textContent = message;
            }
        };

        const numberValue = (form, name) => {
            const normalized = form.elements[name].value.trim().replace(/\s/g, '').replace(',', '.');
            const value = Number(normalized);
            return Number.isFinite(value) && value >= 0 ? value : 0;
        };

        const renderReview = async (result) => {
            review.innerHTML = `
                <form class="barcode-review-form">
                    <p class="barcode-result-message"></p>
                    <div class="barcode-name-grid">
                        <div class="nutrition-input"><label>${this.t('barcode_name_fi')}</label><input name="nameFi" /></div>
                        <div class="nutrition-input"><label>${this.t('barcode_name_en')}</label><input name="nameEn" /></div>
                    </div>
                    <div class="nutrition-input">
                        <label for="barcode-category-select">${this.t('barcode_category')}</label>
                        <select id="barcode-category-select" name="category">
                            <option value="">${this.t('all_categories')}</option>
                        </select>
                    </div>
                    <div class="nutrition-input">
                        <label for="barcode-default-portion">${this.t('default_portion_label')}</label>
                        <input id="barcode-default-portion" type="number" inputmode="decimal" name="defaultPortionGrams" value="100" min="0.1" step="0.1" required />
                    </div>
                    <h4>${this.t('per_100g')}</h4>
                    <div class="manual-nutrition-grid">
                        <div class="nutrition-input"><label>kcal</label><input type="text" inputmode="decimal" name="energyKcal" /></div>
                        <div class="nutrition-input"><label>kJ</label><input type="text" inputmode="decimal" name="energyKj" /></div>
                        <div class="nutrition-input"><label>${this.t('protein_short')}</label><input type="text" inputmode="decimal" name="protein" /></div>
                        <div class="nutrition-input"><label>${this.t('fat_short')}</label><input type="text" inputmode="decimal" name="fat" /></div>
                        <div class="nutrition-input"><label>${this.t('saturated_fat')}</label><input type="text" inputmode="decimal" name="saturatedFat" /></div>
                        <div class="nutrition-input"><label>${this.t('carbs_short')}</label><input type="text" inputmode="decimal" name="carbohydrate" /></div>
                        <div class="nutrition-input"><label>${this.t('sugar')}</label><input type="text" inputmode="decimal" name="sugar" /></div>
                        <div class="nutrition-input"><label>${this.t('fiber_short')}</label><input type="text" inputmode="decimal" name="fiber" /></div>
                        <div class="nutrition-input"><label>${this.t('salt')}</label><input type="text" inputmode="decimal" name="salt" /></div>
                    </div>
                    <p class="ingredient-source"></p>
                    <label class="barcode-favorite-option">
                        <input type="checkbox" name="addFavorite" />
                        <span>${this.t('barcode_add_favorite')}</span>
                    </label>
                    <div class="portion-buttons">
                        <button type="button" class="btn btn-secondary barcode-cancel">${this.t('btn_cancel')}</button>
                        <button type="submit" class="btn btn-primary">${this.t('barcode_accept')}</button>
                    </div>
                </form>`;

            const form = review.querySelector('form');
            form.querySelector('.barcode-result-message').textContent = result.existingFoodId
                ? this.t('barcode_existing_found')
                : result.found
                    ? this.t('barcode_found')
                    : this.t('barcode_not_found');
            form.querySelector('.ingredient-source').textContent = result.source
                ? `${this.t('barcode_source')}: ${result.source}`
                : '';

            const values = {
                nameFi: result.nameFi,
                nameEn: result.nameEn,
                category: result.existingFoodId ? result.category : 'Own',
                defaultPortionGrams: result.defaultPortionGrams || 100,
                energyKcal: result.energyKcal,
                energyKj: result.energyKj,
                protein: result.protein,
                fat: result.fat,
                saturatedFat: result.saturatedFat,
                carbohydrate: result.carbohydrate,
                sugar: result.sugar,
                fiber: result.fiber,
                salt: result.salt
            };
            Object.entries(values).filter(([name]) => name !== 'category').forEach(([name, value]) => {
                form.elements[name].value = value ?? '';
            });

            const categorySelect = form.elements.category;
            try {
                let categories = _ingredientsCache.categories;
                if (!categories) {
                    categories = await API.getFoodCategories();
                    _ingredientsCache.categories = categories;
                }
                const resultCategory = values.category?.trim();
                if (resultCategory && !categories.includes(resultCategory)) {
                    categories = [...categories, resultCategory];
                }
                categories.forEach(category => {
                    const option = document.createElement('option');
                    option.value = category;
                    option.textContent = category;
                    categorySelect.appendChild(option);
                });
                categorySelect.value = resultCategory || '';
            } catch {
                if (result.category) {
                    const option = document.createElement('option');
                    option.value = result.category;
                    option.textContent = result.category;
                    categorySelect.appendChild(option);
                    categorySelect.value = result.category;
                }
            }
            this.enhanceSelectWithSearch(categorySelect);

            const addFavoriteIfRequested = food => {
                if (!form.elements.addFavorite.checked || this.isFavorite(food.id)) return;
                this.toggleFavorite({
                    id: food.id,
                    name: this.getLocalizedName(food),
                    type: 'food',
                    kcalPer100: Number(food.energyKcal) || 0,
                    protein: Number(food.protein) || 0,
                    fat: Number(food.fat) || 0,
                    carbs: Number(food.carbohydrate) || 0
                });
            };

            if (result.existingFoodId) {
                form.querySelectorAll('input:not([name="addFavorite"])').forEach(field => { field.disabled = true; });
                categorySelect.disabled = true;
                form.querySelector('.searchable-select-input').disabled = true;
                form.querySelector('.searchable-select-toggle').disabled = true;
                form.querySelector('button[type="submit"]').textContent = this.t('barcode_use_existing');
            }

            form.querySelector('.barcode-cancel').onclick = close;
            form.onsubmit = async event => {
                event.preventDefault();
                if (result.existingFoodId) {
                    const food = { id: result.existingFoodId, ...values };
                    addFavoriteIfRequested(food);
                    close();
                    onAccepted?.(food);
                    return;
                }

                const nameFi = form.elements.nameFi.value.trim();
                const nameEn = form.elements.nameEn.value.trim();
                if (!nameFi && !nameEn) {
                    setStatus(this.t('barcode_name_required'), false, true);
                    return;
                }
                const defaultPortionGrams = numberValue(form, 'defaultPortionGrams');
                if (defaultPortionGrams <= 0) {
                    setStatus(this.t('default_portion_required'), false, true);
                    return;
                }

                const saveButton = form.querySelector('button[type="submit"]');
                saveButton.disabled = true;
                setStatus(this.t('barcode_saving'), true);
                try {
                    const food = await API.createFood({
                        barcode: result.barcode,
                        barcodeSource: result.source,
                        nameFi: nameFi || nameEn,
                        nameEn: nameEn || nameFi,
                        category: form.elements.category.value.trim() || null,
                        defaultPortionGrams,
                        energyKcal: numberValue(form, 'energyKcal'),
                        energyKj: numberValue(form, 'energyKj'),
                        protein: numberValue(form, 'protein'),
                        fat: numberValue(form, 'fat'),
                        saturatedFat: numberValue(form, 'saturatedFat'),
                        carbohydrate: numberValue(form, 'carbohydrate'),
                        sugar: numberValue(form, 'sugar'),
                        fiber: numberValue(form, 'fiber'),
                        salt: numberValue(form, 'salt')
                    });
                    addFavoriteIfRequested(food);
                    close();
                    onAccepted?.(food);
                } catch (error) {
                    saveButton.disabled = false;
                    setStatus(this.t('toast_save_failed'), false, true);
                }
            };
        };

        const lookup = async barcode => {
            stopCamera();
            review.replaceChildren();
            setStatus(this.t('barcode_fetching'), true);
            try {
                const result = await API.lookupBarcode(barcode);
                setStatus('');
                await renderReview(result);
            } catch (error) {
                setStatus(this.t('barcode_fetch_failed'), false, true);
                await renderReview({ found: false, barcode });
            }
        };

        lookupForm.onsubmit = event => {
            event.preventDefault();
            const barcode = input.value.trim();
            if (!/^\d{8,14}$/.test(barcode)) {
                setStatus(this.t('barcode_invalid'), false, true);
                return;
            }
            lookup(barcode);
        };

        const canUseNativeScanner = 'BarcodeDetector' in window;
        const canUseZxingScanner = Boolean(window.ZXingBrowser?.BrowserMultiFormatReader);

        if (!navigator.mediaDevices?.getUserMedia || (!canUseNativeScanner && !canUseZxingScanner)) {
            cameraButton.hidden = true;
            input.focus();
        } else {
            cameraButton.onclick = async () => {
                try {
                    cameraContainer.hidden = false;

                    if (canUseNativeScanner) {
                        const detector = new BarcodeDetector({ formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e'] });
                        cameraStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
                        video.srcObject = cameraStream;
                        await video.play();

                        const detect = async () => {
                            if (!cameraStream || !overlay.isConnected) {
                                stopCamera();
                                return;
                            }
                            try {
                                const codes = await detector.detect(video);
                                if (codes.length > 0) {
                                    input.value = codes[0].rawValue;
                                    lookup(codes[0].rawValue);
                                    return;
                                }
                            } catch (error) { /* wait for the next frame */ }
                            window.setTimeout(detect, 250);
                        };
                        detect();
                        return;
                    }

                    const reader = new ZXingBrowser.BrowserMultiFormatReader();
                    reader.possibleFormats = [
                        ZXingBrowser.BarcodeFormat.EAN_13,
                        ZXingBrowser.BarcodeFormat.EAN_8,
                        ZXingBrowser.BarcodeFormat.UPC_A,
                        ZXingBrowser.BarcodeFormat.UPC_E
                    ];
                    let scanCompleted = false;
                    const controls = await reader.decodeFromConstraints(
                        { video: { facingMode: 'environment' }, audio: false },
                        video,
                        (result, error, activeControls) => {
                            if (!result || scanCompleted) return;
                            const barcode = result.getText();
                            if (!/^\d{8,14}$/.test(barcode)) return;
                            scanCompleted = true;
                            activeControls.stop();
                            input.value = barcode;
                            lookup(barcode);
                        }
                    );
                    if (scanCompleted || !overlay.isConnected) {
                        controls.stop();
                    } else {
                        scannerControls = controls;
                    }
                } catch (error) {
                    stopCamera();
                    setStatus(this.t('camera_not_available'), false, true);
                }
            };
            cameraButton.focus();
        }
    }
});