class App {
    constructor() {
        this.currentPage = 'dashboard';
        this.currentMealType = null;
        this.mealItems = [];
        this.charts = {};
        this.photoResults = null;
        this.photoItems = [];
        this.isReloading = false;
        this.pageRoutes = {
            dashboard: '/',
            'log-meal': '/today',
            drinks: '/drinks',
            recipes: '/recipes',
            ingredients: '/ingredients',
            checkin: '/checkin',
            metrics: '/metrics',
            stats: '/stats',
            preferences: '/preferences',
            'photo-results': '/photo-results'
        };
        this.historyNavigationReady = false;
    }

    t(key, params = {}) {
        return window.i18n?.t(key, params) || key;
    }

    applyTranslations(root = document) {
        window.applyTranslations?.(root);
    }

    registerServiceWorker() {
        if (!('serviceWorker' in navigator)) return;

        navigator.serviceWorker.register('/service-worker.js')
            .then(registration => {
                document.addEventListener('visibilitychange', () => {
                    if (!document.hidden) registration.update();
                });

                registration.addEventListener('updatefound', () => {
                    const newWorker = registration.installing;
                    newWorker.addEventListener('statechange', () => {
                        if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                            this.showUpdateNotification();
                        }
                    });
                });
            })
            .catch(err => console.log('SW registration failed:', err));

