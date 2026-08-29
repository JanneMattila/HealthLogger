const OfflineDB = {
    DB_NAME: 'HealthLoggerDB',
    DB_VERSION: 1,
    db: null,

    async open() {
        if (this.db) return this.db;
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.DB_NAME, this.DB_VERSION);
            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                if (!db.objectStoreNames.contains('pendingEntries')) {
                    db.createObjectStore('pendingEntries', { keyPath: 'id', autoIncrement: true });
                }
                if (!db.objectStoreNames.contains('pendingCheckins')) {
                    db.createObjectStore('pendingCheckins', { keyPath: 'id', autoIncrement: true });
                }
                if (!db.objectStoreNames.contains('pendingMetrics')) {
                    db.createObjectStore('pendingMetrics', { keyPath: 'id', autoIncrement: true });
                }
                if (!db.objectStoreNames.contains('cachedFoods')) {
                    db.createObjectStore('cachedFoods', { keyPath: 'foodId' });
                }
            };
            request.onsuccess = (event) => {
                this.db = event.target.result;
                resolve(this.db);
            };
            request.onerror = () => reject(request.error);
        });
    },

    async savePending(storeName, data) {
        const db = await this.open();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(storeName, 'readwrite');
            const store = tx.objectStore(storeName);
            const record = { ...data, timestamp: Date.now() };
            const request = store.add(record);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    },

    async getPending(storeName) {
        const db = await this.open();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(storeName, 'readonly');
            const store = tx.objectStore(storeName);
            const request = store.getAll();
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    },

    async clearPending(storeName, id) {
        const db = await this.open();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(storeName, 'readwrite');
            const store = tx.objectStore(storeName);
            const request = store.delete(id);
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    },

    async cacheFoods(foods) {
        const db = await this.open();
        return new Promise((resolve, reject) => {
            const tx = db.transaction('cachedFoods', 'readwrite');
            const store = tx.objectStore('cachedFoods');
            for (const food of foods) {
                store.put(food);
            }
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
        });
    },

    async getCachedFoods() {
        const db = await this.open();
        return new Promise((resolve, reject) => {
            const tx = db.transaction('cachedFoods', 'readonly');
            const store = tx.objectStore('cachedFoods');
            const request = store.getAll();
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    },

    async syncPendingData() {
        if (!navigator.onLine) return { synced: 0, failed: 0 };

        let synced = 0;
        let failed = 0;

        // Sync pending entries
        const entries = await this.getPending('pendingEntries');
        for (const entry of entries) {
            try {
                const { id, timestamp, ...data } = entry;
                await API.createEntry(data);
                await this.clearPending('pendingEntries', id);
                synced++;
            } catch {
                failed++;
            }
        }

        // Sync pending check-ins
        const checkins = await this.getPending('pendingCheckins');
        for (const checkin of checkins) {
            try {
                const { id, timestamp, ...data } = checkin;
                await API.saveCheckin(data);
                await this.clearPending('pendingCheckins', id);
                synced++;
            } catch {
                failed++;
            }
        }

        // Sync pending metrics
        const metrics = await this.getPending('pendingMetrics');
        for (const metric of metrics) {
            try {
                const { id, timestamp, ...data } = metric;
                await API.saveMetric(data);
                await this.clearPending('pendingMetrics', id);
                synced++;
            } catch {
                failed++;
            }
        }

        // Notify service worker to retry queued requests
        if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
            navigator.serviceWorker.controller.postMessage({ type: 'RETRY_PENDING' });
        }

        return { synced, failed };
    }
};

// Auto-sync when coming back online
window.addEventListener('online', async () => {
    try {
        const result = await OfflineDB.syncPendingData();
        if (result.synced > 0 && window.app) {
            window.app.showToast(`${result.synced} offline item(s) synced`);
        }
    } catch (e) {
        console.error('Auto-sync failed:', e);
    }
});

// Initialize DB on load
OfflineDB.open().catch(e => console.error('IndexedDB init failed:', e));
