import { createHmac, timingSafeEqual } from 'node:crypto';
import { createServer } from 'node:http';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { networkInterfaces } from 'node:os';
import { extname, dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const DEFAULT_PORT = 4173;
const MAX_BODY_BYTES = 16 * 1024;
const MAX_RATING_SCORE = 10_000_000;
const MAX_VOCABULARY_SIZE = 100_000;
const MAX_SCORE_PER_WORD = 60;
const TELEGRAM_AUTH_MAX_AGE_SECONDS = 7 * 24 * 60 * 60;

const contentTypes = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.svg', 'image/svg+xml'],
  ['.png', 'image/png'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.webp', 'image/webp'],
  ['.ico', 'image/x-icon'],
]);

function sendJson(response, status, body, extraHeaders = {}) {
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    ...extraHeaders,
  });
  response.end(JSON.stringify(body));
}

function cleanName(value) {
  const name = String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, '').trim().replace(/\s+/g, ' ');
  return name.slice(0, 80) || 'Пользователь Вордик';
}

function integerInRange(value, min, max, field) {
  const number = Number(value);
  if (!Number.isFinite(number) || !Number.isInteger(number) || number < min || number > max) {
    throw Object.assign(new Error(`Некорректное поле: ${field}`), { statusCode: 400 });
  }
  return number;
}

function publicLeaderboard(database, currentUserId = '') {
  const sorted = Object.values(database.users)
    .sort((left, right) => right.score - left.score
      || right.vocabularySize - left.vocabularySize
      || left.name.localeCompare(right.name, 'ru'));
  return sorted.map((player, index) => ({
    rank: index + 1,
    name: player.name,
    score: player.score,
    vocabularySize: player.vocabularySize,
    updatedAt: player.updatedAt,
    isMe: player.id === currentUserId,
  }));
}

export function verifyTelegramInitData(initData, botToken, nowSeconds = Math.floor(Date.now() / 1000)) {
  if (!initData || !botToken) return null;
  const params = new URLSearchParams(initData);
  const receivedHash = params.get('hash');
  const authDate = Number(params.get('auth_date'));
  if (!receivedHash || !/^[a-f\d]{64}$/i.test(receivedHash) || !Number.isFinite(authDate)) return null;
  if (authDate > nowSeconds + 60 || nowSeconds - authDate > TELEGRAM_AUTH_MAX_AGE_SECONDS) return null;

  const dataCheckString = [...params.entries()]
    .filter(([key]) => key !== 'hash' && key !== 'signature')
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');
  const secretKey = createHmac('sha256', 'WebAppData').update(botToken).digest();
  const calculatedHash = createHmac('sha256', secretKey).update(dataCheckString).digest();
  const suppliedHash = Buffer.from(receivedHash, 'hex');
  if (suppliedHash.length !== calculatedHash.length || !timingSafeEqual(suppliedHash, calculatedHash)) return null;

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

function resolveRatingIdentity(payload, config) {
  const telegramIdentity = verifyTelegramInitData(payload.telegramInitData, config.botToken);
  if (telegramIdentity) return telegramIdentity;
  if (payload.telegramInitData && config.botToken) {
    throw Object.assign(new Error('Не удалось подтвердить Telegram-профиль'), { statusCode: 401 });
  }
  if (!config.allowGuestRatings) {
    throw Object.assign(new Error('Рейтинг доступен только внутри Telegram'), { statusCode: 401 });
  }
  const guestId = String(payload.guestId ?? '');
  if (!/^[a-zA-Z0-9_-]{8,100}$/.test(guestId)) {
    throw Object.assign(new Error('Не удалось определить пользователя'), { statusCode: 400 });
  }
  return { id: `guest:${guestId}`, name: cleanName(payload.name) };
}

async function readJsonBody(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) {
      throw Object.assign(new Error('Слишком большой запрос'), { statusCode: 413 });
    }
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
  } catch {
    throw Object.assign(new Error('Некорректный JSON'), { statusCode: 400 });
  }
}

export function createRatingsStore(filePath) {
  let databasePromise;
  let writeQueue = Promise.resolve();

  async function load() {
    if (!databasePromise) {
      databasePromise = readFile(filePath, 'utf8')
        .then((source) => JSON.parse(source))
        .then((value) => ({ version: 1, users: value?.users && typeof value.users === 'object' ? value.users : {} }))
        .catch((error) => {
          if (error?.code === 'ENOENT' || error instanceof SyntaxError) return { version: 1, users: {} };
          throw error;
        });
    }
    return databasePromise;
  }

  async function persist(database) {
    await mkdir(dirname(filePath), { recursive: true });
    const temporaryPath = `${filePath}.${process.pid}.tmp`;
    await writeFile(temporaryPath, `${JSON.stringify(database, null, 2)}\n`, { mode: 0o600 });
    await rename(temporaryPath, filePath);
  }

  return {
    async list(limit = 50) {
      const database = await load();
      return publicLeaderboard(database).slice(0, limit).map(({ isMe, ...player }) => player);
    },
    async upsert(identity, values) {
      let result;
      writeQueue = writeQueue.catch(() => {}).then(async () => {
        const database = await load();
        const previous = database.users[identity.id];
        database.users[identity.id] = {
          id: identity.id,
          name: identity.name,
          score: values.score,
          vocabularySize: values.vocabularySize,
          createdAt: previous?.createdAt ?? new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        await persist(database);
        const leaderboard = publicLeaderboard(database, identity.id);
        const player = leaderboard.find((entry) => entry.isMe);
        result = {
          player,
          totalPlayers: leaderboard.length,
          leaders: leaderboard.slice(0, 20),
        };
      });
      await writeQueue;
      return result;
    },
  };
}

function allowedOriginHeaders(request, config) {
  const origin = request.headers.origin;
  if (!origin) return {};
  let isSameOrigin = false;
  try { isSameOrigin = new URL(origin).host === request.headers.host; } catch { /* Invalid origins are rejected below. */ }
  if (!isSameOrigin && !config.allowedOrigins.has(origin)) {
    throw Object.assign(new Error('Этот источник не разрешён'), { statusCode: 403 });
  }
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    Vary: 'Origin',
  };
}

