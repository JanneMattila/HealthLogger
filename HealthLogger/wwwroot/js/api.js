const API = {
    async request(method, url, data = null) {
        const options = {
            method,
            headers: { 'Content-Type': 'application/json' },
            credentials: 'same-origin'
        };
        if (data) options.body = JSON.stringify(data);
        const response = await fetch(url, options);
        if (response.status === 401) {
            window.authManager?.showLogin();
            throw new Error('Unauthorized');
        }
        if (!response.ok) {
            const error = new Error(`API error: ${response.status}`);
            error.status = response.status;
            throw error;
        }
        if (response.status === 204) return null;
        return response.json();
    },

    // Auth
    authStatus: () => API.request('GET', '/api/auth/status'),
    logout: () => API.request('POST', '/api/auth/logout'),

    // Foods
    searchFoods: (query, lang = 'fi', limit) => {
        let url = `/api/foods?search=${encodeURIComponent(query)}&lang=${lang}`;
        if (limit) url += `&limit=${limit}`;
        return API.request('GET', url);
    },
    searchNutritionOnline: (query) => API.request('GET', `/api/foods/search-online?query=${encodeURIComponent(query)}`),
    browseFoods: (category, lang, limit, offset) => {
        const params = new URLSearchParams();
        if (category) params.set('category', category);
        if (lang) params.set('lang', lang);
        if (limit) params.set('limit', limit);
        if (offset) params.set('offset', offset);
        return API.request('GET', `/api/foods/browse?${params}`);
    },
    getFoodCategories: () => API.request('GET', '/api/foods/categories'),
    getFood: (id) => API.request('GET', `/api/foods/${id}`),
    getFoodByFineliId: (fineliId) => API.request('GET', `/api/foods/fineli/${fineliId}`),
    lookupBarcode: (barcode) => API.request('GET', `/api/foods/barcode/${encodeURIComponent(barcode)}`),
    createFood: (food) => API.request('POST', '/api/foods', food),
    updateFoodWeights: (id, weights) => API.request('PATCH', `/api/foods/${id}/weights`, weights),

    // Entries
    getEntries: (date) => API.request('GET', `/api/entries?date=${date}`),
    createEntry: (entry) => API.request('POST', '/api/entries', entry),
    addEntryItem: (entryId, item) => API.request('POST', `/api/entries/${entryId}/items`, item),
    updateEntryItem: (entryId, itemId, item) => API.request('PUT', `/api/entries/${entryId}/items/${itemId}`, item),
    removeEntryItem: (entryId, itemId) => API.request('DELETE', `/api/entries/${entryId}/items/${itemId}`),
    deleteEntry: (entryId) => API.request('DELETE', `/api/entries/${entryId}`),

    // Recipes
    getRecipes: () => API.request('GET', '/api/recipes'),
    createRecipe: (recipe) => API.request('POST', '/api/recipes', recipe),
    updateRecipe: (recipeId, recipe) => API.request('PUT', `/api/recipes/${recipeId}`, recipe),
    addRecipeToEntry: (entryId, recipeId, opts = {}) => {
        const params = new URLSearchParams();
        if (opts.portionGrams) params.set('portionGrams', opts.portionGrams);
        if (opts.portionMultiplier) params.set('portionMultiplier', opts.portionMultiplier);
        const qs = params.toString();
        return API.request('POST', `/api/recipes/add-to-entry/${entryId}/${recipeId}${qs ? '?' + qs : ''}`);
    },

    // Check-ins
    getCheckin: (date) => API.request('GET', `/api/checkins?date=${date}`),
    saveCheckin: (checkin) => API.request('POST', '/api/checkins', checkin),

    // Metrics
    getMetrics: (from, to) => API.request('GET', `/api/metrics?from=${from}&to=${to}`),
    getLatestMetrics: () => API.request('GET', '/api/metrics/latest'),
    saveMetric: (metric) => API.request('POST', '/api/metrics', metric),

    // Photos
    analyzePhoto: async (file) => {
        const formData = new FormData();
        formData.append('photo', file);
        const response = await fetch('/api/photos/analyze', {
            method: 'POST',
            body: formData,
            credentials: 'same-origin'
        });
        if (!response.ok) throw new Error(`Photo analysis failed: ${response.status}`);
        return response.json();
    },

    // Stats
    getDashboard: () => API.request('GET', '/api/stats/dashboard'),
    getCalorieTrend: (from, to) => API.request('GET', `/api/stats/calories?from=${from}&to=${to}`),
    getWellnessTrend: (from, to) => API.request('GET', `/api/stats/wellness?from=${from}&to=${to}`),
    getMacroDistribution: (from, to) => API.request('GET', `/api/stats/macros?from=${from}&to=${to}`),

    // User
    getPreferences: () => API.request('GET', '/api/user/preferences'),
    savePreferences: (prefs) => API.request('PUT', '/api/user/preferences', prefs),
};
