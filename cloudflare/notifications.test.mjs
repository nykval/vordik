import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import {
  allowedAt, candidatesForUser, consecutiveDays, dispatchInvite, dispatchNotification,
  getNotificationSettings, ingestStudyEvents, localClock, meaningfulSession,
  notificationCopy, reserveDelivery, runNotificationSchedule, selectScenario,
  updateNotificationSettings,
} from './notifications.mjs';

function database() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec('CREATE TABLE ratings (user_id TEXT PRIMARY KEY, name TEXT, updated_at TEXT)');
  sqlite.exec('CREATE TABLE game_invites (id TEXT PRIMARY KEY, inviter_id TEXT, invitee_id TEXT, game_type TEXT, status TEXT, created_at TEXT)');
  sqlite.exec(readFileSync(new URL('./migrations/0009_notifications.sql', import.meta.url), 'utf8'));
  sqlite.exec(readFileSync(new URL('./migrations/0010_relearned_words.sql', import.meta.url), 'utf8'));
  sqlite.exec(readFileSync(new URL('./migrations/0011_notification_opt_out.sql', import.meta.url), 'utf8'));
  sqlite.exec(readFileSync(new URL('./migrations/0012_auto_notifications.sql', import.meta.url), 'utf8'));
  return {
    close: () => sqlite.close(),
    prepare(sql) {
      const statement = sqlite.prepare(sql);
      return { all: async () => ({ results: statement.all() }), bind(...args) {
        return {
          first: async () => statement.get(...args) ?? null,
          all: async () => ({ results: statement.all(...args) }),
          run: async () => ({ meta: { changes: statement.run(...args).changes } }),
        };
      } };
    },
    exec: (sql) => sqlite.exec(sql),
  };
}

function fixture(db, userId = 'telegram:123') {
  db.exec(`INSERT INTO ratings VALUES ('${userId}', 'Анна', '2020-01-01 00:00:00')`);
  db.exec(`INSERT INTO notification_preferences
    (user_id, mode, reminder_time, timezone, chat_access, weekly_goal)
    VALUES ('${userId}', 'all', '19:00', 'Europe/Moscow', 'granted', 20)`);
}

const now = Date.parse('2026-10-20T16:30:00Z'); // 19:30 in Moscow

test('priority, quiet hours, time zones and one clear action', () => {
  assert.equal(selectScenario([{ scenario: 'review' }, { scenario: 'streak' }, { scenario: 'invite' }]).scenario, 'invite');
  assert.equal(selectScenario([{ scenario: 'digest' }, { scenario: 'goal' }]).scenario, 'goal');
  assert.equal(allowedAt(now, 'Europe/Moscow', '19:00', 'review'), true);
  assert.equal(allowedAt(now, 'America/Los_Angeles', '19:00', 'review'), false);
  assert.equal(allowedAt(Date.parse('2026-10-20T04:00:00Z'), 'Europe/Moscow', '09:00', 'review'), false);
  assert.equal(allowedAt(Date.parse('2026-10-20T18:30:00Z'), 'Europe/Moscow', '19:00', 'review'), false);
  assert.equal(localClock(now, 'Europe/Moscow').day, '2026-10-20');
  const copy = notificationCopy({ scenario: 'review', reviewDue: 3, exactReviewCount: false }, 'vordikforyou_bot');
  assert.match(copy.reply_markup.inline_keyboard[0][0].url, /startapp=review/);
  assert.doesNotMatch(copy.text, /3/);
  assert.equal(consecutiveDays(['2026-10-17', '2026-10-18', '2026-10-19'], '2026-10-20'), 3);
});

test('meaningful sessions reject starting or quickly skipping', () => {
  assert.equal(meaningfulSession({ mechanic: 'cards', attempts: 3, durationMs: 20000 }), true);
  assert.equal(meaningfulSession({ mechanic: 'cards', attempts: 2, durationMs: 60000 }), false);
  assert.equal(meaningfulSession({ mechanic: 'timed', attempts: 3, durationMs: 8000 }), true);
  assert.equal(meaningfulSession({ mechanic: 'quick-pick', attempts: 5, durationMs: 10000 }), true);
});

