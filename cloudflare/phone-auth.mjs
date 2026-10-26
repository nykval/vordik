const encoder = new TextEncoder();
const CODE_LIFETIME = 5 * 60_000;
const RESEND_DELAY = 60_000;
const SESSION_LIFETIME = 30 * 24 * 60 * 60_000;

function fail(message, statusCode = 400) {
  return Object.assign(new Error(message), { statusCode });
}

export function normalizePhone(value) {
  const text = String(value ?? '').trim();
  if (text.length > 32 || !/^\+?[\d\s()-]+$/.test(text)) throw fail('Введите номер в международном формате, например +7 999 123-45-67');
  let digits = text.replace(/\D/g, '');
  if (/^8\d{10}$/.test(digits)) digits = `7${digits.slice(1)}`;
  if (!/^[1-9]\d{7,14}$/.test(digits)) throw fail('Введите номер с кодом страны');
  if (!text.startsWith('+') && !/^7\d{10}$/.test(digits)) throw fail('Укажите код страны, начиная с +');
  return digits;
}

function token() {
  return [...crypto.getRandomValues(new Uint8Array(32))].map((value) => value.toString(16).padStart(2, '0')).join('');
}

function code() {
  // Rejection sampling keeps every six-digit code equally likely.
  const values = new Uint32Array(1);
  do { crypto.getRandomValues(values); } while (values[0] >= 4_294_000_000);
  return String(values[0] % 1_000_000).padStart(6, '0');
}

async function hash(value) {
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(value)))].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function privateHash(env, value) {
  const secret = String(env.AUTH_SECRET ?? '');
  if (secret.length < 32) throw fail('Вход по SMS ещё не подключён', 503);
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return [...new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(value)))].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function configured(env) {
  return String(env.SMS_LOGIN_ENABLED) === 'true' && String(env.AUTH_SECRET ?? '').length >= 32 && Boolean(env.SMSRU_API_ID);
}

async function rateLimit(env, key, limit, duration, now) {
  const bucket = Math.floor(now / duration);
  const row = await env.DB.prepare(`
    INSERT INTO auth_rate_limits (bucket_key, count, expires_at) VALUES (?, 1, ?)
    ON CONFLICT(bucket_key) DO UPDATE SET count = count + 1 WHERE count < ?
    RETURNING count
  `).bind(`${key}:${bucket}`, (bucket + 1) * duration, limit).first();
  if (!row) throw fail('Слишком много попыток. Попробуйте позже', 429);
}

async function clientHash(request, env) {
  // Only Cloudflare's trusted header; never accept a caller supplied X-Forwarded-For.
  return privateHash(env, `ip:${request.headers.get('CF-Connecting-IP') || 'local'}`);
}

function account(row) {
  return { id: row.user_id, name: row.name, phone: row.phone_mask, provider: 'phone', joinedAt: new Date(row.created_at).toISOString() };
}

export async function resolvePhoneSession(request, env, now = Date.now()) {
  const authorization = request.headers.get('Authorization');
  if (!authorization) return null;
  const match = authorization.match(/^Bearer ([a-f0-9]{64})$/);
  if (!match) throw fail('Сессия недействительна. Войдите снова', 401);
  const row = await env.DB.prepare(`
    SELECT a.user_id, a.name, a.phone_mask, a.created_at FROM account_sessions s
    JOIN phone_accounts a ON a.user_id = s.user_id WHERE s.token_hash = ? AND s.expires_at > ?
  `).bind(await hash(match[1]), now).first();
  if (!row) throw fail('Сессия истекла. Войдите снова', 401);
  return account(row);
}

