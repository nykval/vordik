import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import { handlePhoneAuth, resolvePhoneSession, normalizePhone, cleanExpiredAuth } from './phone-auth.mjs';

const now = 1_800_000_000_000;

function fixture(t, extra = {}) {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec('PRAGMA foreign_keys = ON');
  sqlite.exec(readFileSync(new URL('./migrations/0013_phone_accounts.sql', import.meta.url), 'utf8'));
  const statement = (sql, args = []) => ({
    bind: (...values) => statement(sql, values),
    first: async () => sqlite.prepare(sql).get(...args) ?? null,
    run: async () => ({ meta: { changes: sqlite.prepare(sql).run(...args).changes } }),
  });
  const env = { DB: { prepare: statement, batch: async (items) => Promise.all(items.map((item) => item.run())) }, AUTH_SECRET: 'test-only-secret-at-least-thirty-two-characters', SMS_LOGIN_ENABLED: 'true', SMSRU_API_ID: 'mock-api-key', ...extra };
  const deliveries = [];
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(url, 'https://sms.ru/sms/send');
    assert.equal(options.method, 'POST');
    const phone = options.body.get('to');
    deliveries.push({ phone, code: options.body.get('msg').match(/\d{6}/)[0] });
    return Response.json({ status: 'OK', sms: { [phone]: { status: 'OK' } } });
  });
  t.after(() => sqlite.close());
  const call = (path, payload = {}, at = now, token = '', ip = '203.0.113.1') => handlePhoneAuth(new Request(`https://example.com/api/auth/${path}`, {
    method: path === 'me' || path === 'config' ? 'GET' : 'POST',
    headers: { 'CF-Connecting-IP': ip, ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  }), env, payload, at);
  const send = (phone = '+79991234567', at = now) => call('phone/send', { phone }, at);
  const verify = (challenge, otp = deliveries.at(-1).code, at = now, name = 'Анна') => call('phone/verify', { challengeId: challenge.challengeId, code: otp, name }, at);
  return { sqlite, env, call, deliveries, send, verify };
}

test('phone numbers have one canonical form and cannot contain multiple recipients', () => {
  assert.equal(normalizePhone('+7 (999) 123-45-67'), '79991234567');
  assert.equal(normalizePhone('8 999 1234567'), '79991234567');
  assert.equal(normalizePhone('+44 7700 900123'), '447700900123');
  for (const phone of ['79991234567,79991234568', '9991234567', '+7999<script>', '123', '']) assert.throws(() => normalizePhone(phone));
});

test('SMS auth fails closed without provider configuration', async (t) => {
  const f = fixture(t, { SMSRU_API_ID: '' });
  assert.deepEqual(await f.call('config'), { phone: false });
  await assert.rejects(f.send(), { statusCode: 503 });
  assert.equal(f.deliveries.length, 0);
});

test('verified phone signs into a stable account; another phone stays separate and logout revokes access', async (t) => {
  const f = fixture(t);
  const first = await f.verify(await f.send());
  assert.match(first.user.id, /^phone:/);
  assert.equal(first.user.name, 'Анна');
  assert.ok(!first.user.phone.includes('99912345'));
  assert.equal((await f.call('me', {}, now, first.token)).user.id, first.user.id);
  const second = await f.verify(await f.send('+79991234567', now + 61_000), undefined, now + 61_000, 'Другое имя');
  assert.equal(second.user.id, first.user.id);
  assert.equal(second.user.name, 'Анна');
  const other = await f.verify(await f.send('+79991234568', now + 62_000), undefined, now + 62_000);
  assert.notEqual(other.user.id, first.user.id);
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM phone_accounts').get().n, 2);
  const stored = f.sqlite.prepare('SELECT token_hash FROM account_sessions').all();
  assert.ok(stored.every((row) => row.token_hash !== first.token && row.token_hash !== second.token));
  await f.call('logout', {}, now + 63_000, first.token);
  await assert.rejects(f.call('me', {}, now + 63_000, first.token), { statusCode: 401 });
  assert.equal((await f.call('me', {}, now + 63_000, second.token)).user.id, first.user.id);
  await assert.rejects(f.call('me', {}, other.expiresAt + 1, other.token), { statusCode: 401 });
});

test('OTP is single use even for simultaneous requests, and expired sessions fail authentication', async (t) => {
  const f = fixture(t);
  const challenge = await f.send();
  const results = await Promise.allSettled([f.verify(challenge), f.verify(challenge)]);
  assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM account_sessions').get().n, 1);
  const token = results.find((result) => result.status === 'fulfilled').value.token;
  await assert.rejects(f.call('me', {}, now + 31 * 86_400_000, token), { statusCode: 401 });
  await assert.rejects(resolvePhoneSession(new Request('https://example.com', { headers: { Authorization: 'Bearer forged' } }), f.env), { statusCode: 401 });
});

test('OTP attempts, expiry, resend delay and invalidated old codes are enforced by the database', async (t) => {
  const f = fixture(t);
  let challenge = await f.send();
  const wrong = f.deliveries[0].code === '000000' ? '111111' : '000000';
  assert.notEqual(f.sqlite.prepare('SELECT code_hash FROM phone_challenges').get().code_hash, f.deliveries[0].code);
  await assert.rejects(f.send(), { statusCode: 429 });
  for (let i = 0; i < 5; i++) await assert.rejects(f.verify(challenge, wrong), { statusCode: 400 });
  await assert.rejects(f.verify(challenge), { statusCode: 410 });
  const old = challenge;
  challenge = await f.send('+79991234567', now + 61_000);
  await assert.rejects(f.verify(old, undefined, now + 61_000), { statusCode: 410 });
  await assert.rejects(f.verify(challenge, undefined, now + 61_000 + 300_001), { statusCode: 410 });
});

test('global send budget and country restrictions prevent uncontrolled SMS spending', async (t) => {
  const f = fixture(t, { SMS_DAILY_LIMIT: '1' });
  await f.send();
  await assert.rejects(f.send('+79991234568'), { statusCode: 429 });
  await assert.rejects(f.send('+447700900123'), { statusCode: 400 });
  assert.equal(f.deliveries.length, 1);
  await cleanExpiredAuth(f.env.DB, now + 31 * 86_400_000);
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM auth_rate_limits').get().n, 0);
});

test('provider errors never return a usable challenge or leave a valid code', async (t) => {
  const f = fixture(t);
  t.mock.method(globalThis, 'fetch', async () => Response.json({ status: 'ERROR', status_code: 201 }));
  await assert.rejects(f.send(), { statusCode: 502 });
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM phone_challenges').get().n, 0);
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM account_sessions').get().n, 0);
});
