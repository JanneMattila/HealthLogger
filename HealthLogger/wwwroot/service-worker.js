const CACHE_VERSION = '20260829153555';
const CACHE_NAME = `HealthLogger-v${CACHE_VERSION}`;
const STATIC_ASSETS = [
    '/',
    '/index.html',
    `/css/styles.css?v=${CACHE_VERSION}`,
    `/js/api.js?v=${CACHE_VERSION}`,
    `/js/auth.js?v=${CACHE_VERSION}`,
    `/js/db.js?v=${CACHE_VERSION}`,
    `/js/i18n.js?v=${CACHE_VERSION}`,
    `/js/app.js?v=${CACHE_VERSION}`,
    `/js/shared/utils.js?v=${CACHE_VERSION}`,
    `/js/shared/favorites.js?v=${CACHE_VERSION}`,
    '/js/vendor/zxing-browser.min.js',
    `/js/shared/barcode.js?v=${CACHE_VERSION}`,
    `/js/views/dashboard.js?v=${CACHE_VERSION}`,
    `/js/views/log-meal.js?v=${CACHE_VERSION}`,
    `/js/views/recipes.js?v=${CACHE_VERSION}`,
    `/js/views/photo-results.js?v=${CACHE_VERSION}`,
    `/js/views/drinks.js?v=${CACHE_VERSION}`,
    `/js/views/checkin.js?v=${CACHE_VERSION}`,
    `/js/views/metrics.js?v=${CACHE_VERSION}`,
    `/js/views/stats.js?v=${CACHE_VERSION}`,
    `/js/views/preferences.js?v=${CACHE_VERSION}`,
    `/js/views/ingredients.js?v=${CACHE_VERSION}`,
    `/js/locales/en.json?v=${CACHE_VERSION}`,
    `/js/locales/fi.json?v=${CACHE_VERSION}`,
    '/manifest.json'
];

const PENDING_REQUESTS_KEY = 'pending-api-requests';

// Install: cache app shell
self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME).then(cache => Promise.all(
            STATIC_ASSETS.map(async asset => {
                try {
                    const request = new Request(new URL(asset, self.location.origin).href, { cache: 'reload' });
                    const response = await fetch(request);
                    if (response.ok) await cache.put(request, response);
                } catch { /* retry on demand through the fetch handler */ }
            })
        ))
    );
    self.skipWaiting();
});

// Activate: clean old caches, purge cached food API data, and notify clients
self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys()
            .then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))))
            .then(() => caches.open(CACHE_NAME))
            .then(cache => {
                // Purge any cached food API responses so fresh data is fetched
                return cache.keys().then(requests => {
                    return Promise.all(
                        requests
                            .filter(r => new URL(r.url).pathname.startsWith('/api/foods'))
                            .map(r => cache.delete(r))
                    );
                });
            })
            .then(() => self.clients.claim())
            .then(() => {
                return self.clients.matchAll({ type: 'window' }).then(clients => {
                    clients.forEach(client => {
                        client.postMessage({ type: 'SW_UPDATED', version: CACHE_VERSION });
                    });
                });
            })
    );
});

self.addEventListener('notificationclick', event => {
    event.notification.close();
    const targetUrl = new URL(event.notification.data?.url || '/checkin', self.location.origin).href;
    event.waitUntil(
        self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clients => {
            const existingClient = clients.find(client => new URL(client.url).origin === self.location.origin);
            if (existingClient) {
                existingClient.navigate(targetUrl);
                return existingClient.focus();
            }
            return self.clients.openWindow(targetUrl);
        })
    );
});

// Fetch: cache-first for static, network-first for API
self.addEventListener('fetch', event => {
    const url = new URL(event.request.url);

    if (url.pathname.startsWith('/api/')) {
        // Food browse/categories/search are cacheable (data changes only on server restart)
        if (event.request.method === 'GET' && (
            url.pathname.startsWith('/api/foods/browse') ||
            (url.pathname === '/api/foods' && url.searchParams.has('search'))
        )) {
            event.respondWith(handleCacheableApiRequest(event.request));
        } else {
            event.respondWith(handleApiRequest(event.request));
        }
    } else {
        event.respondWith(handleStaticRequest(event.request));
    }
});