        navigator.serviceWorker.addEventListener('controllerchange', () => {
            if (!this.isReloading) {
                this.isReloading = true;
                window.location.reload();
            }
        });
    }

    showUpdateNotification() {
        const existing = document.getElementById('app-update-overlay');
        if (existing) existing.remove();

        const overlay = document.createElement('div');
        overlay.id = 'app-update-overlay';
        overlay.style.cssText = 'position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0, 0, 0, 0.85); z-index: 99999; display: flex; align-items: center; justify-content: center; animation: fadeIn 0.3s ease-out;';

        overlay.innerHTML = '<div style="background: var(--bg-primary, white); border-radius: 16px; padding: 40px; max-width: 500px; margin: 20px; text-align: center; box-shadow: 0 20px 60px rgba(0,0,0,0.3); animation: scaleIn 0.3s ease-out;">'
            + '<div style="width: 80px; height: 80px; margin: 0 auto 24px; background: linear-gradient(135deg, #2d7a4f 0%, #1a5c3a 100%); border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 40px;">🎉</div>'
            + '<h2 style="margin: 0 0 16px; font-size: 24px; color: var(--text-primary, #1a1a1a); font-weight: 700;">Update Available</h2>'
            + '<p style="margin: 0 0 32px; font-size: 16px; color: var(--text-secondary, #666); line-height: 1.6;">A new version of Health Logger is available with improvements and fixes. Please update now to continue using the app.</p>'
            + '<button id="update-app-btn" style="background: linear-gradient(135deg, #2d7a4f 0%, #1a5c3a 100%); color: white; border: none; padding: 16px 48px; border-radius: 28px; font-weight: 600; cursor: pointer; font-size: 16px; transition: all 0.2s; box-shadow: 0 4px 16px rgba(45, 122, 79, 0.4); width: 100%; max-width: 300px;">Update Now</button>'
            + '<p style="margin: 20px 0 0; font-size: 13px; color: var(--text-secondary, #999);">This update is required to continue</p>'
            + '</div>';

        if (!document.getElementById('update-modal-styles')) {
            const style = document.createElement('style');
            style.id = 'update-modal-styles';
            style.textContent = '@keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } } @keyframes scaleIn { from { transform: scale(0.9); opacity: 0; } to { transform: scale(1); opacity: 1; } }';
            document.head.appendChild(style);
        }

        document.body.appendChild(overlay);

        document.getElementById('update-app-btn').addEventListener('click', async () => {
            const registration = await navigator.serviceWorker.getRegistration();
            if (registration && registration.waiting) {
                registration.waiting.postMessage({ action: 'skipWaiting' });
            }
            await new Promise(resolve => setTimeout(resolve, 100));
            window.location.reload(true);
        });
    }

    async loadUserPreferences() {
        try {
            const prefs = await API.getPreferences();
            if (!prefs) return;

            if (prefs.language && window.i18n) {
                const storedLanguage = localStorage.getItem('HealthLogger_lang');
                const isImplicitServerDefault = !storedLanguage && prefs.language === 'fi' && !prefs.updatedAt;
                if (!isImplicitServerDefault) {
                    await window.i18n.setLang(prefs.language);
                }
            }

            if (prefs.reminderTimes) {
                localStorage.setItem('HealthLogger_reminders', prefs.reminderTimes);
            }
            localStorage.setItem('HealthLogger_notifications', String(prefs.enableNotifications !== false));

            localStorage.setItem('HealthLogger_units', prefs.unitSystem || 'metric');
        } catch (e) { /* new user or preferences unavailable */ }
    }

    async onAuthenticated() {
        await this.loadUserPreferences();
        this.applyTranslations();
        this.init();
        this.startReminderChecker();
    }

    startReminderChecker() {
        clearInterval(this._reminderInterval);
        this.checkReminders();
        this._reminderInterval = setInterval(() => this.checkReminders(), 30000);
    }

    async checkReminders() {
        if (this._checkingReminders) return;
        this._checkingReminders = true;
        try {
            if (localStorage.getItem('HealthLogger_notifications') !== 'true') return;
            const reminders = JSON.parse(localStorage.getItem('HealthLogger_reminders') || '[]');
            if (reminders.length === 0) return;

            const now = new Date();
            const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
            const dueReminders = reminders.filter(time => time <= currentTime).sort();
            if (dueReminders.length === 0) return;

            const today = now.toISOString().split('T')[0];
            const notificationKey = `HealthLogger_reminder_shown_${today}`;
            const shownReminders = JSON.parse(localStorage.getItem(notificationKey) || '[]');
            const unshownReminders = dueReminders.filter(time => !shownReminders.includes(time));
            if (unshownReminders.length === 0) return;

            try {
                await API.getCheckin(today);
                return;
            } catch (error) {
                if (error.status !== 404) return;
            }

            localStorage.setItem(notificationKey, JSON.stringify([...shownReminders, ...unshownReminders]));
            const message = this.t('reminder_checkin');
            this.showToast(message, 'info');

            if ('Notification' in window && Notification.permission === 'granted' && 'serviceWorker' in navigator) {
                const registration = await navigator.serviceWorker.ready;
                await registration.showNotification(this.t('notification_title'), {
                    body: message,
                    icon: '/images/android-chrome-192x192.png',
                    badge: '/images/android-chrome-192x192.png',
                    tag: `daily-checkin-${today}`,
                    data: { url: '/checkin' }
                });
            }
        } catch (e) { /* reminders are best effort */ }
        finally { this._checkingReminders = false; }
    }

    async start() {
        this.registerServiceWorker();

        const storedTheme = localStorage.getItem('HealthLogger_theme');
        if (storedTheme && storedTheme !== 'auto') {
            document.documentElement.setAttribute('data-theme', storedTheme);
        }

        if (window.i18n) {
            await window.i18n.load();
            this.applyTranslations();
        }

        const authenticated = await window.authManager.init();
        if (authenticated) {
            await this.onAuthenticated();
        }
    }

    init() {
        document.getElementById('welcome-dialog').style.display = 'none';
        document.getElementById('app-header').style.display = 'flex';
        document.getElementById('content').style.display = 'block';

        this.setupHamburgerNav();
        this.setupNavigation();
        this.setupHistoryNavigation();
        this.setupEscapeHandler();
        this.navigate(this.getPageFromPath(window.location.pathname), { history: 'replace' });
    }

    setupEscapeHandler() {
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                const camera = document.querySelector('.camera-overlay');
                if (camera) {
                    camera.querySelector('#camera-cancel')?.click();
                    return;
                }
                const updateOverlay = document.getElementById('app-update-overlay');
                if (updateOverlay) return;
            }
        });
    }

    setupHamburgerNav() {
        const navToggle = document.getElementById('nav-toggle');
        const leftNav = document.getElementById('left-nav');
        const overlay = document.getElementById('nav-overlay');
        const title = document.getElementById('app-title');
        const appContainer = document.querySelector('.app-container');

        const toggleNav = () => {
            const isCollapsed = leftNav?.classList.toggle('collapsed');
            overlay?.classList.toggle('visible', !isCollapsed);
            appContainer?.classList.toggle('nav-collapsed', !!isCollapsed);
        };

        const closeNav = () => {
            leftNav?.classList.add('collapsed');
            overlay?.classList.remove('visible');
            appContainer?.classList.add('nav-collapsed');
        };

        navToggle?.addEventListener('click', toggleNav);
        overlay?.addEventListener('click', closeNav);
        title?.addEventListener('click', () => {
            this.navigate('dashboard');
            if (window.innerWidth < 768) {
                closeNav();
            }
        });

        if (window.innerWidth >= 768) {
            leftNav?.classList.remove('collapsed');
            appContainer?.classList.remove('nav-collapsed');
        } else {
            closeNav();
        }

        window.addEventListener('resize', () => {
            if (window.innerWidth >= 768) {
                overlay?.classList.remove('visible');
            } else if (!leftNav?.classList.contains('collapsed')) {
                overlay?.classList.add('visible');
            }
        });
    }

    setupNavigation() {
        document.querySelectorAll('.nav-item').forEach(item => {
            item.addEventListener('click', () => {
                const page = item.dataset.page;
                this.navigate(page);
                if (window.innerWidth < 768) {
                    document.getElementById('left-nav')?.classList.add('collapsed');
                    document.getElementById('nav-overlay')?.classList.remove('visible');
                    document.querySelector('.app-container')?.classList.add('nav-collapsed');
                }
            });
        });
    }

    getPageFromPath(pathname) {
        const normalizedPath = pathname.length > 1 ? pathname.replace(/\/$/, '') : pathname;
        return Object.entries(this.pageRoutes).find(([, route]) => route === normalizedPath)?.[0] || 'dashboard';
    }

    setupHistoryNavigation() {
        if (this.historyNavigationReady) return;
        window.addEventListener('popstate', () => {
            this.navigate(this.getPageFromPath(window.location.pathname), { history: 'none' });
        });
        this.historyNavigationReady = true;
    }

    navigate(page, options = {}) {
        if (!this.pageRoutes[page]) page = 'dashboard';

        const historyMode = options.history || 'push';
        const route = this.pageRoutes[page];
        if (historyMode === 'replace') {
            window.history.replaceState({ page }, '', route);
        } else if (historyMode === 'push' && window.location.pathname !== route) {
            window.history.pushState({ page }, '', route);
        }

        this.currentPage = page;
        document.querySelectorAll('.nav-item').forEach(item => {
            item.classList.toggle('active', item.dataset.page === page);
        });

        const template = document.getElementById(`tmpl-${page}`);
        if (template) {
            const content = document.getElementById('content');
            content.innerHTML = '';
            content.appendChild(template.content.cloneNode(true));
            this.applyTranslations(content);
            this.setupPage(page);
        }
    }

    async setupPage(page) {
        switch (page) {
            case 'dashboard': await this.setupDashboard(); break;
            case 'log-meal': await this.setupLogMeal(); break;
            case 'drinks': await this.setupDrinks(); break;
            case 'recipes': await this.setupRecipes(); break;
            case 'ingredients': await this.setupIngredients(); break;
            case 'checkin': await this.setupCheckin(); break;
            case 'metrics': await this.setupMetrics(); break;
            case 'stats': await this.setupStats(); break;
            case 'preferences': await this.setupPreferences(); break;
            case 'photo-results': await this.setupPhotoResults(); break;
        }
    }
}

window.app = new App();
document.addEventListener('DOMContentLoaded', () => window.app.start());