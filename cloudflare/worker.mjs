const MAX_BODY_BYTES = 16 * 1024;
const MAX_RATING_SCORE = 10_000_000;
const MAX_VOCABULARY_SIZE = 100_000;
const MAX_SCORE_PER_WORD = 60;
const TELEGRAM_AUTH_MAX_AGE_SECONDS = 7 * 24 * 60 * 60;
const encoder = new TextEncoder();

function httpError(message, statusCode) {
  return Object.assign(new Error(message), { statusCode });
}

function json(body, status = 200, headers = {}) {
  return Response.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store', ...headers },
  });
}

function cleanName(value) {
  const name = String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, '').trim().replace(/\s+/g, ' ');
  return name.slice(0, 80) || 'Пользователь Вордик';
}

function integerInRange(value, min, max, field) {
  const number = Number(value);
  if (!Number.isFinite(number) || !Number.isInteger(number) || number < min || number > max) {
    throw httpError(`Некорректное поле: ${field}`, 400);
  }
  return number;
}

function corsHeaders(request, env) {
  const origin = request.headers.get('Origin');
  if (!origin) return {};
  const allowedOrigins = String(env.ALLOWED_ORIGIN ?? '')
    .split(',')
    .map((item) => item.trim().replace(/\/$/, ''))
    .filter(Boolean);
  if (!allowedOrigins.includes(origin.replace(/\/$/, ''))) {
    throw httpError('Этот источник не разрешён', 403);
  }
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

function bytesFromHex(value) {
  if (!/^[a-f\d]{64}$/i.test(value)) return null;
  return Uint8Array.from(value.match(/.{2}/g), (byte) => Number.parseInt(byte, 16));
}

async function hmacSha256(keyBytes, data) {
  const key = await crypto.subtle.importKey(
    'raw',
    keyBytes,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(data)));
}

function safeEqual(left, right) {
  if (!left || left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) difference |= left[index] ^ right[index];
  return difference === 0;
}

export async function verifyTelegramInitData(initData, botToken, nowSeconds = Math.floor(Date.now() / 1000)) {
  if (!initData || !botToken) return null;
  const params = new URLSearchParams(initData);
  const receivedHash = bytesFromHex(params.get('hash') ?? '');
  const authDate = Number(params.get('auth_date'));
  if (!receivedHash || !Number.isFinite(authDate)) return null;
  if (authDate > nowSeconds + 60 || nowSeconds - authDate > TELEGRAM_AUTH_MAX_AGE_SECONDS) return null;

  const dataCheckString = [...params.entries()]
    .filter(([key]) => key !== 'hash' && key !== 'signature')
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');
  const secretKey = await hmacSha256(encoder.encode('WebAppData'), botToken);
  const calculatedHash = await hmacSha256(secretKey, dataCheckString);
  if (!safeEqual(receivedHash, calculatedHash)) return null;

  try {
    const user = JSON.parse(params.get('user') ?? 'null');
    if (!user || !Number.isSafeInteger(Number(user.id))) return null;
    return {
      id: `telegram:${user.id}`,
      name: cleanName([user.first_name, user.last_name].filter(Boolean).join(' ')),
    };
  } catch {
    return null;
  }
}

async function resolveIdentity(payload, env) {
  const telegramIdentity = await verifyTelegramInitData(payload.telegramInitData, env.BOT_TOKEN);
  if (telegramIdentity) return telegramIdentity;
  if (payload.telegramInitData && env.BOT_TOKEN) {
    throw httpError('Не удалось подтвердить Telegram-профиль', 401);
  }
  if (String(env.ALLOW_GUEST_RATINGS) !== 'true') {
    throw httpError('Рейтинг доступен только внутри Telegram', 401);
  }
  const guestId = String(payload.guestId ?? '');
  if (!/^[a-zA-Z0-9_-]{8,100}$/.test(guestId)) throw httpError('Не удалось определить пользователя', 400);
  return { id: `guest:${guestId}`, name: cleanName(payload.name) };
}

async function readJsonBody(request) {
  const contentLength = Number(request.headers.get('Content-Length'));
  if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) throw httpError('Слишком большой запрос', 413);
  const source = await request.text();
  if (encoder.encode(source).byteLength > MAX_BODY_BYTES) throw httpError('Слишком большой запрос', 413);
  try { return JSON.parse(source || '{}'); } catch { throw httpError('Некорректный JSON', 400); }
}

