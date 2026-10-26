import { fail, token, code, hash, privateHash, rateLimit, normalizePhone, resolvePhoneSession, handlePhoneAuth, cleanExpiredAuth } from './phone-auth.mjs';

const CODE_LIFETIME = 5 * 60_000;
const SESSION_LIFETIME = 30 * 86_400_000;
const PASSWORD_ITERATIONS = 310_000;
const encoder = new TextEncoder();

function hex(bytes) {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function validPassword(value) {
  if (typeof value !== 'string' || value.length < 10 || value.length > 128 || encoder.encode(value).length > 512)
    throw fail('Пароль должен содержать от 10 до 128 символов');
  return value;
}

async function passwordHash(env, password, salt) {
  const key = await crypto.subtle.importKey('raw', encoder.encode(`${env.AUTH_SECRET}:${password}`), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: Uint8Array.from(salt.match(/../g), (part) => parseInt(part, 16)), iterations: PASSWORD_ITERATIONS }, key, 256);
  return hex(new Uint8Array(bits));
}

function sameHash(left, right) {
  if (!/^[a-f0-9]{64}$/.test(left || '') || !/^[a-f0-9]{64}$/.test(right || '')) return false;
  let difference = 0;
  for (let index = 0; index < 64; index += 1) difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return difference === 0;
}

async function issueSession(env, row, now) {
  const sessionToken = token();
  await env.DB.prepare('INSERT INTO account_sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)')
    .bind(await hash(sessionToken), row.user_id, now, now + SESSION_LIFETIME).run();
  return { user: { id: row.user_id, name: row.name, phone: row.phone_mask, provider: 'phone', joinedAt: new Date(row.created_at).toISOString() },
    token: sessionToken, expiresAt: now + SESSION_LIFETIME };
}

function configured(env) {
  return Boolean(env.BOT_TOKEN) && /^[a-zA-Z0-9_]{5,32}$/.test(env.TELEGRAM_BOT_USERNAME || '')
    && /^[a-zA-Z0-9_-]{32,256}$/.test(env.TELEGRAM_AUTH_WEBHOOK_SECRET || '') && String(env.AUTH_SECRET || '').length >= 32;
}

function sessionUser(row) {
  return { id: row.user_id, name: row.name, joinedAt: row.joined_at, provider: 'telegram' };
}

