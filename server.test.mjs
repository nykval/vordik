import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { createVordikServer, verifyTelegramInitData } from './server.mjs';

async function withServer(run) {
  const directory = await mkdtemp(join(tmpdir(), 'vordik-ratings-'));
  const ratingsFile = join(directory, 'ratings.json');
  const server = createVordikServer({ ratingsFile, allowGuestRatings: true });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const { port } = server.address();
  const baseUrl = `http://127.0.0.1:${port}`;
  try {
    await run({ baseUrl, ratingsFile });
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await rm(directory, { recursive: true, force: true });
  }
}

async function syncPlayer(baseUrl, values) {
  return fetch(`${baseUrl}/api/ratings/sync`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: baseUrl },
    body: JSON.stringify(values),
  });
}

test('rating server stores users and orders the leaderboard', async () => {
  await withServer(async ({ baseUrl, ratingsFile }) => {
    const health = await fetch(`${baseUrl}/api/health`);
    assert.deepEqual(await health.json(), { ok: true });

    const aliceResponse = await syncPlayer(baseUrl, {
      guestId: 'alice-user-1', name: 'Алиса', score: 120, vocabularySize: 30,
    });
    assert.equal(aliceResponse.status, 200);
    const alice = await aliceResponse.json();
    assert.equal(alice.player.rank, 1);
    assert.equal(alice.player.isMe, true);

    const bobResponse = await syncPlayer(baseUrl, {
      guestId: 'bob-user-0001', name: 'Борис', score: 250, vocabularySize: 20,
    });
    assert.equal(bobResponse.status, 200);
    const bob = await bobResponse.json();
    assert.equal(bob.player.rank, 1);
    assert.deepEqual(bob.leaders.map((entry) => entry.name), ['Борис', 'Алиса']);

    const promotedResponse = await syncPlayer(baseUrl, {
      guestId: 'alice-user-1', name: 'Алиса', score: 300, vocabularySize: 31,
    });
    const promoted = await promotedResponse.json();
    assert.equal(promoted.player.rank, 1);
    assert.equal(promoted.totalPlayers, 2);

    const publicResponse = await fetch(`${baseUrl}/api/ratings?limit=1`);
    const publicRating = await publicResponse.json();
    assert.equal(publicRating.leaders.length, 1);
    assert.equal(publicRating.leaders[0].name, 'Алиса');
    assert.equal('id' in publicRating.leaders[0], false);

    const stored = JSON.parse(await readFile(ratingsFile, 'utf8'));
    assert.equal(Object.keys(stored.users).length, 2);
  });
});

test('rating server validates input and rejects foreign origins', async () => {
  await withServer(async ({ baseUrl }) => {
    const invalid = await syncPlayer(baseUrl, {
      guestId: 'invalid-user', name: 'Игрок', score: -1, vocabularySize: 0,
    });
    assert.equal(invalid.status, 400);

    const impossible = await syncPlayer(baseUrl, {
      guestId: 'invalid-user', name: 'Игрок', score: 61, vocabularySize: 1,
    });
    assert.equal(impossible.status, 400);

    const foreign = await fetch(`${baseUrl}/api/ratings`, { headers: { Origin: 'https://example.com' } });
    assert.equal(foreign.status, 403);
  });
});

test('Telegram Mini App identity is verified cryptographically', () => {
  const botToken = '123456:local-test-token';
  const now = Math.floor(Date.now() / 1000);
  const params = new URLSearchParams({
    auth_date: String(now),
    query_id: 'test-query',
    signature: 'new-telegram-signature-field',
    user: JSON.stringify({ id: 42, first_name: 'Анна', last_name: 'Иванова' }),
  });
  const dataCheckString = [...params.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');
  const secretKey = createHmac('sha256', 'WebAppData').update(botToken).digest();
  params.set('hash', createHmac('sha256', secretKey).update(dataCheckString).digest('hex'));

  assert.deepEqual(verifyTelegramInitData(params.toString(), botToken, now), {
    id: 'telegram:42',
    name: 'Анна Иванова',
  });
  params.set('hash', '0'.repeat(64));
  assert.equal(verifyTelegramInitData(params.toString(), botToken, now), null);
});
