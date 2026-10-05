import { DurableObject } from 'cloudflare:workers';
import { WORD_GAME_WORDS } from './word-game-dictionary.mjs';

const TURN_DURATION_MS = 15_000;

function firstRow(cursor) {
  return [...cursor][0] ?? null;
}

function normalizeWord(value) {
  return String(value ?? '')
    .trim()
    .toLocaleLowerCase('en-US')
    .replace(/[’‘`´]/g, "'")
    .replace(/^to\s+/, '');
}

function edgeLetter(word, fromEnd = false) {
  const letters = String(word).match(/[a-z]/g) ?? [];
  return fromEnd ? letters.at(-1) ?? '' : letters[0] ?? '';
}

export class WordChainGame extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.ctx = ctx;
    this.env = env;
    this.ctx.blockConcurrencyWhile(async () => {
      this.ctx.storage.sql.exec(`
        CREATE TABLE IF NOT EXISTS game_state (
          singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
          game_id TEXT NOT NULL,
          player_one_id TEXT NOT NULL,
          player_one_name TEXT NOT NULL,
          player_two_id TEXT NOT NULL,
          player_two_name TEXT NOT NULL,
          status TEXT NOT NULL,
          turn_user_id TEXT,
          deadline INTEGER,
          winner_id TEXT,
          finish_reason TEXT
        );
        CREATE TABLE IF NOT EXISTS moves (
          position INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id TEXT NOT NULL,
          word TEXT NOT NULL UNIQUE,
          created_at INTEGER NOT NULL
        );
      `);
    });
  }

  stateRow() {
    return firstRow(this.ctx.storage.sql.exec('SELECT * FROM game_state WHERE singleton = 1'));
  }

  moveRows() {
    return [...this.ctx.storage.sql.exec('SELECT position, user_id, word, created_at FROM moves ORDER BY position ASC')];
  }

  async initialize(config) {
    const current = this.stateRow();
    if (current) {
      if (current.game_id !== config.gameId) throw new Error('Game room mismatch');
      return;
    }
    this.ctx.storage.sql.exec(`
      INSERT INTO game_state (
        singleton, game_id, player_one_id, player_one_name, player_two_id, player_two_name,
        status, turn_user_id, deadline, winner_id, finish_reason
      ) VALUES (1, ?, ?, ?, ?, ?, 'waiting', NULL, NULL, NULL, NULL)
    `, config.gameId, config.playerOne.id, config.playerOne.name, config.playerTwo.id, config.playerTwo.name);
  }

  playerFor(row, userId) {
    if (userId === row.player_one_id) return { id: row.player_one_id, name: row.player_one_name };
    if (userId === row.player_two_id) return { id: row.player_two_id, name: row.player_two_name };
    return null;
  }

  otherPlayerId(row, userId) {
    return userId === row.player_one_id ? row.player_two_id : row.player_one_id;
  }

  connectedPlayerIds() {
    return new Set(this.ctx.getWebSockets().map((socket) => socket.deserializeAttachment()?.userId).filter(Boolean));
  }

  publicState() {
    const row = this.stateRow();
    if (!row) return null;
    const moves = this.moveRows();
    const lastWord = moves.at(-1)?.word ?? '';
    return {
      type: 'state',
      gameId: row.game_id,
      status: row.status,
      players: [
        { id: row.player_one_id, name: row.player_one_name },
        { id: row.player_two_id, name: row.player_two_name },
      ],
      turnUserId: row.turn_user_id,
      deadline: Number(row.deadline) || null,
      requiredLetter: lastWord ? edgeLetter(lastWord, true) : '',
      winnerId: row.winner_id,
      finishReason: row.finish_reason,
      moves: moves.map((move) => ({
        position: Number(move.position),
        userId: move.user_id,
        word: move.word,
        createdAt: Number(move.created_at),
      })),
      connectedUserIds: [...this.connectedPlayerIds()],
      serverNow: Date.now(),
    };
  }

  send(socket, message) {
    try { socket.send(JSON.stringify(message)); } catch { /* Closed sockets are removed by the runtime. */ }
  }

  broadcastState() {
    const state = this.publicState();
    if (!state) return;
    this.ctx.getWebSockets().forEach((socket) => this.send(socket, state));
  }

  async startIfReady() {
    const row = this.stateRow();
    if (!row || row.status !== 'waiting') return;
    const connected = this.connectedPlayerIds();
    if (!connected.has(row.player_one_id) || !connected.has(row.player_two_id)) return;
    const deadline = Date.now() + TURN_DURATION_MS;
    this.ctx.storage.sql.exec(
      "UPDATE game_state SET status = 'active', turn_user_id = ?, deadline = ? WHERE singleton = 1 AND status = 'waiting'",
      row.player_one_id,
      deadline,
    );
    await this.ctx.storage.setAlarm(deadline);
    await this.env.DB.prepare(
      "UPDATE games SET status = 'active', started_at = COALESCE(started_at, CURRENT_TIMESTAMP) WHERE id = ? AND status = 'waiting'",
    ).bind(row.game_id).run();
    this.broadcastState();
  }

  async fetch(request) {
    const row = this.stateRow();
    const userId = request.headers.get('X-Vordik-User-Id') ?? '';
    const player = row ? this.playerFor(row, userId) : null;
    if (!row || !player) return new Response('Forbidden', { status: 403 });
    if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') {
      return new Response('Expected WebSocket', { status: 426 });
    }

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    server.serializeAttachment({ userId, name: player.name });
    this.ctx.acceptWebSocket(server);
    this.send(server, this.publicState());
    await this.startIfReady();
    return new Response(null, { status: 101, webSocket: client });
  }

  errorForMove(row, userId, word) {
    if (row.status !== 'active') return 'Матч ещё не начался или уже завершён.';
    if (Number(row.deadline) <= Date.now()) return 'Время на ход закончилось.';
    if (row.turn_user_id !== userId) return 'Сейчас ход другого игрока.';
    if (!/^[a-z]+(?:['-][a-z]+)*$/.test(word)) return 'Введите одно английское слово.';
    if (!WORD_GAME_WORDS.has(word)) return 'Такого слова нет в словаре Вордика.';
    const previous = firstRow(this.ctx.storage.sql.exec('SELECT word FROM moves ORDER BY position DESC LIMIT 1'));
    if (previous && edgeLetter(word) !== edgeLetter(previous.word, true)) {
      return `Слово должно начинаться на «${edgeLetter(previous.word, true).toUpperCase()}».`;
    }
    if (firstRow(this.ctx.storage.sql.exec('SELECT 1 AS found FROM moves WHERE word = ? LIMIT 1', word))) {
      return 'Это слово уже было в цепочке.';
    }
    return '';
  }

  async webSocketMessage(socket, rawMessage) {
    let message;
    try { message = JSON.parse(String(rawMessage)); } catch { return; }
    if (message?.type !== 'play') return;
    const attachment = socket.deserializeAttachment();
    const row = this.stateRow();
    if (!row || !attachment?.userId) return;
    if (row.status === 'active' && Number(row.deadline) <= Date.now()) {
      await this.finish(this.otherPlayerId(row, row.turn_user_id), 'timeout');
      return;
    }
    const word = normalizeWord(message.word);
    const error = this.errorForMove(row, attachment.userId, word);
    if (error) {
      this.send(socket, { type: 'error', message: error });
      return;
    }

    const nextUserId = this.otherPlayerId(row, attachment.userId);
    const deadline = Date.now() + TURN_DURATION_MS;
    this.ctx.storage.transactionSync(() => {
      this.ctx.storage.sql.exec(
        'INSERT INTO moves (user_id, word, created_at) VALUES (?, ?, ?)',
        attachment.userId,
        word,
        Date.now(),
      );
      this.ctx.storage.sql.exec(
        'UPDATE game_state SET turn_user_id = ?, deadline = ? WHERE singleton = 1',
        nextUserId,
        deadline,
      );
    });
    await this.ctx.storage.setAlarm(deadline);
    this.broadcastState();
  }

  async webSocketClose(socket, code, reason) {
    try { socket.close(code, reason); } catch { /* Already closed. */ }
    this.broadcastState();
  }

  async webSocketError(socket) {
    try { socket.close(1011, 'Connection error'); } catch { /* Already closed. */ }
  }

  async alarm() {
    const row = this.stateRow();
    if (!row || row.status !== 'active') return;
    const deadline = Number(row.deadline);
    if (deadline > Date.now()) {
      await this.ctx.storage.setAlarm(deadline);
      return;
    }
    await this.finish(this.otherPlayerId(row, row.turn_user_id), 'timeout');
  }

  async finish(winnerId, reason) {
    const row = this.stateRow();
    if (!row || row.status === 'finished') return;
    this.ctx.storage.sql.exec(
      "UPDATE game_state SET status = 'finished', winner_id = ?, finish_reason = ?, deadline = NULL WHERE singleton = 1",
      winnerId,
      reason,
    );
    await this.env.DB.prepare(`
      UPDATE games
      SET status = 'finished', winner_id = ?, finish_reason = ?, finished_at = CURRENT_TIMESTAMP
      WHERE id = ? AND status <> 'finished'
    `).bind(winnerId, reason, row.game_id).run();
    this.broadcastState();
  }
}