test('Telegram users get automatic reminders, while a manual pause is respected', async () => {
  const db = database();
  db.exec("INSERT INTO ratings VALUES ('telegram:123', 'Анна', '2020-01-01 00:00:00')");
  db.exec("INSERT INTO study_days VALUES ('telegram:123', '2026-10-19', 0, 0)");
  const previousFetch = globalThis.fetch;
  let requests = 0;
  globalThis.fetch = async () => {
    requests += 1;
    return Response.json({ ok: true, result: { message_id: requests } });
  };
  try {
    const settings = await getNotificationSettings(db, 'telegram:123', now);
    assert.equal(settings.mode, 'all');
    assert.equal(settings.chatAccess, 'unknown');
    const env = { DB: db, BOT_TOKEN: 'test-token', TELEGRAM_BOT_USERNAME: 'testbot', NOTIFICATIONS_PHASE: '1' };
    assert.equal((await runNotificationSchedule(env, now)).sent, 1);
    assert.equal((await getNotificationSettings(db, 'telegram:123', now)).chatAccess, 'granted');
    await updateNotificationSettings(db, 'telegram:123', { mode: 'paused' }, now);
    assert.equal((await getNotificationSettings(db, 'telegram:123', now + 1000)).mode, 'paused');
    assert.equal((await runNotificationSchedule(env, now + 1000)).sent, 0);
    assert.equal(requests, 1);
  } finally { globalThis.fetch = previousFetch; db.close(); }
});

test('migration enables existing Telegram profiles without undoing a chosen pause', async () => {
  const db = database();
  try {
    db.exec("INSERT INTO ratings VALUES ('telegram:123', 'Анна', '2020-01-01 00:00:00')");
    db.exec("INSERT INTO ratings VALUES ('telegram:456', 'Борис', '2020-01-01 00:00:00')");
    db.exec("INSERT INTO notification_preferences (user_id, mode, chat_access, paused_at) VALUES ('telegram:123', 'paused', 'unknown', 0)");
    db.exec("INSERT INTO notification_preferences (user_id, mode, chat_access, paused_at) VALUES ('telegram:456', 'paused', 'unknown', 123)");
    db.exec(readFileSync(new URL('./migrations/0012_auto_notifications.sql', import.meta.url), 'utf8'));
    assert.equal((await getNotificationSettings(db, 'telegram:123', now)).mode, 'all');
    assert.equal((await getNotificationSettings(db, 'telegram:456', now)).mode, 'paused');
  } finally { db.close(); }
});

test('atomic slots cap all scenarios at three, with one study message', async () => {
  const db = database(); fixture(db);
  try {
    const reservations = await Promise.all(['study', 'invite', 'invite', 'invite'].map((category, index) =>
      reserveDelivery(db, 'telegram:123', '2026-10-20', category, category, `case:${index}`, now)));
    assert.equal(reservations.filter(Boolean).length, 3);
    assert.equal(await reserveDelivery(db, 'telegram:123', '2026-10-20', 'study', 'review', 'other', now), null);
    const count = await db.prepare('SELECT COUNT(*) AS count FROM notification_deliveries').bind().first();
    assert.equal(count.count, 3);
  } finally { db.close(); }
});

test('retrying a study event does not duplicate the day or reviews; completion cancels streak', async () => {
  const db = database(); fixture(db);
  try {
    await db.prepare('INSERT INTO study_days (user_id, local_day, completed_at, is_legacy) VALUES (?, ?, ?, 1)').bind('telegram:123', '2026-10-19', now - 86400000).run();
    const user = await db.prepare('SELECT * FROM notification_preferences WHERE user_id = ?').bind('telegram:123').first();
    const before = await candidatesForUser(db, user, now);
    assert.equal(selectScenario(before.candidates).scenario, 'streak');
    const event = { id: '5cc36295-643f-4a81-a5c5-f7a21eb6d4a1', occurredAt: now - 1000,
      mechanic: 'quiz', attempts: 3, correct: 2, durationMs: 30000, vocabularyScore: 28,
      wordUpdates: [{ id: 'common-001', knowledge: 4, correct: 2, wrong: 1,
        lastReviewAt: new Date(now - 1000).toISOString(), lastCorrectAt: new Date(now - 1000).toISOString() }] };
    assert.equal((await ingestStudyEvents(db, 'telegram:123', [event], ['2026-10-18'], now)).accepted, 1);
    assert.equal((await ingestStudyEvents(db, 'telegram:123', [event], ['2026-10-18'], now)).accepted, 0);
    const day = await db.prepare('SELECT COUNT(*) AS count FROM study_days WHERE user_id = ?').bind('telegram:123').first();
    assert.equal(day.count, 3);
    const review = await db.prepare('SELECT COUNT(*) AS count FROM word_review_state WHERE user_id = ?').bind('telegram:123').first();
    assert.equal(review.count, 1);
    const after = await candidatesForUser(db, user, now);
    assert.equal(after.candidates.some((item) => item.scenario === 'streak'), false);
    assert.equal(await dispatchNotification({ DB: db, BOT_TOKEN: 'test', TELEGRAM_BOT_USERNAME: 'testbot' }, user, before.candidates[0], now), false);
  } finally { db.close(); }
});