async function telegramMessage(env, chatId, message, replyMarkup) {
  const response = await fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/sendMessage`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(12_000),
    body: JSON.stringify({ chat_id: chatId, text: message, protect_content: true, allow_paid_broadcast: false,
      ...(replyMarkup ? { reply_markup: replyMarkup } : {}) }),
  });
  const result = await response.json();
  if (!response.ok || result.ok !== true) throw new Error('Telegram delivery failed');
}

export async function resolveAccountSession(request, env, now = Date.now()) {
  const authorization = request.headers.get('Authorization');
  if (!authorization) return null;
  const match = authorization.match(/^Bearer ([a-f0-9]{64})$/);
  if (!match) throw fail('Сессия недействительна. Войдите снова', 401);
  const row = await env.DB.prepare(`SELECT user_id, name, joined_at FROM telegram_login_sessions WHERE token_hash = ? AND expires_at > ?`)
    .bind(await hash(match[1]), now).first();
  if (row) return sessionUser(row);
  return resolvePhoneSession(request, env, now);
}

export async function handleAccountAuth(request, env, payload, now = Date.now()) {
  const path = new URL(request.url).pathname;
  if (path === '/api/auth/config' && request.method === 'GET') return { telegram: configured(env), password: String(env.AUTH_SECRET || '').length >= 32, phone: false };
  if (path === '/api/auth/me' && request.method === 'GET') return { user: await resolveAccountSession(request, env, now) };
  if (path === '/api/auth/logout' && request.method === 'POST') {
    const match = (request.headers.get('Authorization') || '').match(/^Bearer ([a-f0-9]{64})$/);
    if (match) await env.DB.prepare('DELETE FROM telegram_login_sessions WHERE token_hash = ?').bind(await hash(match[1])).run();
    return handlePhoneAuth(request, env, payload, now);
  }
  if (path === '/api/auth/telegram/webhook' && request.method === 'POST') return receiveTelegramCodeRequest(request, env, payload, now);
  if (path === '/api/auth/password/login' && request.method === 'POST') {
    if (String(env.AUTH_SECRET || '').length < 32) throw fail('Вход по паролю пока не подключён', 503);
    const identifier = String(payload.identifier || '').trim();
    const password = validPassword(payload.password);
    const username = identifier.replace(/^@/, '').toLowerCase();
    const isUsername = /^@?[a-zA-Z][a-zA-Z0-9_]{4,31}$/.test(identifier);
    const phone = isUsername ? '' : normalizePhone(identifier);
    const identityHash = await privateHash(env, isUsername ? `username:${username}` : `phone:${phone}`);
    const ip = await privateHash(env, `login-ip:${request.headers.get('CF-Connecting-IP') || 'local'}`);
    await rateLimit(env, `password-login-ip:${ip}`, 20, 3_600_000, now);
    await rateLimit(env, `password-login-user:${identityHash}`, 10, 3_600_000, now);
    const row = isUsername
      ? await env.DB.prepare(`SELECT a.user_id, a.name, a.phone_mask, a.created_at, c.password_salt, c.password_hash
          FROM account_credentials c JOIN phone_accounts a ON a.user_id = c.user_id WHERE c.telegram_username = ?`).bind(username).first()
      : await env.DB.prepare(`SELECT a.user_id, a.name, a.phone_mask, a.created_at, c.password_salt, c.password_hash
          FROM phone_accounts a JOIN account_credentials c ON c.user_id = a.user_id WHERE a.phone_hash = ?`).bind(identityHash).first();
    const fallbackSalt = '00'.repeat(16);
    const computed = await passwordHash(env, password, row?.password_salt || fallbackSalt);
    if (!row || !sameHash(computed, row.password_hash)) throw fail('Неверный номер, имя Telegram или пароль', 401);
    return issueSession(env, row, now);
  }
  if (!['/api/auth/telegram/start', '/api/auth/telegram/verify'].includes(path) || request.method !== 'POST') throw fail('Способ входа недоступен', 404);
  if (!configured(env)) throw fail('Вход через Telegram пока не подключён', 503);
  const ip = await privateHash(env, `login-ip:${request.headers.get('CF-Connecting-IP') || 'local'}`);
  if (path === '/api/auth/telegram/start') {
    const phone = normalizePhone(payload.phone);
    await rateLimit(env, `telegram-start:${ip}`, 10, 3_600_000, now);
    const phoneHash = await privateHash(env, `phone:${phone}`);
    await rateLimit(env, `telegram-phone:${phoneHash}`, 5, 3_600_000, now);
    const challengeId = crypto.randomUUID();
    const browserSecret = token();
    const linkToken = token().slice(0, 48);
    const phoneMask = `+${phone.slice(0, -7)} ••• •• ${phone.slice(-2)}`;
    await env.DB.prepare(`INSERT INTO telegram_login_challenges
      (challenge_id, browser_hash, link_hash, phone_hash, phone_mask, expires_at) VALUES (?, ?, ?, ?, ?, ?)`)
      .bind(challengeId, await hash(browserSecret), await hash(linkToken), phoneHash, phoneMask, now + CODE_LIFETIME).run();
    return { challengeId, browserSecret, phone: phoneMask,
      botUrl: `https://t.me/${env.TELEGRAM_BOT_USERNAME}?start=login_${linkToken}`, expiresIn: 300, resendAfter: 60 };
  }

  await rateLimit(env, `telegram-verify:${ip}`, 30, 3_600_000, now);
  const challengeId = String(payload.challengeId || '');
  const browserSecret = String(payload.browserSecret || '');
  const otp = String(payload.code || '');
  const password = validPassword(payload.password);
  if (!/^[a-f\d-]{36}$/.test(challengeId) || !/^[a-f0-9]{64}$/.test(browserSecret) || !/^\d{6}$/.test(otp)) throw fail('Введите шесть цифр из сообщения бота');
  const browserHash = await hash(browserSecret);
  const challenge = await env.DB.prepare(`
    SELECT user_id, status FROM telegram_login_challenges WHERE challenge_id = ? AND browser_hash = ? AND expires_at > ? AND attempts < 5
  `).bind(challengeId, browserHash, now).first();
  if (!challenge) throw fail('Код истёк или попытки закончились. Запросите новый', 410);
  if (challenge.status !== 'delivered') throw fail('Сначала откройте бота, нажмите «Старт» и поделитесь своим контактом');
  const attempt = await env.DB.prepare(`UPDATE telegram_login_challenges SET attempts = attempts + 1
    WHERE challenge_id = ? AND browser_hash = ? AND status = 'delivered' AND expires_at > ? AND attempts < 5 RETURNING challenge_id`)
    .bind(challengeId, browserHash, now).first();
  if (!attempt) throw fail('Код истёк или попытки закончились. Запросите новый', 410);
  const verified = await env.DB.prepare(`DELETE FROM telegram_login_challenges
    WHERE challenge_id = ? AND browser_hash = ? AND code_hash = ? AND status = 'delivered' AND expires_at > ? AND attempts <= 5
    RETURNING phone_hash, phone_mask, name, user_id, telegram_username`)
    .bind(challengeId, browserHash, await privateHash(env, `telegram-code:${challengeId}:${otp}`), now).first();
  if (!verified) throw fail('Неверный код. Попробуйте ещё раз');
  const row = await env.DB.prepare(`INSERT INTO phone_accounts (user_id, phone_hash, phone_mask, name, created_at)
    VALUES (?, ?, ?, ?, ?) ON CONFLICT(phone_hash) DO UPDATE SET phone_mask = excluded.phone_mask
    RETURNING user_id, name, phone_mask, created_at`)
    .bind(`phone:${crypto.randomUUID()}`, verified.phone_hash, verified.phone_mask, verified.name, now).first();
  const salt = hex(crypto.getRandomValues(new Uint8Array(16)));
  const derived = await passwordHash(env, password, salt);
  const alias = /^[a-zA-Z][a-zA-Z0-9_]{4,31}$/.test(verified.telegram_username || '') ? verified.telegram_username.toLowerCase() : null;
  // Telegram usernames can change or be reassigned. The newly verified owner claims the alias.
  await env.DB.prepare('UPDATE account_credentials SET telegram_user_id = NULL, telegram_username = NULL WHERE telegram_user_id = ? AND user_id <> ?')
    .bind(verified.user_id, row.user_id).run();
  if (alias) await env.DB.prepare('UPDATE account_credentials SET telegram_username = NULL WHERE telegram_username = ? AND user_id <> ?')
    .bind(alias, row.user_id).run();
  await env.DB.prepare(`INSERT INTO account_credentials
    (user_id, telegram_user_id, telegram_username, password_salt, password_hash, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET
      telegram_user_id = excluded.telegram_user_id, telegram_username = excluded.telegram_username,
      password_salt = excluded.password_salt, password_hash = excluded.password_hash, updated_at = excluded.updated_at`)
    .bind(row.user_id, verified.user_id, alias, salt, derived, now, now).run();
  return issueSession(env, row, now);
}