function publicPlayer(row, rank, currentUserId = '') {
  return {
    rank,
    name: row.name,
    score: Number(row.score),
    vocabularySize: Number(row.vocabulary_size),
    updatedAt: row.updated_at,
    isMe: row.user_id === currentUserId,
  };
}

async function listLeaderboard(database, limit, currentUserId = '') {
  const { results } = await database.prepare(`
    SELECT user_id, name, score, vocabulary_size, updated_at
    FROM ratings
    ORDER BY score DESC, vocabulary_size DESC, name ASC, user_id ASC
    LIMIT ?
  `).bind(limit).all();
  return results.map((row, index) => publicPlayer(row, index + 1, currentUserId));
}

async function upsertRating(database, identity, score, vocabularySize) {
  await database.prepare(`
    INSERT INTO ratings (user_id, name, score, vocabulary_size, created_at, updated_at)
    VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    ON CONFLICT(user_id) DO UPDATE SET
      name = excluded.name,
      score = excluded.score,
      vocabulary_size = excluded.vocabulary_size,
      updated_at = CURRENT_TIMESTAMP
  `).bind(identity.id, identity.name, score, vocabularySize).run();

  const [current, rankRow, totalRow, leaders] = await Promise.all([
    database.prepare(`
      SELECT user_id, name, score, vocabulary_size, updated_at
      FROM ratings WHERE user_id = ?
    `).bind(identity.id).first(),
    database.prepare(`
      SELECT COUNT(*) AS higher
      FROM ratings AS candidate
      JOIN ratings AS current_user ON current_user.user_id = ?
      WHERE candidate.score > current_user.score
         OR (candidate.score = current_user.score AND candidate.vocabulary_size > current_user.vocabulary_size)
         OR (candidate.score = current_user.score AND candidate.vocabulary_size = current_user.vocabulary_size AND candidate.name < current_user.name)
         OR (candidate.score = current_user.score AND candidate.vocabulary_size = current_user.vocabulary_size AND candidate.name = current_user.name AND candidate.user_id < current_user.user_id)
    `).bind(identity.id).first(),
    database.prepare('SELECT COUNT(*) AS total FROM ratings').first(),
    listLeaderboard(database, 20, identity.id),
  ]);
  const rank = Number(rankRow?.higher ?? 0) + 1;
  return {
    player: publicPlayer(current, rank, identity.id),
    totalPlayers: Number(totalRow?.total ?? 0),
    leaders,
  };
}

async function handleApi(request, env) {
  const url = new URL(request.url);
  const headers = corsHeaders(request, env);
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
  if (!env.DB) throw httpError('База рейтинга не подключена', 500);

  if (url.pathname === '/api/health' && request.method === 'GET') {
    return json({ ok: true, service: 'vordik-ratings' }, 200, headers);
  }
  if (url.pathname === '/api/ratings' && request.method === 'GET') {
    const limit = Math.min(100, Math.max(1, Number.parseInt(url.searchParams.get('limit') ?? '50', 10) || 50));
    const leaders = await listLeaderboard(env.DB, limit);
    return json({ leaders }, 200, headers);
  }
  if (url.pathname === '/api/ratings/sync' && request.method === 'POST') {
    const payload = await readJsonBody(request);
    const identity = await resolveIdentity(payload, env);
    const score = integerInRange(payload.score, 0, MAX_RATING_SCORE, 'score');
    const vocabularySize = integerInRange(payload.vocabularySize, 0, MAX_VOCABULARY_SIZE, 'vocabularySize');
    if (score > vocabularySize * MAX_SCORE_PER_WORD) {
      throw httpError('Количество баллов не соответствует размеру словаря', 400);
    }
    return json(await upsertRating(env.DB, identity, score, vocabularySize), 200, headers);
  }
  return json({ error: 'API method not found' }, 404, headers);
}

export default {
  async fetch(request, env) {
    try {
      const url = new URL(request.url);
      if (url.pathname.startsWith('/api/')) return await handleApi(request, env);
      return json({ ok: true, service: 'vordik-ratings', health: '/api/health' });
    } catch (error) {
      const status = Number(error?.statusCode) || 500;
      if (status >= 500) console.error(error);
      let headers = {};
      try { headers = corsHeaders(request, env); } catch { /* A rejected origin gets no CORS header. */ }
      return json({ error: status >= 500 ? 'Внутренняя ошибка сервера' : error.message }, status, headers);
    }
  },
};
