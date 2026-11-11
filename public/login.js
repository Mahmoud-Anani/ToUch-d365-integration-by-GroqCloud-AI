(() => {
  'use strict';

  const LS_LANG = 'd365.lang';
  const LS_THEME = 'd365.theme';
  const I18N = {
    en: {
      brand: 'Touch El-Zanouki',
      brand_sub: 'Business intelligence · El-Zenouki Group',
      login_kicker: 'SECURE WORKSPACE',
      login_title: 'Sign in',
      login_body:
        'Use the account provided by your administrator to open the Dynamics 365 business dashboard.',
      username: 'Username',
      username_placeholder: 'e.g. admin',
      password: 'Password',
      password_placeholder: 'Enter your password',
      sign_in: 'Sign in',
      signing_in: 'Signing in…',
      login_note: 'Read-only access. Sessions expire automatically.',
      aside_kicker: 'DYNAMICS 365 · READ ONLY',
      aside_title: 'One clear view of the business',
      aside_body:
        'Customer, product, purchasing, finance and organisation data from the integration map, brought together in one bilingual workspace.',
      aside_point_1: 'Live D365 analysis, no record changes',
      aside_point_2: 'Bilingual English and Arabic interface',
      aside_point_3: 'Private sessions with signed, HttpOnly cookies',
      required: 'Enter your username and password.',
      invalid: 'Invalid username or password.',
      rate_limited: 'Too many sign-in attempts. Please wait and try again.',
      network: 'Unable to reach the server. Check your connection and try again.',
      failed: 'Sign-in failed. Please try again.',
      switch_light: 'Switch to light theme',
      switch_dark: 'Switch to dark theme',
      switch_language: 'Switch language',
    },
    ar: {
      brand: 'Touch El-Zanouki',
      brand_sub: 'ذكاء الأعمال · مجموعة الزنوكي',
      login_kicker: 'مساحة عمل آمنة',
      login_title: 'تسجيل الدخول',
      login_body: 'استخدم الحساب الذي وفره المسؤول لفتح لوحة أعمال Dynamics 365.',
      username: 'اسم المستخدم',
      username_placeholder: 'مثال: admin',
      password: 'كلمة المرور',
      password_placeholder: 'أدخل كلمة المرور',
      sign_in: 'تسجيل الدخول',
      signing_in: 'جارٍ تسجيل الدخول…',
      login_note: 'وصول للقراءة فقط. تنتهي الجلسات تلقائياً.',
      aside_kicker: 'DYNAMICS 365 · للقراءة فقط',
      aside_title: 'رؤية واحدة واضحة للأعمال',
      aside_body:
        'بيانات العملاء والمنتجات والمشتريات والمالية والتنظيم من خريطة التكامل، مجتمعة في مساحة عمل واحدة ثنائية اللغة.',
      aside_point_1: 'تحليل مباشر من D365 دون تعديل أي سجل',
      aside_point_2: 'واجهة باللغتين الإنجليزية والعربية',
      aside_point_3: 'جلسات خاصة بملفات تعريف موقعة وHttpOnly',
      required: 'أدخل اسم المستخدم وكلمة المرور.',
      invalid: 'اسم المستخدم أو كلمة المرور غير صحيحة.',
      rate_limited: 'محاولات تسجيل دخول كثيرة. يرجى الانتظار والمحاولة مجدداً.',
      network: 'تعذر الوصول إلى الخادم. تحقق من الاتصال وحاول مجدداً.',
      failed: 'تعذر تسجيل الدخول. حاول مجدداً.',
      switch_light: 'التبديل إلى الوضع الفاتح',
      switch_dark: 'التبديل إلى الوضع الداكن',
      switch_language: 'تبديل اللغة',
    },
  };

  const state = {
    lang:
      localStorage.getItem(LS_LANG) ||
      (String(navigator.language || 'en').toLowerCase().startsWith('ar') ? 'ar' : 'en'),
    theme:
      localStorage.getItem(LS_THEME) ||
      (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light'),
    busy: false,
  };

  const $ = (id) => document.getElementById(id);
  const dom = {
    html: document.documentElement,
    themeColor: $('theme-color-meta'),
    langToggle: $('lang-toggle'),
    themeToggle: $('theme-toggle'),
    form: $('login-form'),
    username: $('username'),
    password: $('password'),
    submit: $('login-submit'),
    error: $('login-error'),
  };

  function t(key) {
    return (I18N[state.lang] || I18N.en)[key] ?? I18N.en[key] ?? key;
  }

  function applyTheme() {
    dom.html.dataset.theme = state.theme;
    dom.themeColor.setAttribute('content', state.theme === 'dark' ? '#151d19' : '#f5f7f4');
    dom.themeToggle.setAttribute(
      'aria-label',
      state.theme === 'dark' ? t('switch_light') : t('switch_dark'),
    );
  }

  function applyLanguage() {
    const arabic = state.lang === 'ar';
    dom.html.lang = state.lang;
    dom.html.dir = arabic ? 'rtl' : 'ltr';
    document.title = `${t('brand')} · ${t('login_title')}`;
    document.querySelectorAll('[data-i18n]').forEach((element) => {
      const key = element.getAttribute('data-i18n');
      if (key) element.textContent = t(key);
    });
    document.querySelectorAll('[data-i18n-placeholder]').forEach((element) => {
      const key = element.getAttribute('data-i18n-placeholder');
      if (key) element.setAttribute('placeholder', t(key));
    });
    dom.langToggle.textContent = arabic ? 'English' : 'العربية';
    dom.langToggle.setAttribute('aria-label', t('switch_language'));
    if (!state.busy) {
      const label = dom.submit.querySelector('[data-i18n="sign_in"]');
      if (label) label.textContent = t('sign_in');
    }
    applyTheme();
  }

  function showError(message) {
    dom.error.textContent = message;
    dom.error.hidden = false;
  }

  function clearError() {
    dom.error.hidden = true;
    dom.error.textContent = '';
  }

  function setBusy(busy) {
    state.busy = busy;
    dom.submit.disabled = busy;
    dom.username.disabled = busy;
    dom.password.disabled = busy;
    const label = dom.submit.querySelector('[data-i18n="sign_in"]');
    if (label) label.textContent = busy ? t('signing_in') : t('sign_in');
  }

  function safeNext() {
    const value = new URLSearchParams(window.location.search).get('next');
    if (!value || !value.startsWith('/') || value.startsWith('//') || value.startsWith('/login')) {
      return '/';
    }
    return value;
  }

  async function messageFor(response, payload) {
    const error = (payload && payload.error) || {};
    if (response.status === 401) return t('invalid');
    if (response.status === 429) {
      const seconds = Number(error.retryAfterSeconds);
      if (Number.isFinite(seconds) && seconds > 0) {
        return `${t('rate_limited')} (${seconds}s)`;
      }
      return t('rate_limited');
    }
    if (response.status === 400) return error.message || t('required');
    return error.message || t('failed');
  }

  async function submit(event) {
    event.preventDefault();
    if (state.busy) return;
    clearError();
    const username = dom.username.value.trim();
    const password = dom.password.value;
    if (!username || !password) {
      showError(t('required'));
      (username ? dom.password : dom.username).focus();
      return;
    }

    setBusy(true);
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      let payload = null;
      try {
        payload = await response.json();
      } catch {
        payload = null;
      }
      if (!response.ok) {
        showError(await messageFor(response, payload));
        dom.password.select();
        return;
      }
      window.location.replace(safeNext());
    } catch {
      showError(t('network'));
    } finally {
      setBusy(false);
    }
  }

  async function redirectIfSignedIn() {
    try {
      const response = await fetch('/api/auth/me', {
        headers: { Accept: 'application/json' },
        cache: 'no-store',
      });
      if (!response.ok) return;
      const payload = await response.json();
      if (payload && payload.authenticated) window.location.replace(safeNext());
    } catch {
      // The form remains available when the server cannot be reached.
    }
  }

  dom.form.addEventListener('submit', submit);
  dom.langToggle.addEventListener('click', () => {
    state.lang = state.lang === 'ar' ? 'en' : 'ar';
    localStorage.setItem(LS_LANG, state.lang);
    applyLanguage();
  });
  dom.themeToggle.addEventListener('click', () => {
    state.theme = state.theme === 'dark' ? 'light' : 'dark';
    localStorage.setItem(LS_THEME, state.theme);
    applyTheme();
  });

  applyLanguage();
  dom.username.focus();
  void redirectIfSignedIn();
})();
