import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import { handleAccountAuth, receiveTelegramCodeRequest, resolveAccountSession } from './messenger-auth.mjs';

const now = 1_800_000_000_000;

function fixture(t) {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec('PRAGMA foreign_keys = ON');
  for (const migration of ['0013_phone_accounts.sql', '0014_telegram_code_login.sql', '0015_account_passwords.sql'])
    sqlite.exec(readFileSync(new URL(`./migrations/${migration}`, import.meta.url), 'utf8'));
  const statement = (sql, args = []) => ({
    bind: (...values) => statement(sql, values),
    first: async () => sqlite.prepare(sql).get(...args) ?? null,
    run: async () => ({ meta: { changes: sqlite.prepare(sql).run(...args).changes } }),
  });
  const env = { DB: { prepare: statement }, BOT_TOKEN: 'test-token', TELEGRAM_BOT_USERNAME: 'vordik_test_bot',
    TELEGRAM_AUTH_WEBHOOK_SECRET: 'test-webhook-secret-at-least-thirty-two-characters',
    AUTH_SECRET: 'test-account-secret-at-least-thirty-two-characters' };
  const messages = [];
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(url, 'https://api.telegram.org/bottest-token/sendMessage');
    const body = JSON.parse(options.body);
    messages.push(body);
    return Response.json({ ok: true });
  });
  t.after(() => sqlite.close());
  const call = (path, payload = {}, at = now, bearer = '') => handleAccountAuth(new Request(`https://example.com/api/auth/${path}`, {
    method: path === 'config' || path === 'me' ? 'GET' : 'POST',
    headers: bearer ? { Authorization: `Bearer ${bearer}` } : {},
  }), env, payload, at);
  const webhook = (update, at = now) => receiveTelegramCodeRequest(new Request('https://example.com/api/auth/telegram/webhook', {
    method: 'POST', headers: { 'X-Telegram-Bot-Api-Secret-Token': env.TELEGRAM_AUTH_WEBHOOK_SECRET },
  }), env, { message: { chat: { type: 'private', id: 123 }, from: { id: 123, first_name: 'Анна', username: 'anna_test' }, ...update } }, at);
  return { sqlite, env, messages, call, webhook };
}

test('Telegram contact must match the entered phone before a code is sent', async (t) => {
  const f = fixture(t);
  const first = await f.call('telegram/start', { phone: '+7 999 123-45-67' });
  const linkToken = new URL(first.botUrl).searchParams.get('start');
  await f.webhook({ text: `/start ${linkToken}` });
  assert.equal(f.messages.length, 1);
  assert.equal(f.messages[0].reply_markup.keyboard[0][0].request_contact, true);
  await f.webhook({ contact: { user_id: 456, phone_number: '+79991234567' } });
  assert.equal(f.messages.some((message) => /Код входа/.test(message.text)), false);
  await assert.rejects(f.call('telegram/verify', { challengeId: first.challengeId, browserSecret: first.browserSecret, code: '000000', password: 'correct-horse-staple' }), { statusCode: 410 });

  const second = await f.call('telegram/start', { phone: '+7 999 123-45-67' }, now + 60_000);
  await f.webhook({ text: `/start ${new URL(second.botUrl).searchParams.get('start')}` }, now + 60_000);
  await f.webhook({ contact: { user_id: 123, phone_number: '+79991234568' } }, now + 60_000);
  assert.equal(f.messages.some((message) => /Код входа/.test(message.text)), false);

  const third = await f.call('telegram/start', { phone: '+7 999 123-45-67' }, now + 120_000);
  await f.webhook({ text: `/start ${new URL(third.botUrl).searchParams.get('start')}` }, now + 120_000);
  await f.webhook({ contact: { user_id: 123, phone_number: '+79991234567' } }, now + 120_000);
  const otp = f.messages.at(-1).text.match(/Код входа в Вордик: (\d{6})/)[1];
  const signedIn = await f.call('telegram/verify', { challengeId: third.challengeId, browserSecret: third.browserSecret, code: otp, password: 'correct-horse-staple' }, now + 120_000);
  assert.match(signedIn.user.id, /^phone:/);
  assert.equal(signedIn.user.name, 'Анна');
  assert.equal((await resolveAccountSession(new Request('https://example.com', { headers: { Authorization: `Bearer ${signedIn.token}` } }), f.env, now + 120_000)).id, signedIn.user.id);
  await assert.rejects(f.call('telegram/verify', { challengeId: third.challengeId, browserSecret: third.browserSecret, code: otp, password: 'correct-horse-staple' }, now + 120_000), { statusCode: 410 });
  const passwordLogin = await f.call('password/login', { identifier: '+79991234567', password: 'correct-horse-staple' }, now + 120_001);
  assert.equal(passwordLogin.user.id, signedIn.user.id);
  const aliasLogin = await f.call('password/login', { identifier: '@anna_test', password: 'correct-horse-staple' }, now + 120_001);
  assert.equal(aliasLogin.user.id, signedIn.user.id);
  await assert.rejects(f.call('password/login', { identifier: '+79991234567', password: 'wrong-password' }, now + 120_002), { statusCode: 401 });

  const reset = await f.call('telegram/start', { phone: '+79991234567' }, now + 180_000);
  await f.webhook({ text: `/start ${new URL(reset.botUrl).searchParams.get('start')}` }, now + 180_000);
  await f.webhook({ contact: { user_id: 123, phone_number: '+79991234567' } }, now + 180_000);
  const resetCode = f.messages.at(-1).text.match(/Код входа в Вордик: (\d{6})/)[1];
  const recovered = await f.call('telegram/verify', { challengeId: reset.challengeId, browserSecret: reset.browserSecret,
    code: resetCode, password: 'new-password-123' }, now + 180_000);
  assert.equal(recovered.user.id, signedIn.user.id);
  await assert.rejects(f.call('password/login', { identifier: '+79991234567', password: 'correct-horse-staple' }, now + 180_001), { statusCode: 401 });
  assert.equal((await f.call('password/login', { identifier: '+79991234567', password: 'new-password-123' }, now + 180_002)).user.id, signedIn.user.id);
});