async function serveStatic(pathname, request, response, staticRoot) {
  let decodedPath;
  try { decodedPath = decodeURIComponent(pathname); } catch { response.writeHead(400); response.end('Bad request'); return; }
  const relativePath = decodedPath === '/' ? 'index.html' : decodedPath.replace(/^\/+/, '');
  const target = resolve(staticRoot, relativePath);
  if (!target.startsWith(`${resolve(staticRoot)}${sep}`) || relativePath.split('/').some((part) => part.startsWith('.'))) {
    response.writeHead(404); response.end('Not found'); return;
  }
  const contentType = contentTypes.get(extname(target).toLowerCase());
  if (!contentType) { response.writeHead(404); response.end('Not found'); return; }
  try {
    const content = await readFile(target);
    response.writeHead(200, {
      'Content-Type': contentType,
      'Cache-Control': 'no-cache',
      'X-Content-Type-Options': 'nosniff',
    });
    response.end(request.method === 'HEAD' ? undefined : content);
  } catch {
    response.writeHead(404); response.end('Not found');
  }
}

export function createVordikServer(options = {}) {
  const botToken = options.botToken ?? process.env.BOT_TOKEN ?? '';
  const allowGuestRatings = options.allowGuestRatings
    ?? (process.env.ALLOW_GUEST_RATINGS ? process.env.ALLOW_GUEST_RATINGS === 'true' : !botToken);
  const config = {
    staticRoot: options.staticRoot ?? root,
    botToken,
    allowGuestRatings,
    allowedOrigins: new Set(options.allowedOrigins ?? String(process.env.ALLOWED_ORIGINS ?? '').split(',').map((item) => item.trim()).filter(Boolean)),
  };
  const ratingsFile = options.ratingsFile ?? process.env.RATINGS_DATA_FILE ?? join(root, 'data', 'ratings.json');
  const ratings = createRatingsStore(ratingsFile);

  return createServer(async (request, response) => {
    const url = new URL(request.url, 'http://localhost');
    let corsHeaders = {};
    try {
      if (url.pathname.startsWith('/api/')) {
        corsHeaders = allowedOriginHeaders(request, config);
        if (request.method === 'OPTIONS') { response.writeHead(204, corsHeaders); response.end(); return; }
        if (url.pathname === '/api/health' && request.method === 'GET') {
          sendJson(response, 200, { ok: true }, corsHeaders); return;
        }
        if (url.pathname === '/api/ratings' && request.method === 'GET') {
          const limit = Math.min(100, Math.max(1, Number.parseInt(url.searchParams.get('limit') ?? '50', 10) || 50));
          const leaders = await ratings.list(limit);
          sendJson(response, 200, { leaders }, corsHeaders); return;
        }
        if (url.pathname === '/api/ratings/sync' && request.method === 'POST') {
          const payload = await readJsonBody(request);
          const identity = resolveRatingIdentity(payload, config);
          const score = integerInRange(payload.score, 0, MAX_RATING_SCORE, 'score');
          const vocabularySize = integerInRange(payload.vocabularySize, 0, MAX_VOCABULARY_SIZE, 'vocabularySize');
          if (score > vocabularySize * MAX_SCORE_PER_WORD) {
            throw Object.assign(new Error('Количество баллов не соответствует размеру словаря'), { statusCode: 400 });
          }
          const result = await ratings.upsert(identity, { score, vocabularySize });
          sendJson(response, 200, result, corsHeaders); return;
        }
        sendJson(response, 404, { error: 'API method not found' }, corsHeaders); return;
      }
      if (!['GET', 'HEAD'].includes(request.method)) { response.writeHead(405); response.end('Method not allowed'); return; }
      await serveStatic(url.pathname, request, response, config.staticRoot);
    } catch (error) {
      const status = Number(error?.statusCode) || 500;
      if (status >= 500) console.error(error);
      sendJson(response, status, { error: status >= 500 ? 'Внутренняя ошибка сервера' : error.message }, corsHeaders);
    }
  });
}

function printNetworkUrls(port) {
  console.log(`Вордик: http://localhost:${port}`);
  for (const [name, addresses] of Object.entries(networkInterfaces())) {
    for (const address of addresses ?? []) {
      if (address.family === 'IPv4' && !address.internal && /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(address.address)) {
        console.log(`Телефон в той же сети (${name}): http://${address.address}:${port}`);
      }
    }
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const port = Number(process.env.PORT) || DEFAULT_PORT;
  createVordikServer().listen(port, '0.0.0.0', () => printNetworkUrls(port));
}