// Cache-first for static assets
async function handleStaticRequest(request) {
    const cached = await caches.match(request);
    if (cached) return cached;

    try {
        const response = await fetch(request);
        if (response.ok) {
            const cache = await caches.open(CACHE_NAME);
            cache.put(request, response.clone());
        }
        return response;
    } catch {
        return new Response('Offline', { status: 503, statusText: 'Service Unavailable' });
    }
}

// Stale-while-revalidate for food data endpoints
async function handleCacheableApiRequest(request) {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(request);

    const fetchPromise = fetch(request).then(response => {
        if (response.ok) {
            cache.put(request, response.clone());
        }
        return response;
    }).catch(() => null);

    // Return cached immediately if available, update in background
    if (cached) {
        fetchPromise; // fire-and-forget background refresh
        return cached;
    }

    // No cache — must wait for network
    const response = await fetchPromise;
    if (response) return response;

    return new Response(
        JSON.stringify({ error: 'offline', message: 'Food data not cached' }),
        { status: 503, headers: { 'Content-Type': 'application/json' } }
    );
}

// Network-first for API calls, queue failures for retry
async function handleApiRequest(request) {
    try {
        const response = await fetch(request);
        const url = new URL(request.url);
        if (response.ok && request.method !== 'GET' && url.pathname.startsWith('/api/foods')) {
            const cache = await caches.open(CACHE_NAME);
            const requests = await cache.keys();
            await Promise.all(requests
                .filter(cachedRequest => new URL(cachedRequest.url).pathname.startsWith('/api/foods/browse'))
                .map(cachedRequest => cache.delete(cachedRequest)));
        }
        return response;
    } catch {
        const url = new URL(request.url);
        if (request.mode === 'navigate' && url.pathname === '/api/auth/login') {
            return Response.redirect(new URL('/', request.url), 302);
        }

        // For GET requests, try cache
        if (request.method === 'GET') {
            const cached = await caches.match(request);
            if (cached) return cached;
        }

        // For mutating requests, queue for retry
        if (request.method !== 'GET') {
            await queueRequest(request);
        }

        return new Response(
            JSON.stringify({ error: 'offline', message: 'Request queued for retry' }),
            { status: 503, headers: { 'Content-Type': 'application/json' } }
        );
    }
}

// Queue failed API requests for retry when online
async function queueRequest(request) {
    try {
        const body = await request.clone().text();
        const pending = await getPendingRequests();
        pending.push({
            url: request.url,
            method: request.method,
            headers: Object.fromEntries(request.headers.entries()),
            body: body,
            timestamp: Date.now()
        });

        const cache = await caches.open(CACHE_NAME);
        await cache.put(
            new Request('/_pending-requests'),
            new Response(JSON.stringify(pending))
        );
    } catch (e) {
        console.error('Failed to queue request:', e);
    }
}

async function getPendingRequests() {
    try {
        const cache = await caches.open(CACHE_NAME);
        const response = await cache.match('/_pending-requests');
        if (response) return await response.json();
    } catch { /* empty */ }
    return [];
}

// Retry queued requests when back online
self.addEventListener('message', event => {
    if (event.data?.type === 'RETRY_PENDING') {
        retryPendingRequests();
    }
    if (event.data?.action === 'skipWaiting') {
        self.skipWaiting();
    }
});

async function retryPendingRequests() {
    const pending = await getPendingRequests();
    if (pending.length === 0) return;

    const remaining = [];
    for (const req of pending) {
        try {
            await fetch(req.url, {
                method: req.method,
                headers: req.headers,
                body: req.body || undefined
            });
        } catch {
            remaining.push(req);
        }
    }

    const cache = await caches.open(CACHE_NAME);
    await cache.put(
        new Request('/_pending-requests'),
        new Response(JSON.stringify(remaining))
    );

    // Notify clients
    const clients = await self.clients.matchAll();
    clients.forEach(client => {
        client.postMessage({ type: 'SYNC_COMPLETE', remaining: remaining.length });
    });
}
