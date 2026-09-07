class I18n {
    constructor() {
        this.lang = localStorage.getItem('HealthLogger_lang') || 'en';
        this.translations = {};
    }

    async load() {
        try {
            const sw = navigator.serviceWorker?.controller;
            const v = document.querySelector('link[href*="styles.css"]')?.href?.match(/v=([^&]+)/)?.[1] || Date.now();
            const response = await fetch(`/js/locales/${this.lang}.json?v=${v}`);
            this.translations = await response.json();
        } catch (e) {
            console.error('Failed to load translations:', e);
            this.translations = {};
        }

        document.documentElement.lang = this.lang;
    }

    t(key, params = {}) {
        const template = this.translations[key] || key;
        return Object.entries(params).reduce(
            (text, [param, value]) => text.replace(new RegExp(`\\{${param}\\}`, 'g'), value),
            template
        );
    }

    applyToDOM(root = document) {
        const targets = [];
        const isElement = typeof Element !== 'undefined' && root instanceof Element;

        if (isElement && (root.hasAttribute('data-i18n') || root.hasAttribute('data-i18n-placeholder') || root.hasAttribute('data-i18n-title') || root.hasAttribute('data-i18n-aria-label'))) {
            targets.push(root);
        }

        if (typeof root.querySelectorAll === 'function') {
            targets.push(...root.querySelectorAll('[data-i18n], [data-i18n-placeholder], [data-i18n-title], [data-i18n-aria-label]'));
        }

        targets.forEach(element => {
            const textKey = element.getAttribute('data-i18n');
            if (textKey) {
                element.textContent = this.t(textKey);
            }

            const placeholderKey = element.getAttribute('data-i18n-placeholder');
            if (placeholderKey) {
                element.placeholder = this.t(placeholderKey);
            }

            const titleKey = element.getAttribute('data-i18n-title');
            if (titleKey) {
                element.title = this.t(titleKey);
            }

            const ariaLabelKey = element.getAttribute('data-i18n-aria-label');
            if (ariaLabelKey) {
                element.setAttribute('aria-label', this.t(ariaLabelKey));
            }
        });
    }

    async setLang(lang) {
        this.lang = lang || 'en';
        localStorage.setItem('HealthLogger_lang', this.lang);
        await this.load();
    }
}

window.i18n = new I18n();
window.applyTranslations = (root = document) => window.i18n.applyToDOM(root);