test('game invitations use the same cap and win over scheduled study in one scan', async () => {
  const db = database(); fixture(db);
  db.exec("INSERT INTO ratings VALUES ('telegram:456', 'Борис', '2020-01-01 00:00:00')");
  db.exec("INSERT INTO study_days (user_id, local_day, completed_at) VALUES ('telegram:123', '2026-10-19', 0)");
  db.exec("INSERT INTO game_invites VALUES ('aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa', 'telegram:456', 'telegram:123', 'auction', 'pending', '2026-10-20 16:00:00')");
  const previousFetch = globalThis.fetch;
  const sent = [];
  globalThis.fetch = async (_url, options) => {
    sent.push(JSON.parse(options.body));
    return Response.json({ ok: true, result: { message_id: sent.length } });
  };
  try {
    const env = { DB: db, BOT_TOKEN: 'test-token', TELEGRAM_BOT_USERNAME: 'testbot', NOTIFICATIONS_PHASE: '1' };
    assert.equal((await runNotificationSchedule(env, now)).sent, 1);
    assert.equal(sent.length, 1);
    assert.match(sent[0].reply_markup.inline_keyboard[0][0].url, /game_aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa/);
    await dispatchInvite(env, 'telegram:123', 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb', 'Борис', 'auction', now);
    await dispatchInvite(env, 'telegram:123', 'cccccccc-cccc-4ccc-cccc-cccccccccccc', 'Борис', 'auction', now);
    assert.equal(sent.length, 3);
    assert.equal(await dispatchInvite(env, 'telegram:123', 'dddddddd-dddd-4ddd-dddd-dddddddddddd', 'Борис', 'auction', now), false);
    assert.equal(sent.length, 3);
  } finally { globalThis.fetch = previousFetch; db.close(); }
});

test('refusal pauses delivery, and settings keep the selected time', async () => {
  const db = database(); fixture(db);
  try {
    const settings = await updateNotificationSettings(db, 'telegram:123', { reminderTime: '20:15', weeklyGoal: 50 }, now);
    assert.equal(settings.reminderTime, '20:15');
    assert.equal(settings.weeklyGoal, 50);
    await updateNotificationSettings(db, 'telegram:123', { chatAccess: 'denied' }, now);
    assert.equal((await getNotificationSettings(db, 'telegram:123', now)).mode, 'paused');
    assert.equal((await db.prepare('SELECT paused_at FROM notification_preferences WHERE user_id = ?').bind('telegram:123').first()).paused_at, now);
  } finally { db.close(); }
});

test('an active study session suppresses a reminder and Telegram refusal stops later attempts', async () => {
  const db = database(); fixture(db);
  const previousFetch = globalThis.fetch;
  let requests = 0;
  globalThis.fetch = async () => {
    requests += 1;
    return Response.json({ ok: false, error_code: 403, description: 'Forbidden: bot was blocked by the user' }, { status: 403 });
  };
  try {
    const env = { DB: db, BOT_TOKEN: 'test-token', TELEGRAM_BOT_USERNAME: 'testbot' };
    const user = await db.prepare('SELECT * FROM notification_preferences WHERE user_id = ?').bind('telegram:123').first();
    const item = { scenario: 'review', reviewDue: 2, exactReviewCount: false, dedupeKey: 'active:test' };
    await db.prepare('UPDATE notification_preferences SET active_until = ? WHERE user_id = ?').bind(now + 60_000, 'telegram:123').run();
    assert.equal(await dispatchNotification(env, user, item, now), false);
    assert.equal(requests, 0);
    await db.prepare('UPDATE notification_preferences SET active_until = 0 WHERE user_id = ?').bind('telegram:123').run();
    assert.equal(await dispatchNotification(env, user, item, now), false);
    assert.equal(requests, 1);
    assert.equal((await getNotificationSettings(db, 'telegram:123', now)).chatAccess, 'blocked');
    assert.equal((await db.prepare('SELECT paused_at FROM notification_preferences WHERE user_id = ?').bind('telegram:123').first()).paused_at, now);
    assert.equal(await dispatchNotification(env, user, { ...item, dedupeKey: 'second' }, now), false);
    assert.equal(requests, 1);
    const resumed = await updateNotificationSettings(db, 'telegram:123', { mode: 'all' }, now + 1000);
    assert.equal(resumed.chatAccess, 'unknown');
    assert.equal(resumed.mode, 'all');
  } finally { globalThis.fetch = previousFetch; db.close(); }
});
