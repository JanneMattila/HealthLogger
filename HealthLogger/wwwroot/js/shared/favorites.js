// Favorites management for App
Object.assign(App.prototype, {
    getFavorites() {
        try {
            return JSON.parse(localStorage.getItem('HealthLogger_favorites') || '[]');
        } catch { return []; }
    },

    saveFavorites(favs) {
        localStorage.setItem('HealthLogger_favorites', JSON.stringify(favs));
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
                carbs: item.carbs || 0
            });
        }
        this.saveFavorites(favs);
        return existing < 0;
    }
});
