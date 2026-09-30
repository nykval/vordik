import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import test from 'node:test';
import { verifyTelegramInitData } from './worker.mjs';

test('Cloudflare Worker verifies Telegram Mini App identity', async () => {
  const botToken = '123456:cloudflare-test-token';
  const now = Math.floor(Date.now() / 1000);
  const params = new URLSearchParams({
    auth_date: String(now),
    query_id: 'cloudflare-test',
    user: JSON.stringify({ id: 314, first_name: 'Анна', last_name: 'Иванова' }),
  });
  const dataCheckString = [...params.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');
  const secretKey = createHmac('sha256', 'WebAppData').update(botToken).digest();
  params.set('hash', createHmac('sha256', secretKey).update(dataCheckString).digest('hex'));

  assert.deepEqual(await verifyTelegramInitData(params.toString(), botToken, now), {
    id: 'telegram:314',
    name: 'Анна Иванова',
  });
  params.set('hash', 'f'.repeat(64));
  assert.equal(await verifyTelegramInitData(params.toString(), botToken, now), null);
});