export async function receiveTelegramCodeRequest(request, env, update, now = Date.now()) {
  if (!configured(env) || request.headers.get('X-Telegram-Bot-Api-Secret-Token') !== env.TELEGRAM_AUTH_WEBHOOK_SECRET) throw fail('Источник сообщения не подтверждён', 401);
  const message = update.message;
  const sender = message?.from;
  if (message?.chat?.type !== 'private' || sender?.is_bot || !Number.isSafeInteger(sender?.id) || sender.id < 1 || message.chat.id !== sender.id) return { ok: true };
  const userId = `telegram:${sender.id}`;
  const name = [sender.first_name, sender.last_name].filter(Boolean).join(' ').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 80) || 'Пользователь Вордик';
  const start = String(message?.text || '').match(/^\/start(?:@[a-zA-Z0-9_]+)?\s+login_([a-f0-9]{48})$/);
  if (start) {
    const started = await env.DB.prepare(`UPDATE telegram_login_challenges SET status = 'awaiting_contact', chat_id = ?, user_id = ?, name = ?, telegram_username = ?
      WHERE link_hash = ? AND status = 'pending' AND expires_at > ? RETURNING challenge_id`)
      .bind(sender.id, userId, name, String(sender.username || ''), await hash(start[1]), now).first();
    if (!started) return { ok: true };
    try {
      await telegramMessage(env, sender.id, 'Чтобы подтвердить введённый номер, нажмите кнопку «Поделиться моим номером». После этого пришлю код входа.',
        { keyboard: [[{ text: 'Поделиться моим номером', request_contact: true }]], resize_keyboard: true, one_time_keyboard: true });
    } catch {
      await env.DB.prepare('DELETE FROM telegram_login_challenges WHERE challenge_id = ?').bind(started.challenge_id).run();
    }
    return { ok: true };
  }
  if (!message?.contact) return { ok: true };
  const challenge = await env.DB.prepare(`SELECT challenge_id, phone_hash FROM telegram_login_challenges
    WHERE chat_id = ? AND user_id = ? AND status = 'awaiting_contact' AND expires_at > ? ORDER BY expires_at DESC LIMIT 1`)
    .bind(sender.id, userId, now).first();
  if (!challenge) return { ok: true };
  let matches = false;
  try {
    const contactPhone = String(message.contact.phone_number || '').trim();
    const normalizedContact = normalizePhone(/^8\d{10}$/.test(contactPhone.replace(/\D/g, '')) || contactPhone.startsWith('+')
      ? contactPhone : `+${contactPhone}`);
    matches = message.contact.user_id === sender.id &&
      await privateHash(env, `phone:${normalizedContact}`) === challenge.phone_hash;
  } catch { /* Invalid or foreign contacts cannot confirm the entered number. */ }
  if (!matches) {
    await telegramMessage(env, sender.id, 'Номер не совпадает. Вернитесь в Вордик, введите свой номер Telegram и запросите новый код.').catch(() => {});
    await env.DB.prepare('DELETE FROM telegram_login_challenges WHERE challenge_id = ?').bind(challenge.challenge_id).run();
    return { ok: true };
  }
  try {
    await rateLimit(env, `telegram-send-user:${userId}`, 5, 3_600_000, now);
    await rateLimit(env, 'telegram-send-global-second', 20, 1000, now);
  } catch (error) {
    if (error.statusCode === 429) return { ok: true };
    throw error;
  }
  const otp = code();
  const reserved = await env.DB.prepare(`UPDATE telegram_login_challenges SET status = 'sending', code_hash = ?
    WHERE challenge_id = ? AND status = 'awaiting_contact' AND expires_at > ? RETURNING challenge_id`)
    .bind(await privateHash(env, `telegram-code:${challenge.challenge_id}:${otp}`), challenge.challenge_id, now).first();
  if (!reserved) return { ok: true };
  try {
    await telegramMessage(env, sender.id, `Код входа в Вордик: ${otp}\n\nВведите его только на странице, где вы сами запросили вход. Код действует 5 минут. Никому не пересылайте этот код.`, { remove_keyboard: true });
    await env.DB.prepare(`UPDATE telegram_login_challenges SET status = 'delivered', expires_at = ? WHERE challenge_id = ? AND status = 'sending'`)
      .bind(now + CODE_LIFETIME, challenge.challenge_id).run();
  } catch {
    // Invalidate a possibly sent code, so webhook retries never send several valid codes.
    await env.DB.prepare('DELETE FROM telegram_login_challenges WHERE challenge_id = ?').bind(challenge.challenge_id).run();
  }
  return { ok: true };
}

export async function cleanExpiredAccounts(database, now = Date.now()) {
  await cleanExpiredAuth(database, now);
  await database.batch([
    database.prepare('DELETE FROM telegram_login_challenges WHERE expires_at < ?').bind(now),
    database.prepare('DELETE FROM telegram_login_sessions WHERE expires_at < ?').bind(now),
  ]);
}
