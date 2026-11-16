// Favorites management for App.
// Favorites are read from localStorage (fast, offline) and synced with the server in the
// background. The server stamps X-Favorites-Version on API responses, so the client only
// downloads the list when another device has changed it.
const FAVORITES_KEY = 'HealthLogger_favorites';
const FAVORITES_VERSION_KEY = 'HealthLogger_favorites_version';
const FAVORITES_DIRTY_KEY = 'HealthLogger_favorites_dirty';
const FAVORITES_USER_KEY = 'HealthLogger_favorites_user';
const FAVORITES_CHECK_INTERVAL_MS = 5 * 60 * 1000;
const FAVORITES_RESUME_CHECK_DELAY_MS = 2000;
const FAVORITES_PUSH_DELAY_MS = 1000;

Object.assign(App.prototype, {
    getFavorites() {
        try {
            return JSON.parse(localStorage.getItem(FAVORITES_KEY) || '[]');
        } catch { return []; }
    },

    saveFavorites(favs) {
        localStorage.setItem(FAVORITES_KEY, JSON.stringify(favs));
        localStorage.setItem(FAVORITES_DIRTY_KEY, '1');
        this.scheduleFavoritesPush();
    },

    getSyncedFavoritesVersion() {
        const value = localStorage.getItem(FAVORITES_VERSION_KEY);
        return value === null || !Number.isFinite(Number(value)) ? null : Number(value);
    },

    startFavoritesSync(userId) {
        const syncedUser = localStorage.getItem(FAVORITES_USER_KEY);
        if (syncedUser && userId && syncedUser !== userId) {
            // Another account used this browser; don't merge its favorites into this account.
            localStorage.removeItem(FAVORITES_KEY);
            localStorage.removeItem(FAVORITES_VERSION_KEY);
            localStorage.removeItem(FAVORITES_DIRTY_KEY);
        }
        if (userId) localStorage.setItem(FAVORITES_USER_KEY, userId);
        this.favoritesSyncEnabled = true;

        if (!this.favoritesSyncListenersReady) {
            this.favoritesSyncListenersReady = true;
            document.addEventListener('visibilitychange', () => {
                if (document.hidden) {
                    if (localStorage.getItem(FAVORITES_DIRTY_KEY)) this.pushFavorites();
                    return;
                }
                // Let the resumed page load first; its API responses usually carry the version.
                clearTimeout(this.favoritesResumeTimer);
                this.favoritesResumeTimer = setTimeout(() => this.checkFavoritesSync(), FAVORITES_RESUME_CHECK_DELAY_MS);
            });
            window.addEventListener('online', () => this.checkFavoritesSync({ force: true }));
        }

        if (this.getSyncedFavoritesVersion() === null) this.pullFavorites();
        else if (localStorage.getItem(FAVORITES_DIRTY_KEY)) this.scheduleFavoritesPush();
    },

    checkFavoritesSync({ force = false } = {}) {
        if (!this.favoritesSyncEnabled || navigator.onLine === false) return;
        if (localStorage.getItem(FAVORITES_DIRTY_KEY)) {
            this.pushFavorites();
            return;
        }
        if (!force && Date.now() - (this.lastFavoritesCheck || 0) < FAVORITES_CHECK_INTERVAL_MS) return;
        this.lastFavoritesCheck = Date.now();
        this.pullFavorites();
    },

    onServerFavoritesVersion(version) {
        if (!this.favoritesSyncEnabled || !Number.isFinite(version)) return;
        this.lastFavoritesCheck = Date.now();
        if (this.favoritesPushPromise || this.favoritesPullPromise) return;
        const known = this.getSyncedFavoritesVersion();
        if (known !== null && version <= known) return;
        if (known !== null && localStorage.getItem(FAVORITES_DIRTY_KEY)) {
            this.scheduleFavoritesPush();
            return;
        }
        this.pullFavorites();
    },

    pullFavorites() {
        if (this.favoritesPullPromise) return this.favoritesPullPromise;
        this.favoritesPullPromise = (async () => {
            try {
                const known = this.getSyncedFavoritesVersion();
                const result = await API.getFavorites(known);
                if (!result) return false;

                const serverFavorites = Array.isArray(result.favorites) ? result.favorites : [];
                const local = this.getFavorites();
                let next = serverFavorites;
                let needsPush = false;
                if (known === null) {
                    // First sync on this device: keep favorites saved before sync existed.
                    const serverIds = new Set(serverFavorites.map(f => f.id));
                    const localOnly = local.filter(f => f && f.id && !serverIds.has(f.id));
                    next = [...serverFavorites, ...localOnly];
                    needsPush = localOnly.length > 0;
                } else if (localStorage.getItem(FAVORITES_DIRTY_KEY)) {
                    // A local change happened while downloading; it wins and is uploaded.
                    localStorage.setItem(FAVORITES_VERSION_KEY, String(result.version));
                    this.scheduleFavoritesPush();
                    return false;
                }

                const changed = JSON.stringify(next) !== JSON.stringify(local);
                localStorage.setItem(FAVORITES_KEY, JSON.stringify(next));
                localStorage.setItem(FAVORITES_VERSION_KEY, String(result.version));
                if (needsPush) {
                    localStorage.setItem(FAVORITES_DIRTY_KEY, '1');
                    this.scheduleFavoritesPush(0);
                }
                if (changed) this.onFavoritesChanged();
                return changed;
            } catch (e) {
                console.warn('Favorites sync failed:', e);
                return false;
            } finally {
                this.favoritesPullPromise = null;
            }
        })();
        return this.favoritesPullPromise;
    },

    scheduleFavoritesPush(delay = FAVORITES_PUSH_DELAY_MS) {
        if (!this.favoritesSyncEnabled) return;
        clearTimeout(this.favoritesPushTimer);
        this.favoritesPushTimer = setTimeout(() => this.pushFavorites(), delay);
    },

    pushFavorites() {
        clearTimeout(this.favoritesPushTimer);
        if (!this.favoritesSyncEnabled) return Promise.resolve();
        if (this.favoritesPushPromise) {
            this.favoritesPushAgain = true;
            return this.favoritesPushPromise;
        }
        if (this.getSyncedFavoritesVersion() === null) {
            // Never synced: download and merge first so another device's favorites aren't overwritten.
            return this.pullFavorites();
        }
        this.favoritesPushPromise = (async () => {
            localStorage.removeItem(FAVORITES_DIRTY_KEY);
            try {
                const result = await API.saveFavorites(this.getFavorites());
                if (result && Number.isFinite(result.version)) {
                    localStorage.setItem(FAVORITES_VERSION_KEY, String(result.version));
                }
            } catch (e) {
                localStorage.setItem(FAVORITES_DIRTY_KEY, '1');
                console.warn('Favorites upload failed:', e);
            } finally {
                this.favoritesPushPromise = null;
                if (this.favoritesPushAgain) {
                    this.favoritesPushAgain = false;
                    if (localStorage.getItem(FAVORITES_DIRTY_KEY)) this.pushFavorites();
                }
            }
        })();
        return this.favoritesPushPromise;
    },

    onFavoritesChanged() {
        if (this.currentPage === 'drinks') {
            this.renderDrinkFavorites();
        } else if (this.currentPage === 'ingredients') {
            const searchInput = document.getElementById('ingredients-search');
            if (searchInput && searchInput.value.trim().length >= 2) {
                searchInput.dispatchEvent(new Event('input'));
            } else {
                document.getElementById('ingredients-list')?.refreshIngredients?.();
            }
        }
    },

    isFavorite(id) {
        return this.getFavorites().some(f => f.id === id);
    },

    async loadFavoriteFoods() {
        const favorites = this.getFavorites().filter(favorite => favorite.type === 'food');
        return Promise.all(favorites.map(async favorite => {
            try {
                return await API.getFood(favorite.id);
            } catch {
                return {
                    id: favorite.id,
                    nameFi: favorite.name,
                    nameEn: favorite.name,
                    energyKcal: favorite.kcalPer100,
                    protein: favorite.protein,
                    fat: favorite.fat,
                    carbohydrate: favorite.carbs
                };
            }
        }));
    },

    sortFavoritesFirst(items) {
        const favoriteIds = new Set(this.getFavorites().map(f => f.id));
        return items
            .map((item, index) => ({ item, index }))
            .sort((a, b) => Number(favoriteIds.has(b.item.id)) - Number(favoriteIds.has(a.item.id)) || a.index - b.index)
            .map(({ item }) => item);
    },

    toggleFavorite(item) {
        let favs = this.getFavorites();
        const existing = favs.findIndex(f => f.id === item.id);
        if (existing >= 0) {
            favs.splice(existing, 1);
        } else {
            favs.push({
                id: item.id,
                name: item.name,
                type: item.type || 'food',
                kcalPer100: item.kcalPer100 || 0,
                protein: item.protein || 0,
                fat: item.fat || 0,
                carbs: item.carbs || 0,
                ...(item.type === 'drink' && item.food ? { food: item.food } : {})
            });
        }
        this.saveFavorites(favs);
        return existing < 0;
    }
});
