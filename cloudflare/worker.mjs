export { WordChainGame } from './word-chain-game.mjs';

const MAX_BODY_BYTES = 16 * 1024;
const MAX_RATING_SCORE = 10_000_000;
const MAX_VOCABULARY_SIZE = 100_000;
const MAX_SCORE_PER_WORD = 6;
const TELEGRAM_AUTH_MAX_AGE_SECONDS = 7 * 24 * 60 * 60;
const AVATAR_IDS = Object.freeze([
  'avatar-blond-green',
  'avatar-bob-blue',
  'avatar-bun-pink',
  'avatar-cat',
  'avatar-curly-yellow',
  'avatar-dog',
  'avatar-frog',
  'avatar-panda',
  'avatar-rabbit',
  'avatar-short-hair-cyan',
]);
const avatarIds = new Set(AVATAR_IDS);
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

function defaultAvatarId(userId) {
  let hash = 2166136261;
  for (const character of String(userId)) {
    hash ^= character.codePointAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return AVATAR_IDS[(hash >>> 0) % AVATAR_IDS.length];
}

function cleanAvatarId(value, userId) {
  const avatarId = String(value ?? '').trim();
  if (!avatarId) return defaultAvatarId(userId);
  if (!avatarIds.has(avatarId)) throw httpError('Некорректный аватар', 400);
  return avatarId;
}

function corsHeaders(request, env) {
  const origin = request.headers.get('Origin');
  if (!origin) return {};
  const requestOrigin = new URL(request.url).origin;
  const allowedOrigins = String(env.ALLOWED_ORIGINS ?? env.ALLOWED_ORIGIN ?? '')
    .split(',')
    .map((item) => item.trim().replace(/\/$/, ''))
    .filter(Boolean);
  if (origin.replace(/\/$/, '') !== requestOrigin && !allowedOrigins.includes(origin.replace(/\/$/, ''))) {
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

const FRIEND_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function secureToken(bytes = 18) {
  const values = crypto.getRandomValues(new Uint8Array(bytes));
  return [...values].map((value) => value.toString(16).padStart(2, '0')).join('');
}

function generateFriendCode() {
  const values = crypto.getRandomValues(new Uint8Array(5));
  return [...values].map((value) => FRIEND_CODE_ALPHABET[value % FRIEND_CODE_ALPHABET.length]).join('');
}

function normalizeFriendCode(value) {
  return String(value ?? '').trim().replace(/^#/, '').toUpperCase();
}

function friendshipPair(left, right) {
  return left < right ? [left, right] : [right, left];
}

function socialPlayer(row) {
  return {
    id: row.user_id,
    name: row.name,
    avatarId: avatarIds.has(row.avatar_id) ? row.avatar_id : defaultAvatarId(row.user_id),
    avatarCustomized: Number(row.avatar_customized) === 1,
  };
}

async function sha256Hex(value) {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(value)));
  return [...digest].map((byte) => byte.toString(16).padStart(2, '0')).join('');
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
    .filter(([key]) => key !== 'hash')
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
  const avatarCustomized = Number(row.avatar_customized) === 1;
  return {
    rank,
    name: row.name,
    avatarId: avatarIds.has(row.avatar_id) ? row.avatar_id : defaultAvatarId(row.user_id),
    avatarCustomized,
    score: Number(row.score),
    vocabularySize: Number(row.vocabulary_size),
    averageDifficulty: Number(row.average_difficulty),
    updatedAt: row.updated_at,
    isMe: row.user_id === currentUserId,
  };
}

async function listLeaderboard(database, limit, currentUserId = '') {
  const { results } = await database.prepare(`
    SELECT user_id, name, avatar_id, avatar_customized, score, vocabulary_size, average_difficulty, updated_at
    FROM ratings
    ORDER BY score DESC, vocabulary_size DESC, name ASC, user_id ASC
    LIMIT ?
  `).bind(limit).all();
  return results.map((row, index) => publicPlayer(row, index + 1, currentUserId));
}

async function upsertRating(database, identity, avatarId, avatarCustomized, score, vocabularySize, averageDifficulty) {
  await database.prepare(`
    INSERT INTO ratings (user_id, name, avatar_id, avatar_customized, score, vocabulary_size, average_difficulty, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    ON CONFLICT(user_id) DO UPDATE SET
      name = excluded.name,
      avatar_id = CASE
        WHEN ratings.avatar_customized = 1 AND ? = 0 THEN ratings.avatar_id
        ELSE excluded.avatar_id
      END,
      avatar_customized = CASE WHEN ? = 1 THEN 1 ELSE ratings.avatar_customized END,
      score = excluded.score,
      vocabulary_size = excluded.vocabulary_size,
      average_difficulty = excluded.average_difficulty,
      updated_at = CURRENT_TIMESTAMP
  `).bind(
    identity.id,
    identity.name,
    avatarId,
    avatarCustomized ? 1 : 0,
    score,
    vocabularySize,
    averageDifficulty,
    avatarCustomized ? 1 : 0,
    avatarCustomized ? 1 : 0,
  ).run();

  const [current, rankRow, totalRow, leaders] = await Promise.all([
    database.prepare(`
      SELECT user_id, name, avatar_id, avatar_customized, score, vocabulary_size, average_difficulty, updated_at
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

async function ensureSocialProfile(database, identity, payload) {
  const avatarId = cleanAvatarId(payload.avatarId, identity.id);
  const customizeAvatar = payload.avatarCustomized === true;
  await database.prepare(`
    INSERT INTO ratings (
      user_id, name, avatar_id, avatar_customized, score, vocabulary_size, average_difficulty, created_at, updated_at
    ) VALUES (?, ?, ?, ?, 0, 0, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    ON CONFLICT(user_id) DO UPDATE SET
      name = excluded.name,
      avatar_id = CASE
        WHEN ratings.avatar_customized = 1 AND ? = 0 THEN ratings.avatar_id
        ELSE excluded.avatar_id
      END,
      avatar_customized = CASE WHEN ? = 1 THEN 1 ELSE ratings.avatar_customized END,
      updated_at = CURRENT_TIMESTAMP
  `).bind(
    identity.id,
    identity.name,
    avatarId,
    customizeAvatar ? 1 : 0,
    customizeAvatar ? 1 : 0,
    customizeAvatar ? 1 : 0,
  ).run();

  let profile = await database.prepare(`
    SELECT user_id, name, avatar_id, avatar_customized, friend_code, friend_invite_token
    FROM ratings WHERE user_id = ?
  `).bind(identity.id).first();

  if (!profile?.friend_code) {
    for (let attempt = 0; attempt < 12 && !profile?.friend_code; attempt += 1) {
      try {
        await database.prepare(`
          UPDATE ratings SET friend_code = ? WHERE user_id = ? AND friend_code IS NULL
        `).bind(generateFriendCode(), identity.id).run();
      } catch { /* A rare collision gets another secure code. */ }
      profile = await database.prepare(`
        SELECT user_id, name, avatar_id, avatar_customized, friend_code, friend_invite_token
        FROM ratings WHERE user_id = ?
      `).bind(identity.id).first();
    }
  }
  if (!profile?.friend_code) throw httpError('Не удалось создать код пользователя', 503);

  if (!profile.friend_invite_token) {
    for (let attempt = 0; attempt < 4 && !profile?.friend_invite_token; attempt += 1) {
      try {
        await database.prepare(`
          UPDATE ratings SET friend_invite_token = ? WHERE user_id = ? AND friend_invite_token IS NULL
        `).bind(secureToken(), identity.id).run();
      } catch { /* Retry an exceptionally unlikely collision. */ }
      profile = await database.prepare(`
        SELECT user_id, name, avatar_id, avatar_customized, friend_code, friend_invite_token
        FROM ratings WHERE user_id = ?
      `).bind(identity.id).first();
    }
  }
  if (!profile?.friend_invite_token) throw httpError('Не удалось создать ссылку-приглашение', 503);
  return profile;
}

async function authenticateSocialRequest(request, env) {
  const payload = await readJsonBody(request);
  const identity = await resolveIdentity(payload, env);
  const profile = await ensureSocialProfile(env.DB, identity, payload);
  return { payload, identity, profile };
}

async function socialState(database, identity, profile, request, env) {
  const [friendsResult, incomingResult, outgoingResult, gameInvitesResult, gamesResult] = await Promise.all([
    database.prepare(`
      SELECT r.user_id, r.name, r.avatar_id, r.avatar_customized, f.created_at
      FROM friendships AS f
      JOIN ratings AS r ON r.user_id = CASE WHEN f.user_a = ? THEN f.user_b ELSE f.user_a END
      WHERE f.user_a = ? OR f.user_b = ?
      ORDER BY r.name COLLATE NOCASE ASC
    `).bind(identity.id, identity.id, identity.id).all(),
    database.prepare(`
      SELECT r.user_id, r.name, r.avatar_id, r.avatar_customized, fr.created_at
      FROM friend_requests AS fr
      JOIN ratings AS r ON r.user_id = fr.requester_id
      WHERE fr.addressee_id = ?
      ORDER BY fr.created_at DESC
    `).bind(identity.id).all(),
    database.prepare(`
      SELECT r.user_id, r.name, r.avatar_id, r.avatar_customized, fr.created_at
      FROM friend_requests AS fr
      JOIN ratings AS r ON r.user_id = fr.addressee_id
      WHERE fr.requester_id = ?
      ORDER BY fr.created_at DESC
    `).bind(identity.id).all(),
    database.prepare(`
      SELECT gi.id, gi.created_at, r.user_id, r.name, r.avatar_id, r.avatar_customized
      FROM game_invites AS gi
      JOIN ratings AS r ON r.user_id = gi.inviter_id
      WHERE gi.invitee_id = ? AND gi.status = 'pending'
      ORDER BY gi.created_at DESC
    `).bind(identity.id).all(),
    database.prepare(`
      SELECT g.id, g.status, g.winner_id, g.finish_reason, g.created_at,
             r.user_id, r.name, r.avatar_id, r.avatar_customized
      FROM games AS g
      JOIN ratings AS r ON r.user_id = CASE WHEN g.player_one_id = ? THEN g.player_two_id ELSE g.player_one_id END
      WHERE g.player_one_id = ? OR g.player_two_id = ?
      ORDER BY g.created_at DESC
      LIMIT 12
    `).bind(identity.id, identity.id, identity.id).all(),
  ]);
  const appUrl = String(env.PUBLIC_APP_URL ?? '').trim().replace(/\/$/, '') || new URL(request.url).origin;
  const botUsername = String(env.TELEGRAM_BOT_USERNAME ?? '').trim().replace(/^@/, '');
  const inviteStartParam = `friend_${profile.friend_invite_token}`;
  const inviteUrl = botUsername
    ? `https://t.me/${encodeURIComponent(botUsername)}?startapp=${encodeURIComponent(inviteStartParam)}`
    : `${appUrl}/?friendInvite=${encodeURIComponent(profile.friend_invite_token)}`;
  return {
    me: {
      ...socialPlayer(profile),
      friendCode: `#${profile.friend_code}`,
      inviteUrl,
    },
    friends: friendsResult.results.map((row) => ({ ...socialPlayer(row), friendsSince: row.created_at })),
    incomingRequests: incomingResult.results.map((row) => ({ ...socialPlayer(row), createdAt: row.created_at })),
    outgoingRequests: outgoingResult.results.map((row) => ({ ...socialPlayer(row), createdAt: row.created_at })),
    gameInvites: gameInvitesResult.results.map((row) => ({
      id: row.id,
      from: socialPlayer(row),
      createdAt: row.created_at,
    })),
    games: gamesResult.results.map((row) => ({
      id: row.id,
      status: row.status,
      winnerId: row.winner_id,
      finishReason: row.finish_reason,
      createdAt: row.created_at,
      opponent: socialPlayer(row),
    })),
  };
}

async function createFriendship(database, leftId, rightId) {
  const [userA, userB] = friendshipPair(leftId, rightId);
  await database.batch([
    database.prepare('INSERT OR IGNORE INTO friendships (user_a, user_b) VALUES (?, ?)').bind(userA, userB),
    database.prepare(`
      DELETE FROM friend_requests
      WHERE (requester_id = ? AND addressee_id = ?) OR (requester_id = ? AND addressee_id = ?)
    `).bind(leftId, rightId, rightId, leftId),
  ]);
}

async function connectToWordChain(request, env, url) {
  if (!env.WORD_CHAIN_GAMES) throw httpError('Игровые комнаты не подключены', 503);
  if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') {
    throw httpError('Ожидается WebSocket-подключение', 426);
  }
  const match = url.pathname.match(/^\/api\/games\/([a-f\d-]{20,80})\/ws$/i);
  const gameId = match?.[1] ?? '';
  const token = url.searchParams.get('token') ?? '';
  if (!gameId || !/^[a-f\d]{36,80}$/i.test(token)) throw httpError('Некорректное подключение к игре', 401);
  const tokenHash = await sha256Hex(token);
  const connection = await env.DB.prepare(`
    SELECT game_id, user_id FROM game_connection_tokens
    WHERE token_hash = ? AND game_id = ? AND expires_at >= ?
  `).bind(tokenHash, gameId, Date.now()).first();
  if (!connection) throw httpError('Ссылка на игру устарела', 401);
  const deletion = await env.DB.prepare('DELETE FROM game_connection_tokens WHERE token_hash = ?').bind(tokenHash).run();
  if (Number(deletion.meta?.changes ?? 0) !== 1) throw httpError('Ссылка на игру уже использована', 401);

  const game = await env.DB.prepare(`
    SELECT g.id, g.player_one_id, g.player_two_id, p1.name AS player_one_name, p2.name AS player_two_name
    FROM games AS g
    JOIN ratings AS p1 ON p1.user_id = g.player_one_id
    JOIN ratings AS p2 ON p2.user_id = g.player_two_id
    WHERE g.id = ? AND g.status IN ('waiting', 'active')
  `).bind(gameId).first();
  if (!game || (connection.user_id !== game.player_one_id && connection.user_id !== game.player_two_id)) {
    throw httpError('Игра не найдена', 404);
  }

  const durableId = env.WORD_CHAIN_GAMES.idFromName(gameId);
  const room = env.WORD_CHAIN_GAMES.get(durableId);
  await room.initialize({
    gameId,
    playerOne: { id: game.player_one_id, name: game.player_one_name },
    playerTwo: { id: game.player_two_id, name: game.player_two_name },
  });
  const trustedRequest = new Request(request);
  trustedRequest.headers.set('X-Vordik-User-Id', connection.user_id);
  return room.fetch(trustedRequest);
}

async function proxyAudioRequest(request, env, headers) {
  const serviceBase = String(env.AUDIO_SERVICE_URL ?? '').trim().replace(/\/+$/, '');
  if (!serviceBase) throw httpError('Сервис генерации аудио не подключён', 503);
  const sourceUrl = new URL(request.url);
  const targetUrl = new URL(`${sourceUrl.pathname}${sourceUrl.search}`, `${serviceBase}/`);
  const proxyHeaders = new Headers();
  const contentType = request.headers.get('Content-Type');
  if (contentType) proxyHeaders.set('Content-Type', contentType);
  if (env.AUDIO_SERVICE_SECRET) proxyHeaders.set('X-Vordik-Audio-Secret', String(env.AUDIO_SERVICE_SECRET));
  const result = await fetch(targetUrl, {
    method: request.method,
    headers: proxyHeaders,
    body: request.method === 'GET' || request.method === 'HEAD' ? undefined : request.body,
  });
  const responseHeaders = new Headers(result.headers);
  Object.entries(headers).forEach(([name, value]) => responseHeaders.set(name, value));
  responseHeaders.set('Cache-Control', 'no-store');
  return new Response(result.body, { status: result.status, headers: responseHeaders });
}

async function handleApi(request, env) {
  const url = new URL(request.url);
  const headers = corsHeaders(request, env);
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
  if (url.pathname === '/api/audio/generate' || url.pathname === '/api/audio/status') {
    return proxyAudioRequest(request, env, headers);
  }
  if (!env.DB) throw httpError('База рейтинга не подключена', 500);

  if (/^\/api\/games\/[a-f\d-]{20,80}\/ws$/i.test(url.pathname) && request.method === 'GET') {
    return connectToWordChain(request, env, url);
  }

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
    const avatarId = cleanAvatarId(payload.avatarId, identity.id);
    const score = integerInRange(payload.score, 0, MAX_RATING_SCORE, 'score');
    const vocabularySize = integerInRange(payload.vocabularySize, 0, MAX_VOCABULARY_SIZE, 'vocabularySize');
    const averageDifficulty = integerInRange(payload.averageDifficulty ?? 0, 0, 6, 'averageDifficulty');
    if (score > vocabularySize * MAX_SCORE_PER_WORD) {
      throw httpError('Количество баллов не соответствует размеру словаря', 400);
    }
    return json(await upsertRating(
      env.DB,
      identity,
      avatarId,
      payload.avatarCustomized === true,
      score,
      vocabularySize,
      averageDifficulty,
    ), 200, headers);
  }

  if (url.pathname === '/api/social/state' && request.method === 'POST') {
    const { identity, profile } = await authenticateSocialRequest(request, env);
    return json(await socialState(env.DB, identity, profile, request, env), 200, headers);
  }

  if (url.pathname === '/api/friends/request' && request.method === 'POST') {
    const { payload, identity } = await authenticateSocialRequest(request, env);
    const friendCode = normalizeFriendCode(payload.friendCode);
    if (!/^[A-Z2-9]{5}$/.test(friendCode)) throw httpError('Введите код из пяти букв или цифр', 400);
    const target = await env.DB.prepare('SELECT user_id, name FROM ratings WHERE friend_code = ?').bind(friendCode).first();
    if (!target) throw httpError('Пользователь с таким кодом не найден', 404);
    if (target.user_id === identity.id) throw httpError('Нельзя добавить в друзья самого себя', 400);
    const [userA, userB] = friendshipPair(identity.id, target.user_id);
    if (await env.DB.prepare('SELECT 1 AS found FROM friendships WHERE user_a = ? AND user_b = ?').bind(userA, userB).first()) {
      return json({ ok: true, message: 'Вы уже друзья' }, 200, headers);
    }
    if (await env.DB.prepare(`
      SELECT 1 AS found FROM friend_requests WHERE requester_id = ? AND addressee_id = ?
    `).bind(target.user_id, identity.id).first()) {
      throw httpError('У вас уже есть входящая заявка от этого пользователя', 409);
    }
    await env.DB.prepare(`
      INSERT OR IGNORE INTO friend_requests (requester_id, addressee_id) VALUES (?, ?)
    `).bind(identity.id, target.user_id).run();
    return json({ ok: true, message: `Заявка для ${target.name} отправлена` }, 200, headers);
  }

  if (url.pathname === '/api/friends/respond' && request.method === 'POST') {
    const { payload, identity } = await authenticateSocialRequest(request, env);
    const requesterId = String(payload.requesterId ?? '');
    const action = String(payload.action ?? '');
    const pending = await env.DB.prepare(`
      SELECT 1 AS found FROM friend_requests WHERE requester_id = ? AND addressee_id = ?
    `).bind(requesterId, identity.id).first();
    if (!pending) throw httpError('Заявка уже обработана', 404);
    if (action === 'accept') await createFriendship(env.DB, identity.id, requesterId);
    else if (action === 'reject') {
      await env.DB.prepare('DELETE FROM friend_requests WHERE requester_id = ? AND addressee_id = ?')
        .bind(requesterId, identity.id).run();
    } else throw httpError('Некорректное действие', 400);
    return json({ ok: true }, 200, headers);
  }

  if (url.pathname === '/api/friends/remove' && request.method === 'POST') {
    const { payload, identity } = await authenticateSocialRequest(request, env);
    const friendId = String(payload.friendId ?? '');
    const [userA, userB] = friendshipPair(identity.id, friendId);
    await env.DB.prepare('DELETE FROM friendships WHERE user_a = ? AND user_b = ?').bind(userA, userB).run();
    return json({ ok: true }, 200, headers);
  }

  if (url.pathname === '/api/friends/invite/accept' && request.method === 'POST') {
    const { payload, identity } = await authenticateSocialRequest(request, env);
    const inviteToken = String(payload.inviteToken ?? '');
    if (!/^[a-f\d]{36}$/i.test(inviteToken)) throw httpError('Некорректная ссылка-приглашение', 400);
    const inviter = await env.DB.prepare(`
      SELECT user_id, name FROM ratings WHERE friend_invite_token = ?
    `).bind(inviteToken).first();
    if (!inviter) throw httpError('Ссылка-приглашение больше не действует', 404);
    if (inviter.user_id === identity.id) throw httpError('Это ваша собственная ссылка', 400);
    await createFriendship(env.DB, identity.id, inviter.user_id);
    return json({ ok: true, friendName: inviter.name }, 200, headers);
  }

  if (url.pathname === '/api/games/invite' && request.method === 'POST') {
    const { payload, identity } = await authenticateSocialRequest(request, env);
    const friendId = String(payload.friendId ?? '');
    const [userA, userB] = friendshipPair(identity.id, friendId);
    const friendship = await env.DB.prepare('SELECT 1 AS found FROM friendships WHERE user_a = ? AND user_b = ?')
      .bind(userA, userB).first();
    if (!friendship) throw httpError('Играть можно только с другом', 403);
    const existing = await env.DB.prepare(`
      SELECT id FROM game_invites
      WHERE status = 'pending' AND ((inviter_id = ? AND invitee_id = ?) OR (inviter_id = ? AND invitee_id = ?))
      LIMIT 1
    `).bind(identity.id, friendId, friendId, identity.id).first();
    if (existing) throw httpError('Между вами уже есть приглашение в игру', 409);
    const inviteId = crypto.randomUUID();
    await env.DB.prepare(`
      INSERT INTO game_invites (id, inviter_id, invitee_id) VALUES (?, ?, ?)
    `).bind(inviteId, identity.id, friendId).run();
    return json({ ok: true, inviteId }, 200, headers);
  }

  if (url.pathname === '/api/games/respond' && request.method === 'POST') {
    const { payload, identity } = await authenticateSocialRequest(request, env);
    const inviteId = String(payload.inviteId ?? '');
    const action = String(payload.action ?? '');
    const invitation = await env.DB.prepare(`
      SELECT id, inviter_id, invitee_id FROM game_invites
      WHERE id = ? AND invitee_id = ? AND status = 'pending'
    `).bind(inviteId, identity.id).first();
    if (!invitation) throw httpError('Приглашение уже обработано', 404);
    if (action === 'reject') {
      await env.DB.prepare(`
        UPDATE game_invites SET status = 'rejected', updated_at = CURRENT_TIMESTAMP WHERE id = ? AND status = 'pending'
      `).bind(inviteId).run();
      return json({ ok: true }, 200, headers);
    }
    if (action !== 'accept') throw httpError('Некорректное действие', 400);
    const gameId = crypto.randomUUID();
    await env.DB.batch([
      env.DB.prepare(`
        INSERT INTO games (id, player_one_id, player_two_id) VALUES (?, ?, ?)
      `).bind(gameId, invitation.inviter_id, invitation.invitee_id),
      env.DB.prepare(`
        UPDATE game_invites
        SET status = 'accepted', game_id = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND status = 'pending'
      `).bind(gameId, inviteId),
    ]);
    return json({ ok: true, gameId }, 200, headers);
  }

  const connectMatch = url.pathname.match(/^\/api\/games\/([a-f\d-]{20,80})\/connect$/i);
  if (connectMatch && request.method === 'POST') {
    const { identity } = await authenticateSocialRequest(request, env);
    const gameId = connectMatch[1];
    const game = await env.DB.prepare(`
      SELECT id FROM games
      WHERE id = ? AND status IN ('waiting', 'active') AND (player_one_id = ? OR player_two_id = ?)
    `).bind(gameId, identity.id, identity.id).first();
    if (!game) throw httpError('Активная игра не найдена', 404);
    const token = `${crypto.randomUUID().replaceAll('-', '')}${secureToken(2)}`;
    const tokenHash = await sha256Hex(token);
    await env.DB.batch([
      env.DB.prepare('DELETE FROM game_connection_tokens WHERE expires_at < ?').bind(Date.now()),
      env.DB.prepare(`
        INSERT INTO game_connection_tokens (token_hash, game_id, user_id, expires_at) VALUES (?, ?, ?, ?)
      `).bind(tokenHash, gameId, identity.id, Date.now() + 60_000),
    ]);
    const websocketUrl = new URL(`/api/games/${encodeURIComponent(gameId)}/ws`, request.url);
    websocketUrl.protocol = websocketUrl.protocol === 'https:' ? 'wss:' : 'ws:';
    websocketUrl.searchParams.set('token', token);
    return json({ websocketUrl: websocketUrl.toString() }, 200, headers);
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
