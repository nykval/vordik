(() => {
  'use strict';
  const SESSION_KEY = 'vordik.phoneSession.v1';
  const base = ['localhost', '127.0.0.1', '[::1]'].includes(window.location.hostname) ? '' : document.querySelector('meta[name="vordik-api-base"]')?.content.trim().replace(/\/+$/, '') || '';
  const $ = (id) => document.getElementById(id);
  let saved = null;
  try { saved = JSON.parse(localStorage.getItem(SESSION_KEY) || 'null'); } catch { /* Start without a session. */ }
  if (!/^[a-f0-9]{64}$/.test(saved?.token || '') || !/^phone:[a-f0-9-]{36}$/.test(saved?.user?.id || '') || saved.expiresAt <= Date.now()) saved = null;
  const initialToken = saved?.token || '';
  let challenge = null;
  let busy = false;
  let countdown = 0;
  let available = false;
  let registrationAvailable = false;

  async function request(path, body, sessionToken = saved?.token) {
    const response = await fetch(`${base}${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { Accept: 'application/json', ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...(sessionToken ? { Authorization: `Bearer ${sessionToken}` } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(20_000),
      cache: 'no-store',
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw Object.assign(new Error(result.error || 'Не удалось связаться с сервером'), { status: response.status });
    return result;
  }

  const account = {
    user: saved?.user || null,
    apiBase: base,
    headers() { return initialToken ? { Authorization: `Bearer ${initialToken}` } : {}; },
    storageKey(key) {
      const id = account.user?.id;
      if (id) return `${key}.account.${id}`;
      const telegramId = String(window.Telegram?.WebApp?.initDataUnsafe?.user?.id || '');
      if (!/^\d+$/.test(telegramId)) return key;
      const scoped = `${key}.account.telegram.${telegramId}`;
      try {
        if (localStorage.getItem(scoped) !== null) return scoped;
        const ownerKey = 'vordik.legacyStorageOwner.v1';
        const owner = localStorage.getItem(ownerKey);
        if (!owner) localStorage.setItem(ownerKey, telegramId);
        const specific = localStorage.getItem(`${key}.telegram.${telegramId}`);
        const legacy = specific ?? ((!owner || owner === telegramId) ? localStorage.getItem(key) : null);
        if (legacy !== null) localStorage.setItem(scoped, legacy);
      } catch { /* Storage can be disabled; in-memory activity remains available. */ }
      return scoped;
    },
  };
  window.VORDIK_ACCOUNT = account;
  account.ready = (async () => {
    if (!saved) return;
    try {
      const result = await request('/api/auth/me');
      if (!result.user || result.user.id !== saved.user.id) throw Object.assign(new Error('Войдите снова'), { status: 401 });
      account.user = result.user;
    } catch (error) {
      if (error.status === 401) {
        try { localStorage.removeItem(SESSION_KEY); } catch { /* Session is discarded below. */ }
        saved = null;
        account.user = null;
        account.headers = () => ({});
      }
      // Offline use keeps the same local account; the server still verifies every request.
    }
  })();

  function status(message, error = false) {
    $('account-feedback').textContent = message;
    $('account-feedback').classList.toggle('is-error', error);
  }

  function render() {
    const phone = Boolean(account.user);
    const telegram = Boolean(window.Telegram?.WebApp?.initData);
    $('account-state').textContent = phone ? 'Вход по номеру телефона' : telegram ? 'Вход через Telegram' : 'Вы ещё не вошли';
    $('account-detail').textContent = phone ? account.user.phone : telegram ? 'Вы можете войти в другой аккаунт по номеру телефона.' : 'Войдите по номеру через Telegram-бота.';
    $('account-login-open').textContent = phone || telegram ? 'Другой аккаунт' : 'Войти или зарегистрироваться';
    $('account-login-open').setAttribute('aria-expanded', String(!$('account-login-form').hidden));
    $('account-logout').hidden = !phone;
    $('account-send').disabled = busy || !registrationAvailable;
    $('account-password-login').disabled = busy || !available;
    $('account-verify').disabled = busy;
    const wait = Math.max(0, Math.ceil(((challenge?.resendAt || 0) - Date.now()) / 1000));
    $('account-resend').textContent = wait ? `Отправить снова через ${wait} с` : 'Отправить код ещё раз';
    $('account-resend').disabled = busy || wait > 0;
  }

  async function sendCode() {
    if (busy || !registrationAvailable) return;
    busy = true;
    render();
    status('Готовим вход через Telegram…');
    try {
      const result = await request('/api/auth/telegram/start', { phone: $('account-phone').value }, '');
      challenge = { id: result.challengeId, browserSecret: result.browserSecret, resendAt: Date.now() + result.resendAfter * 1000 };
      $('account-number-step').hidden = true;
      $('account-code-step').hidden = false;
      $('account-code-destination').textContent = `Номер ${result.phone}. Откройте бота, нажмите «Старт» и поделитесь своим номером. Затем бот пришлёт код.`;
      $('account-bot-link').href = result.botUrl;
      $('account-code').value = '';
      $('account-bot-link').focus();
      status('Код действует 5 минут после отправки ботом.');
      clearInterval(countdown);
      countdown = setInterval(render, 1000);
    } catch (error) { status(error.message || 'Не удалось открыть вход через Telegram', true); }
    finally { busy = false; render(); }
  }

  async function saveSession(result) {
    try { localStorage.setItem(SESSION_KEY, JSON.stringify(result)); }
    catch {
      await request('/api/auth/logout', {}, result.token).catch(() => {});
      throw new Error('Разрешите сохранение данных в браузере, чтобы войти');
    }
    window.location.reload();
  }

  $('account-login-open').addEventListener('click', async () => {
    $('account-login-form').hidden = false;
    render();
    $('account-phone').focus();
    status('Проверяем доступность входа…');
    try {
      const result = await request('/api/auth/config', undefined, '');
      available = result.password === true;
      registrationAvailable = result.telegram === true;
      status(available ? (registrationAvailable ? 'Войдите с паролем или подтвердите номер для регистрации и восстановления доступа.' : 'Вход с паролем доступен. Подтверждение номера через Telegram пока недоступно.') : 'Вход пока недоступен. Попробуйте позже.', !available);
    } catch { status('Сервер входа недоступен. Попробуйте позже.', true); }
    render();
  });
  $('account-password-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    if (busy || !available) return;
    busy = true;
    render();
    status('Проверяем пароль…');
    try {
      const result = await request('/api/auth/password/login', {
        identifier: $('account-identifier').value.trim(), password: $('account-password').value,
      }, '');
      await saveSession(result);
    } catch (error) { status(error.message || 'Не удалось войти', true); }
    finally { busy = false; render(); }
  });
  $('account-phone-form').addEventListener('submit', (event) => { event.preventDefault(); void sendCode(); });
  $('account-resend').addEventListener('click', () => { if (Date.now() >= (challenge?.resendAt || 0)) void sendCode(); });
  $('account-change-phone').addEventListener('click', () => {
    if (busy) return;
    challenge = null;
    clearInterval(countdown);
    $('account-code-step').hidden = true;
    $('account-number-step').hidden = false;
    $('account-phone').focus();
    status('Введите номер, который привязан к вашему Telegram.');
  });
  $('account-login-close').addEventListener('click', () => {
    $('account-login-form').hidden = true;
    render();
    $('account-login-open').focus();
  });
  $('account-code-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    if (busy || !challenge) return;
    if ($('account-new-password').value !== $('account-confirm-password').value) {
      status('Пароли не совпадают', true);
      return;
    }
    busy = true;
    render();
    status('Проверяем код…');
    try {
      const result = await request('/api/auth/telegram/verify', { challengeId: challenge.id,
        browserSecret: challenge.browserSecret, code: $('account-code').value.trim(), password: $('account-new-password').value }, '');
      await saveSession(result);
    } catch (error) { status(error.message || 'Не удалось войти', true); }
    finally { busy = false; render(); }
  });
  $('account-logout').addEventListener('click', async () => {
    if (busy) return;
    busy = true;
    $('account-logout').disabled = true;
    try {
      // Keep the active account if the server could not revoke its session.
      await request('/api/auth/logout', {});
      localStorage.removeItem(SESSION_KEY);
      window.location.reload();
    } catch { status('Не удалось выйти. Проверьте соединение и попробуйте снова.', true); }
    finally { busy = false; $('account-logout').disabled = false; }
  });
  window.addEventListener('storage', (event) => { if (event.key === SESSION_KEY) window.location.reload(); });
  void account.ready.then(render);
})();