export async function handlePhoneAuth(request, env, payload, now = Date.now()) {
  const path = new URL(request.url).pathname;
  if (path === '/api/auth/config' && request.method === 'GET') return { phone: configured(env) };
  if (path === '/api/auth/me' && request.method === 'GET') return { user: await resolvePhoneSession(request, env, now) };
  if (path === '/api/auth/logout' && request.method === 'POST') {
    const authorization = request.headers.get('Authorization') || '';
    const match = authorization.match(/^Bearer ([a-f0-9]{64})$/);
    if (match) await env.DB.prepare('DELETE FROM account_sessions WHERE token_hash = ?').bind(await hash(match[1])).run();
    return { ok: true };
  }
  if (!['/api/auth/phone/send', '/api/auth/phone/verify'].includes(path) || request.method !== 'POST') throw fail('Способ входа не найден', 404);
  if (!configured(env)) throw fail('Вход по SMS ещё не подключён. Попробуйте позже', 503);
  const ipHash = await clientHash(request, env);

  if (path === '/api/auth/phone/send') {
    const phone = normalizePhone(payload.phone);
    const phoneHash = await privateHash(env, `phone:${phone}`);
    const allowedCountries = String(env.SMS_ALLOWED_COUNTRY_CODES || '7').split(',').map((item) => item.trim()).filter((item) => /^\d{1,3}$/.test(item));
    if (!allowedCountries.some((prefix) => phone.startsWith(prefix))) throw fail('SMS на номера этой страны пока недоступны');
    await rateLimit(env, `send-ip:${ipHash}`, 10, 3_600_000, now);
    await rateLimit(env, `send-phone-hour:${phoneHash}`, 5, 3_600_000, now);
    await rateLimit(env, `send-phone-day:${phoneHash}`, 10, 86_400_000, now);
    const dailyLimit = Math.min(1000, Math.max(1, Number(env.SMS_DAILY_LIMIT) || 100));
    await rateLimit(env, 'send-global-day', dailyLimit, 86_400_000, now);
    const challengeId = crypto.randomUUID();
    const otp = code();
    const phoneMask = `+${phone.slice(0, -7)} ••• •• ${phone.slice(-2)}`;
    const reserved = await env.DB.prepare(`
      INSERT INTO phone_challenges (phone_hash, challenge_id, code_hash, phone_mask, attempts, expires_at, resend_after)
      VALUES (?, ?, ?, ?, 0, ?, ?)
      ON CONFLICT(phone_hash) DO UPDATE SET challenge_id = excluded.challenge_id, code_hash = excluded.code_hash,
        phone_mask = excluded.phone_mask, attempts = 0, expires_at = excluded.expires_at, resend_after = excluded.resend_after
      WHERE phone_challenges.resend_after <= ? RETURNING challenge_id
    `).bind(phoneHash, challengeId, await privateHash(env, `code:${challengeId}:${otp}`), phoneMask, now + CODE_LIFETIME, now + RESEND_DELAY, now).first();
    if (!reserved) throw fail('Повторный код можно запросить через минуту', 429);
    const body = new URLSearchParams({ api_id: env.SMSRU_API_ID, to: phone, msg: `Вордик: код входа ${otp}. Никому его не сообщайте.`, json: '1' });
    if (env.SMSRU_SENDER) body.set('from', env.SMSRU_SENDER);
    if (request.headers.get('CF-Connecting-IP')) body.set('ip', request.headers.get('CF-Connecting-IP'));
    try {
      const response = await fetch('https://sms.ru/sms/send', { method: 'POST', body, signal: AbortSignal.timeout(15_000) });
      const result = await response.json();
      if (!response.ok || result.status !== 'OK' || result.sms?.[phone]?.status !== 'OK') throw new Error('SMS rejected');
    } catch {
      await env.DB.prepare('DELETE FROM phone_challenges WHERE challenge_id = ?').bind(challengeId).run();
      throw fail('Не удалось отправить SMS. Попробуйте позже', 502);
    }
    return { challengeId, phone: phoneMask, expiresIn: CODE_LIFETIME / 1000, resendAfter: RESEND_DELAY / 1000 };
  }

  await rateLimit(env, `verify-ip:${ipHash}`, 30, 3_600_000, now);
  const challengeId = String(payload.challengeId ?? '');
  const otp = String(payload.code ?? '');
  if (!/^[a-f\d-]{36}$/.test(challengeId) || !/^\d{6}$/.test(otp)) throw fail('Введите шесть цифр из SMS');
  const challenge = await env.DB.prepare(`
    UPDATE phone_challenges SET attempts = attempts + 1
    WHERE challenge_id = ? AND expires_at > ? AND attempts < 5 RETURNING challenge_id
  `).bind(challengeId, now).first();
  if (!challenge) throw fail('Код истёк или попытки закончились. Запросите новый', 410);
  // Atomic consumption prevents two simultaneous verifications from issuing sessions.
  const consumed = await env.DB.prepare(`
    DELETE FROM phone_challenges WHERE challenge_id = ? AND code_hash = ? AND expires_at > ? AND attempts <= 5
    RETURNING phone_hash, phone_mask
  `).bind(challengeId, await privateHash(env, `code:${challengeId}:${otp}`), now).first();
  if (!consumed) throw fail('Неверный код. Попробуйте ещё раз');
  const name = String(payload.name || '').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 80) || 'Пользователь Вордик';
  const row = await env.DB.prepare(`
    INSERT INTO phone_accounts (user_id, phone_hash, phone_mask, name, created_at) VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(phone_hash) DO UPDATE SET phone_mask = excluded.phone_mask
    RETURNING user_id, name, phone_mask, created_at
  `).bind(`phone:${crypto.randomUUID()}`, consumed.phone_hash, consumed.phone_mask, name, now).first();
  const sessionToken = token();
  await env.DB.prepare('INSERT INTO account_sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)')
    .bind(await hash(sessionToken), row.user_id, now, now + SESSION_LIFETIME).run();
  return { user: account(row), token: sessionToken, expiresAt: now + SESSION_LIFETIME };
}

export async function cleanExpiredAuth(database, now = Date.now()) {
  await database.batch([
    database.prepare('DELETE FROM account_sessions WHERE expires_at < ?').bind(now),
    database.prepare('DELETE FROM phone_challenges WHERE expires_at < ?').bind(now),
    database.prepare('DELETE FROM auth_rate_limits WHERE expires_at < ?').bind(now),
  ]);
}

export { fail, token, code, hash, privateHash, rateLimit };
