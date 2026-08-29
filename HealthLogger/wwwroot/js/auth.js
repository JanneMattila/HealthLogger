class AuthManager {
    constructor() {
        this.userId = localStorage.getItem('HealthLogger_userId');
    }

    async init() {
        try {
            const status = await API.authStatus();
            if (status.authenticated) {
                this.userId = status.userId;
                localStorage.setItem('HealthLogger_userId', this.userId);
                return true;
            }
        } catch (e) { /* fall through to login */ }
        this.showLogin();
        return false;
    }

    showLogin() {
        const welcomeDialog = document.getElementById('welcome-dialog');
        welcomeDialog.style.display = 'flex';
        document.getElementById('app-header')?.style.setProperty('display', 'none');
        document.getElementById('left-nav')?.classList.add('collapsed');
        document.getElementById('nav-overlay')?.classList.remove('visible');
        document.querySelector('.app-container')?.classList.add('nav-collapsed');
        document.getElementById('content').style.display = 'none';

        let loginStatus = welcomeDialog.querySelector('.login-status');
        if (!loginStatus) {
            loginStatus = document.createElement('p');
            loginStatus.className = 'login-status error';
            loginStatus.setAttribute('role', 'status');
            loginStatus.setAttribute('aria-live', 'polite');
            welcomeDialog.querySelector('.dialog-buttons').before(loginStatus);
        }
        const query = new URLSearchParams(window.location.search);
        const authError = query.get('authError');
        loginStatus.textContent = authError === 'access_denied'
            ? (window.i18n?.t('auth_access_denied') || 'Access is restricted. Contact the application administrator.')
            : authError === 'login_failed'
                ? (window.i18n?.t('auth_login_failed') || 'Sign-in failed. Please try again or contact the application administrator.')
                : '';
        if (authError) {
            query.delete('authError');
            const cleanUrl = `${window.location.pathname}${query.size ? `?${query}` : ''}${window.location.hash}`;
            window.history.replaceState({}, '', cleanUrl);
        }

        const microsoftButton = document.getElementById('btn-microsoft-login');
        microsoftButton.onclick = async () => {
            microsoftButton.disabled = true;
            loginStatus.textContent = '';
            try {
                const response = await fetch('/api/auth/status', {
                    credentials: 'same-origin',
                    cache: 'no-store',
                    headers: { Accept: 'application/json' }
                });
                if (!response.ok) throw new Error(`API error: ${response.status}`);
                window.location.assign('/api/auth/login');
            } catch (error) {
                microsoftButton.disabled = false;
                loginStatus.textContent = window.i18n?.t('auth_server_unavailable')
                    || 'The server is unavailable. Start the app and try again.';
            }
        };

    }

    async logout() {
        try {
            await API.logout();
        } catch (e) { /* ignore */ }
        localStorage.removeItem('HealthLogger_userId');
        this.userId = null;
        this.showLogin();
    }
}

window.authManager = new AuthManager();
