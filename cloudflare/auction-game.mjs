import { DurableObject } from 'cloudflare:workers';
import { WORD_GAME_WORDS } from './word-game-dictionary.mjs';
import { AUCTION_TOPICS, AUCTION_TOPIC_BY_ID } from './auction-topics.mjs';

const TOPIC_REVEAL_MS = 2_500;
const AUCTION_TURN_MS = 10_000;
const CHALLENGE_START_MS = 15_000;
const COUNTDOWN_MS = 3_000;
const RESULT_MS = 2_500;
const STARTING_LIVES = 3;

function firstRow(cursor) {
  return [...cursor][0] ?? null;
}

function normalizeWord(value) {
  return String(value ?? '')
    .trim()
    .toLocaleLowerCase('en-US')
    .replace(/\s+/g, ' ')
    .replace(/[’‘`´]/g, "'")
    .replace(/^to\s+/, '');
}

function randomIndex(length) {
  if (length <= 1) return 0;
  const value = crypto.getRandomValues(new Uint32Array(1))[0];
  return value % length;
}

function namingDurationMs(bid) {
  return Math.min(90, Math.max(20, Number(bid) * 5 + 5)) * 1_000;
}

export class AuctionGame extends DurableObject {
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
          phase TEXT NOT NULL,
          round_number INTEGER NOT NULL DEFAULT 0,
          starter_user_id TEXT,
          turn_user_id TEXT,
          leader_user_id TEXT,
          challenger_user_id TEXT,
          bid INTEGER NOT NULL DEFAULT 0,
          topic_id TEXT,
          used_topic_ids TEXT NOT NULL DEFAULT '[]',
          deadline INTEGER,
          phase_duration_ms INTEGER,
          player_one_lives INTEGER NOT NULL DEFAULT 3,
          player_two_lives INTEGER NOT NULL DEFAULT 3,
          winner_id TEXT,
          finish_reason TEXT,
          last_result TEXT,
          correct_words INTEGER NOT NULL DEFAULT 0,
          max_bid INTEGER NOT NULL DEFAULT 0,
          best_round INTEGER NOT NULL DEFAULT 0
        );
        CREATE TABLE IF NOT EXISTS accepted_words (
          word TEXT PRIMARY KEY,
          created_at INTEGER NOT NULL
        );
      `);
    });
  }

  stateRow() {
    return firstRow(this.ctx.storage.sql.exec('SELECT * FROM game_state WHERE singleton = 1'));
  }

  acceptedRows() {
    return [...this.ctx.storage.sql.exec('SELECT word, created_at FROM accepted_words ORDER BY created_at ASC')];
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
        status, phase, player_one_lives, player_two_lives
      ) VALUES (1, ?, ?, ?, ?, ?, 'waiting', 'waiting', ?, ?)
    `, config.gameId, config.playerOne.id, config.playerOne.name, config.playerTwo.id, config.playerTwo.name, STARTING_LIVES, STARTING_LIVES);
  }

  playerFor(row, userId) {
    if (userId === row.player_one_id) return { id: row.player_one_id, name: row.player_one_name, lives: Number(row.player_one_lives) };
    if (userId === row.player_two_id) return { id: row.player_two_id, name: row.player_two_name, lives: Number(row.player_two_lives) };
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
    const topic = AUCTION_TOPIC_BY_ID.get(row.topic_id) ?? null;
    let lastResult = null;
    try { lastResult = row.last_result ? JSON.parse(row.last_result) : null; } catch { lastResult = null; }
    const words = this.acceptedRows().map((item) => item.word);
    return {
      type: 'state',
      gameType: 'auction',
      gameId: row.game_id,
      status: row.status,
      phase: row.phase,
      roundNumber: Number(row.round_number),
      players: [
        { id: row.player_one_id, name: row.player_one_name, lives: Number(row.player_one_lives) },
        { id: row.player_two_id, name: row.player_two_name, lives: Number(row.player_two_lives) },
      ],
      starterUserId: row.starter_user_id,
      turnUserId: row.turn_user_id,
      leaderUserId: row.leader_user_id,
      challengerUserId: row.challenger_user_id,
      bid: Number(row.bid),
      topic: topic ? { id: topic.id, emoji: topic.emoji, name: topic.name } : null,
      deadline: Number(row.deadline) || null,
      phaseDurationMs: Number(row.phase_duration_ms) || null,
      acceptedWords: words,
      acceptedCount: words.length,
      winnerId: row.winner_id,
      finishReason: row.finish_reason,
      lastResult,
      stats: {
        correctWords: Number(row.correct_words),
        maxBid: Number(row.max_bid),
        bestRound: Number(row.best_round),
        roundsPlayed: Number(row.round_number),
      },
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

  schedule(deadline) {
    return this.ctx.storage.setAlarm(deadline);
  }

  chooseTopic(row) {
    let used = [];
    try { used = JSON.parse(row.used_topic_ids || '[]'); } catch { used = []; }
    if (!Array.isArray(used) || used.length >= AUCTION_TOPICS.length) used = [];
    let available = AUCTION_TOPICS.filter((topic) => !used.includes(topic.id));
    if (available.length > 1 && row.topic_id) available = available.filter((topic) => topic.id !== row.topic_id);
    if (!available.length) available = AUCTION_TOPICS.filter((topic) => topic.id !== row.topic_id);
    const topic = available[randomIndex(available.length)] ?? AUCTION_TOPICS[0];
    return { topic, used: [...used, topic.id] };
  }

  async beginRound() {
    const row = this.stateRow();
    if (!row || row.status === 'finished') return;
    const nextStarter = Number(row.round_number) === 0
      ? row.player_one_id
      : this.otherPlayerId(row, row.starter_user_id || row.player_one_id);
    const { topic, used } = this.chooseTopic(row);
    const deadline = Date.now() + TOPIC_REVEAL_MS;
    this.ctx.storage.transactionSync(() => {
      this.ctx.storage.sql.exec('DELETE FROM accepted_words');
      this.ctx.storage.sql.exec(`
        UPDATE game_state SET
          status = 'active', phase = 'topic', round_number = round_number + 1,
          starter_user_id = ?, turn_user_id = NULL, leader_user_id = NULL,
          challenger_user_id = NULL, bid = 0, topic_id = ?, used_topic_ids = ?,
          deadline = ?, phase_duration_ms = ?, last_result = NULL
        WHERE singleton = 1
      `, nextStarter, topic.id, JSON.stringify(used), deadline, TOPIC_REVEAL_MS);
    });
    await this.schedule(deadline);
    await this.env.DB.prepare(`
      UPDATE games SET status = 'active', started_at = COALESCE(started_at, CURRENT_TIMESTAMP)
      WHERE id = ? AND status = 'waiting'
    `).bind(row.game_id).run();
    this.broadcastState();
  }

  async startIfReady() {
    const row = this.stateRow();
    if (!row || row.status !== 'waiting') return;
    const connected = this.connectedPlayerIds();
    if (!connected.has(row.player_one_id) || !connected.has(row.player_two_id)) return;
    await this.beginRound();
  }

  async fetch(request) {
    const row = this.stateRow();
    const userId = request.headers.get('X-Vordik-User-Id') ?? '';
    const player = row ? this.playerFor(row, userId) : null;
    if (!row || !player) return new Response('Forbidden', { status: 403 });
    if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') return new Response('Expected WebSocket', { status: 426 });
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    server.serializeAttachment({ userId, name: player.name });
    this.ctx.acceptWebSocket(server);
    this.send(server, this.publicState());
    await this.startIfReady();
    return new Response(null, { status: 101, webSocket: client });
  }

  async setAuctionPhase(row) {
    const deadline = Date.now() + AUCTION_TURN_MS;
    this.ctx.storage.sql.exec(`
      UPDATE game_state SET phase = 'auction', turn_user_id = ?, deadline = ?, phase_duration_ms = ? WHERE singleton = 1
    `, row.starter_user_id, deadline, AUCTION_TURN_MS);
    await this.schedule(deadline);
    this.broadcastState();
  }

  async handleBid(socket, row, userId, amount) {
    if (row.phase !== 'auction' || row.turn_user_id !== userId) return this.send(socket, { type: 'error', message: 'Сейчас нельзя сделать ставку.' });
    if (Number(row.deadline) <= Date.now()) return this.resolveRound(userId, 'auction_timeout');
    const bid = Number(amount);
    const minimum = Math.max(3, Number(row.bid) + 1);
    if (!Number.isInteger(bid) || bid < minimum || bid > 30) {
      return this.send(socket, { type: 'error', message: `Минимальная ставка — ${minimum} слов.` });
    }
    const deadline = Date.now() + AUCTION_TURN_MS;
    this.ctx.storage.sql.exec(`
      UPDATE game_state SET bid = ?, leader_user_id = ?, turn_user_id = ?, deadline = ?, phase_duration_ms = ?, max_bid = MAX(max_bid, ?)
      WHERE singleton = 1
    `, bid, userId, this.otherPlayerId(row, userId), deadline, AUCTION_TURN_MS, bid);
    await this.schedule(deadline);
    this.broadcastState();
  }

  async handleChallenge(socket, row, userId) {
    if (row.phase !== 'auction' || row.turn_user_id !== userId || !row.leader_user_id || Number(row.bid) < 3) {
      return this.send(socket, { type: 'error', message: 'Сначала соперник должен сделать ставку.' });
    }
    const deadline = Date.now() + CHALLENGE_START_MS;
    this.ctx.storage.sql.exec(`
      UPDATE game_state SET phase = 'challenge', challenger_user_id = ?, turn_user_id = ?, deadline = ?, phase_duration_ms = ?
      WHERE singleton = 1
    `, userId, row.leader_user_id, deadline, CHALLENGE_START_MS);
    await this.schedule(deadline);
    this.broadcastState();
  }

  async handleStart(socket, row, userId) {
    if (row.phase !== 'challenge' || row.leader_user_id !== userId) {
      return this.send(socket, { type: 'error', message: 'Начать подтверждение должен игрок с максимальной ставкой.' });
    }
    const deadline = Date.now() + COUNTDOWN_MS;
    this.ctx.storage.sql.exec(`
      UPDATE game_state SET phase = 'countdown', turn_user_id = ?, deadline = ?, phase_duration_ms = ? WHERE singleton = 1
    `, row.leader_user_id, deadline, COUNTDOWN_MS);
    await this.schedule(deadline);
    this.broadcastState();
  }

  wordError(row, userId, word) {
    if (row.phase !== 'naming' || row.leader_user_id !== userId) return 'Сейчас слова вводит другой игрок.';
    if (Number(row.deadline) <= Date.now()) return 'Время закончилось.';
    if (!/^[a-z]+(?:['-][a-z]+)*$/.test(word)) return 'Введите одно английское слово.';
    if (firstRow(this.ctx.storage.sql.exec('SELECT 1 AS found FROM accepted_words WHERE word = ? LIMIT 1', word))) return 'Ты уже называл это слово';
    const topic = AUCTION_TOPIC_BY_ID.get(row.topic_id);
    if (topic?.wordSet.has(word)) return '';
    if (WORD_GAME_WORDS.has(word)) return 'Не подходит к теме';
    return 'Проверь написание';
  }

  async handleWord(socket, row, userId, rawWord) {
    const word = normalizeWord(rawWord);
    const error = this.wordError(row, userId, word);
    if (error) {
      this.send(socket, { type: 'error', message: error });
      return;
    }
    this.ctx.storage.sql.exec('INSERT INTO accepted_words (word, created_at) VALUES (?, ?)', word, Date.now());
    const count = Number(firstRow(this.ctx.storage.sql.exec('SELECT COUNT(*) AS total FROM accepted_words'))?.total ?? 0);
    this.ctx.storage.sql.exec('UPDATE game_state SET correct_words = correct_words + 1 WHERE singleton = 1');
    if (count >= Number(row.bid)) {
      await this.resolveRound(row.challenger_user_id, 'bid_confirmed');
      return;
    }
    this.broadcastState();
  }

  async resolveRound(loserId, reason) {
    const row = this.stateRow();
    if (!row || row.status === 'finished' || row.phase === 'result') return;
    const acceptedCount = Number(firstRow(this.ctx.storage.sql.exec('SELECT COUNT(*) AS total FROM accepted_words'))?.total ?? 0);
    const winnerId = this.otherPlayerId(row, loserId);
    const loserColumn = loserId === row.player_one_id ? 'player_one_lives' : 'player_two_lives';
    const nextLives = Math.max(0, Number(loserId === row.player_one_id ? row.player_one_lives : row.player_two_lives) - 1);
    const deadline = Date.now() + RESULT_MS;
    const successfulBid = reason === 'bid_confirmed';
    const result = {
      reason,
      loserId,
      winnerId,
      acceptedCount,
      target: Number(row.bid),
      successfulBid,
    };
    this.ctx.storage.sql.exec(`
      UPDATE game_state SET
        ${loserColumn} = ?, phase = 'result', turn_user_id = NULL, deadline = ?, phase_duration_ms = ?,
        last_result = ?, best_round = MAX(best_round, ?)
      WHERE singleton = 1
    `, nextLives, deadline, RESULT_MS, JSON.stringify(result), successfulBid ? acceptedCount : 0);
    await this.schedule(deadline);
    this.broadcastState();
  }

  async finishMatch(row, winnerId, reason) {
    this.ctx.storage.sql.exec(`
      UPDATE game_state SET status = 'finished', phase = 'finished', winner_id = ?, finish_reason = ?, deadline = NULL, phase_duration_ms = NULL
      WHERE singleton = 1
    `, winnerId, reason);
    const final = this.stateRow();
    await this.env.DB.prepare(`
      UPDATE games SET status = 'finished', winner_id = ?, finish_reason = ?, finished_at = CURRENT_TIMESTAMP,
        rounds_played = ?, correct_words = ?, max_bid = ?, best_round = ?
      WHERE id = ? AND status <> 'finished'
    `).bind(winnerId, reason, Number(final.round_number), Number(final.correct_words), Number(final.max_bid), Number(final.best_round), row.game_id).run();
    this.broadcastState();
  }

  async webSocketMessage(socket, rawMessage) {
    let message;
    try { message = JSON.parse(String(rawMessage)); } catch { return; }
    const attachment = socket.deserializeAttachment();
    const row = this.stateRow();
    if (!row || !attachment?.userId || row.status === 'finished') return;
    if (message?.type === 'bid') return this.handleBid(socket, row, attachment.userId, message.amount);
    if (message?.type === 'challenge') return this.handleChallenge(socket, row, attachment.userId);
    if (message?.type === 'start') return this.handleStart(socket, row, attachment.userId);
    if (message?.type === 'word') return this.handleWord(socket, row, attachment.userId, message.word);
    if (message?.type === 'leave' && ['auction', 'challenge', 'countdown', 'naming'].includes(row.phase)) {
      return this.resolveRound(attachment.userId, 'left_round');
    }
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
    if (!row || row.status === 'finished') return;
    const deadline = Number(row.deadline);
    if (deadline > Date.now()) {
      await this.schedule(deadline);
      return;
    }
    if (row.phase === 'topic') return this.setAuctionPhase(row);
    if (row.phase === 'auction') return this.resolveRound(row.turn_user_id, 'auction_timeout');
    if (row.phase === 'challenge') return this.resolveRound(row.leader_user_id, 'start_timeout');
    if (row.phase === 'countdown') {
      const duration = namingDurationMs(row.bid);
      const namingDeadline = Date.now() + duration;
      this.ctx.storage.sql.exec(`
        UPDATE game_state SET phase = 'naming', turn_user_id = ?, deadline = ?, phase_duration_ms = ? WHERE singleton = 1
      `, row.leader_user_id, namingDeadline, duration);
      await this.schedule(namingDeadline);
      this.broadcastState();
      return;
    }
    if (row.phase === 'naming') return this.resolveRound(row.leader_user_id, 'bid_failed');
    if (row.phase === 'result') {
      const current = this.stateRow();
      const playerOneOut = Number(current.player_one_lives) <= 0;
      const playerTwoOut = Number(current.player_two_lives) <= 0;
      if (playerOneOut || playerTwoOut) {
        const winnerId = playerOneOut ? current.player_two_id : current.player_one_id;
        return this.finishMatch(current, winnerId, 'lives');
      }
      return this.beginRound();
    }
  }
}
