const DAY = 86_400_000;
const ACTIVE_STATUSES = "'reserved','sent','unknown'";
const SCENARIO_ORDER = Object.freeze(['invite', 'streak', 'review', 'goal', 'milestone', 'digest', 'winback']);

export function localClock(now, timezone) {
  const pieces = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23', weekday: 'short',
  }).formatToParts(new Date(now));
  const values = Object.fromEntries(pieces.map((piece) => [piece.type, piece.value]));
  return { day: `${values.year}-${values.month}-${values.day}`, minute: Number(values.hour) * 60 + Number(values.minute), weekday: values.weekday };
}

export function validTimezone(value) {
  try { localClock(Date.now(), value); return true; } catch { return false; }
}

export function allowedAt(now, timezone, reminderTime, scenario) {
  const clock = localClock(now, timezone);
  const [hour, minute] = reminderTime.split(':').map(Number);
  const chosen = hour * 60 + minute;
  const threshold = scenario === 'streak' ? Math.max(chosen, 18 * 60) : chosen;
  return clock.minute >= 9 * 60 && clock.minute <= 21 * 60 && clock.minute >= threshold;
}

export function meaningfulSession(event) {
  const attempts = Number(event.attempts);
  const duration = Number(event.durationMs);
  if (!Number.isInteger(attempts) || attempts < 0 || attempts > 500) return false;
  if (!Number.isInteger(duration) || duration < 0 || duration > 3_600_000) return false;
  if (event.mechanic === 'five-letter') return attempts >= 1 && duration >= 10_000;
  if (event.mechanic === 'quick-pick') return attempts >= 5 && duration >= 10_000;
  if (event.mechanic === 'timed') return attempts >= 3 && duration >= 8_000;
  return ['cards', 'memory', 'quiz', 'typing', 'timed', 'puzzle'].includes(event.mechanic)
    && attempts >= 3 && duration >= 20_000;
}

export function selectScenario(candidates) {
  for (const scenario of SCENARIO_ORDER) if (candidates.some((item) => item.scenario === scenario)) return candidates.find((item) => item.scenario === scenario);
  return null;
}

export function consecutiveDays(days, today) {
  const set = new Set(days);
  let date = Date.parse(`${today}T00:00:00Z`);
  if (!set.has(today)) date -= DAY;
  let count = 0;
  for (; count < 3650; count += 1, date -= DAY) {
    if (!set.has(new Date(date).toISOString().slice(0, 10))) break;
  }
  return count;
}

function weekStart(day) {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7));
  return date.toISOString().slice(0, 10);
}

function dayGap(later, earlier) {
  return Math.round((Date.parse(`${later}T00:00:00Z`) - Date.parse(`${earlier}T00:00:00Z`)) / DAY);
}

function activityTime(value) {
  const source = String(value ?? '').trim();
  if (!source) return 0;
  return Date.parse(source.includes('T') ? source : `${source.replace(' ', 'T')}Z`) || 0;
}

export function notificationCopy(item, botUsername) {
  const start = item.scenario === 'invite' ? `game_${item.inviteId}`
    : item.scenario === 'review' ? 'review'
      : ['goal', 'milestone', 'digest'].includes(item.scenario) ? 'progress' : 'study';
  const url = `https://t.me/${encodeURIComponent(botUsername)}?startapp=${encodeURIComponent(start)}`;
  const action = item.scenario === 'invite' ? 'Открыть приглашение'
    : item.scenario === 'review' ? 'Повторить слова'
      : ['goal', 'milestone', 'digest'].includes(item.scenario) ? 'Мой прогресс' : 'Начать занятие';
  let text;
  switch (item.scenario) {
    case 'invite': text = `🎮 ${item.inviterName} приглашает вас сыграть в «${item.gameType === 'auction' ? 'Словарный аукцион' : 'Цепочку слов'}».`; break;
    case 'streak': text = `🔥 Сегодня можно продолжить серию: ${item.streak} ${item.streak === 1 ? 'день' : 'дней'} подряд. Короткое занятие поможет сохранить ритм.${item.reviewDue ? ' Заодно повторите слова, которым нужно внимание.' : ''}`; break;
    case 'review': text = `📚 ${item.exactReviewCount ? `${item.reviewDue} слов ждут повторения.` : 'Есть слова, которые стоит повторить.'} Несколько минут практики помогут их закрепить.`; break;
    case 'goal': {
      const ending = item.remaining % 100;
      const unit = ending >= 11 && ending <= 14 ? 'баллов словаря'
        : item.remaining % 10 === 1 ? 'балл словаря'
          : [2, 3, 4].includes(item.remaining % 10) ? 'балла словаря' : 'баллов словаря';
      text = `🎯 До недельной цели осталось ${item.remaining} ${unit}. Продолжайте в своём темпе.`;
      break;
    }
    case 'milestone': text = item.milestoneType === 'mastered' ? `✨ Вы освоили ${item.milestone} слов. Посмотрите свой прогресс.` : `🔥 Серия достигла ${item.milestone} дней. Посмотрите свой прогресс.`; break;
    case 'digest': text = `📈 За неделю вы завершили ${item.sessions} занятий и прибавили ${item.gain} баллов словаря. Посмотрите свой прогресс.`; break;
    default: text = '👋 Можно вернуться к словам с короткого занятия. Начните в удобном темпе.';
  }
  return { text, reply_markup: { inline_keyboard: [[{ text: action, url }]] } };
}

async function ensurePreferences(db, userId, now) {
  await db.prepare(`INSERT OR IGNORE INTO notification_preferences
    (user_id, mode, last_seen_at, updated_at) VALUES (?, 'all', ?, ?)`).bind(userId, now, now).run();
  await db.prepare(`UPDATE notification_preferences SET mode = 'all', updated_at = ?
    WHERE user_id = ? AND mode = 'paused' AND paused_at = 0 AND chat_access = 'unknown'`).bind(now, userId).run();
  return db.prepare('SELECT * FROM notification_preferences WHERE user_id = ?').bind(userId).first();
}

export async function getNotificationSettings(db, userId, now = Date.now()) {
  const row = await ensurePreferences(db, userId, now);
  return { mode: row.mode, reminderTime: row.reminder_time, timezone: row.timezone,
    chatAccess: row.chat_access, weeklyGoal: row.weekly_goal };
}

export async function updateNotificationSettings(db, userId, input, now = Date.now()) {
  await ensurePreferences(db, userId, now);
  const fields = [];
  const values = [];
  if (input.mode !== undefined) {
    if (!['all', 'essential', 'paused'].includes(input.mode)) throw new Error('Некорректный режим сообщений');
    if (input.mode === 'paused' && input.chatAccess !== 'denied') {
      fields.push("paused_at = CASE WHEN mode <> 'paused' THEN ? ELSE paused_at END"); values.push(now);
    }
    fields.push('mode = ?'); values.push(input.mode);
  }
  if (input.reminderTime !== undefined) {
    if (!/^(09|1\d|20|21):[0-5]\d$/.test(input.reminderTime) || input.reminderTime > '21:00') throw new Error('Выберите время с 09:00 до 21:00');
    fields.push('reminder_time = ?'); values.push(input.reminderTime);
  }
  if (input.timezone !== undefined) {
    if (typeof input.timezone !== 'string' || input.timezone.length > 80 || !validTimezone(input.timezone)) throw new Error('Некорректный часовой пояс');
    fields.push('timezone = ?'); values.push(input.timezone);
  }
  if (input.weeklyGoal !== undefined) {
    if (!Number.isInteger(input.weeklyGoal) || input.weeklyGoal < 5 || input.weeklyGoal > 500) throw new Error('Выберите цель от 5 до 500 баллов');
    fields.push('weekly_goal = ?'); values.push(input.weeklyGoal);
  }
  if (input.chatAccess !== undefined) {
    if (!['granted', 'denied'].includes(input.chatAccess)) throw new Error('Некорректный доступ к чату');
    fields.push('chat_access = ?'); values.push(input.chatAccess);
    if (input.chatAccess === 'denied') {
      fields.push("paused_at = CASE WHEN mode <> 'paused' THEN ? ELSE paused_at END"); values.push(now);
      fields.push("mode = 'paused'");
    }
  }
  if (input.mode && input.mode !== 'paused') {
    const current = await getNotificationSettings(db, userId, now);
    if (current.chatAccess === 'blocked' || current.chatAccess === 'denied') {
      fields.push("chat_access = 'unknown'");
    }
  }
  if (fields.length) await db.prepare(`UPDATE notification_preferences SET ${fields.join(', ')}, updated_at = ? WHERE user_id = ?`).bind(...values, now, userId).run();
  if (input.weeklyGoal !== undefined) {
    const settings = await getNotificationSettings(db, userId, now);
    const week = weekStart(localClock(now, settings.timezone).day);
    const latest = await db.prepare('SELECT vocabulary_score FROM study_events WHERE user_id = ? ORDER BY occurred_at DESC LIMIT 1').bind(userId).first();
    await db.prepare('INSERT OR IGNORE INTO weekly_goals (user_id, week_start, baseline_score, goal_delta) VALUES (?, ?, ?, ?)')
      .bind(userId, week, Number(latest?.vocabulary_score ?? 0), input.weeklyGoal).run();
    await db.prepare('UPDATE weekly_goals SET goal_delta = ? WHERE user_id = ? AND week_start = ?').bind(input.weeklyGoal, userId, week).run();
  }
  return getNotificationSettings(db, userId, now);
}

export async function recordActivity(db, userId, active, now = Date.now()) {
  await ensurePreferences(db, userId, now);
  await db.prepare('UPDATE notification_preferences SET active_until = ?, last_seen_at = ? WHERE user_id = ?')
    .bind(active ? now + 5 * 60_000 : 0, now, userId).run();
}

function cleanWordUpdates(updates, now) {
  if (!Array.isArray(updates)) return [];
  return updates.slice(0, 20).filter((word) => typeof word?.id === 'string' && /^[a-zA-Z0-9_-]{1,100}$/.test(word.id))
    .map((word) => ({ id: word.id, knowledge: Math.min(10, Math.max(0, Number(word.knowledge) || 0)),
      correct: Math.min(100000, Math.max(0, Number(word.correct) || 0)), wrong: Math.min(100000, Math.max(0, Number(word.wrong) || 0)),
      lastReviewAt: Math.min(now, Math.max(0, Date.parse(word.lastReviewAt) || 0)),
      lastCorrectAt: Math.min(now, Math.max(0, Date.parse(word.lastCorrectAt) || 0)) }));
}

export async function ingestStudyEvents(db, userId, events, legacyDays = [], now = Date.now()) {
  if (!Array.isArray(events) || events.length > 20) throw new Error('Некорректный список занятий');
  const prefs = await ensurePreferences(db, userId, now);
  const today = localClock(now, prefs.timezone).day;
  if (Array.isArray(legacyDays)) {
    for (const day of legacyDays.slice(-365)) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || day > today || dayGap(today, day) > 365) continue;
      await db.prepare('INSERT OR IGNORE INTO study_days (user_id, local_day, completed_at, is_legacy) VALUES (?, ?, ?, 1)')
        .bind(userId, day, Date.parse(`${day}T12:00:00Z`)).run();
    }
  }
  let accepted = 0;
  for (const event of events) {
    if (!/^[a-f\d-]{36}$/i.test(String(event?.id ?? '')) || !meaningfulSession(event)) continue;
    const occurredAt = Number(event.occurredAt);
    if (!Number.isInteger(occurredAt) || occurredAt > now + 60_000 || occurredAt < now - 7 * DAY) continue;
    const day = localClock(occurredAt, prefs.timezone).day;
    const score = Math.min(10_000_000, Math.max(0, Number(event.vocabularyScore) || 0));
    const updates = cleanWordUpdates(event.wordUpdates, now);
    const insert = await db.prepare(`INSERT OR IGNORE INTO study_events
      (event_id, user_id, occurred_at, local_day, mechanic, attempts, correct, duration_ms, vocabulary_score, word_updates, received_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(event.id, userId, occurredAt, day, event.mechanic,
      event.attempts, Math.min(event.attempts, Math.max(0, Number(event.correct) || 0)), event.durationMs, score, JSON.stringify(updates), now).run();
    if (!insert.meta?.changes) continue;
    accepted += 1;
    await db.prepare('INSERT OR IGNORE INTO study_days (user_id, local_day, completed_at) VALUES (?, ?, ?)').bind(userId, day, occurredAt).run();
    for (const word of updates) await db.prepare(`INSERT INTO word_review_state
      (user_id, word_id, knowledge, correct_answers, wrong_answers, last_review_at, last_correct_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(user_id, word_id) DO UPDATE SET knowledge = excluded.knowledge,
      correct_answers = MAX(word_review_state.correct_answers, excluded.correct_answers),
      wrong_answers = MAX(word_review_state.wrong_answers, excluded.wrong_answers),
      last_review_at = MAX(word_review_state.last_review_at, excluded.last_review_at),
      last_correct_at = MAX(word_review_state.last_correct_at, excluded.last_correct_at),
      relearned_at = CASE WHEN word_review_state.knowledge < 8 AND excluded.knowledge >= 8
        AND word_review_state.wrong_answers > 0 THEN excluded.updated_at ELSE word_review_state.relearned_at END,
      updated_at = excluded.updated_at`)
      .bind(userId, word.id, word.knowledge, word.correct, word.wrong, word.lastReviewAt, word.lastCorrectAt, now).run();
    const week = weekStart(day);
    const first = await db.prepare('SELECT vocabulary_score FROM study_events WHERE user_id = ? AND local_day < ? ORDER BY occurred_at DESC LIMIT 1')
      .bind(userId, week).first();
    await db.prepare('INSERT OR IGNORE INTO weekly_goals (user_id, week_start, baseline_score, goal_delta) VALUES (?, ?, ?, ?)')
      .bind(userId, week, Number(first?.vocabulary_score ?? score), prefs.weekly_goal).run();
  }
  return { accepted, duplicateOrInvalid: events.length - accepted };
}

async function recentDays(db, userId, beforeDay) {
  const rows = await db.prepare('SELECT local_day FROM study_days WHERE user_id = ? AND local_day <= ? ORDER BY local_day DESC LIMIT 45').bind(userId, beforeDay).all();
  return rows.results.map((row) => row.local_day);
}

export async function candidatesForUser(db, user, now = Date.now()) {
  const clock = localClock(now, user.timezone);
  const days = await recentDays(db, user.user_id, clock.day);
  const doneToday = days.includes(clock.day);
  const streak = consecutiveDays(days, clock.day);
  const lastDay = days[0];
  const gap = lastDay ? dayGap(clock.day, lastDay) : Infinity;
  // Review events contain only touched words; the server cannot claim a full dictionary count.
  const exactReviewCount = false;
  const due = await db.prepare(`SELECT COUNT(*) AS count FROM word_review_state
    WHERE user_id = ? AND last_review_at > 0 AND
      ((wrong_answers > 0 AND knowledge < 6) OR (knowledge < 8 AND last_review_at < ?))`)
    .bind(user.user_id, now - 3 * DAY).first();
  const reviewDue = Number(due?.count ?? 0);
  const candidates = [];
  if (!doneToday && streak > 0 && allowedAt(now, user.timezone, user.reminder_time, 'streak')) {
    candidates.push({ scenario: 'streak', streak, reviewDue, dedupeKey: `streak:${user.user_id}:${clock.day}` });
  }
  if (!doneToday && reviewDue > 0 && allowedAt(now, user.timezone, user.reminder_time, 'review')) {
    candidates.push({ scenario: 'review', reviewDue, exactReviewCount, dedupeKey: `review:${user.user_id}:${clock.day}` });
  }
  if (user.mode === 'all' && allowedAt(now, user.timezone, user.reminder_time, 'goal')) {
    const week = weekStart(clock.day);
    const goal = await db.prepare('SELECT baseline_score, goal_delta FROM weekly_goals WHERE user_id = ? AND week_start = ?').bind(user.user_id, week).first();
    const lastEvent = await db.prepare('SELECT vocabulary_score FROM study_events WHERE user_id = ? ORDER BY occurred_at DESC LIMIT 1').bind(user.user_id).first();
    const gain = Math.max(0, Number(lastEvent?.vocabulary_score ?? 0) - Number(goal?.baseline_score ?? 0));
    if (goal && gain >= Math.ceil(goal.goal_delta * .8) && gain < goal.goal_delta)
      candidates.push({ scenario: 'goal', remaining: goal.goal_delta - gain, dedupeKey: `goal:${user.user_id}:${week}` });
    const sessions = await db.prepare('SELECT COUNT(*) AS count FROM study_events WHERE user_id = ? AND local_day >= ?').bind(user.user_id, week).first();
    if (clock.weekday === 'Sun' && (Number(sessions?.count) >= 2 || gain > 0))
      candidates.push({ scenario: 'digest', sessions: Number(sessions?.count), gain, dedupeKey: `digest:${user.user_id}:${week}` });
    if (doneToday) {
      const milestone = [3, 7, 14, 30, 60, 100].find((value) => value === streak);
      if (milestone) candidates.push({ scenario: 'milestone', milestone, milestoneType: 'streak', dedupeKey: `milestone:streak:${user.user_id}:${milestone}` });
      const mastered = await db.prepare('SELECT COUNT(*) AS count FROM word_review_state WHERE user_id = ? AND knowledge >= 8 AND correct_answers >= 2').bind(user.user_id).first();
      const wordMilestone = [500, 250, 100, 50, 25, 10].find((value) => Number(mastered?.count) >= value);
      if (wordMilestone) candidates.push({ scenario: 'milestone', milestone: wordMilestone, milestoneType: 'mastered', dedupeKey: `milestone:words:${user.user_id}:${wordMilestone}` });
    }
    if (!doneToday && [3, 7, 14].includes(gap)) candidates.push({ scenario: 'winback', dedupeKey: `winback:${user.user_id}:${gap}` });
  }
  return { candidates, doneToday, clock };
}

export async function reserveDelivery(db, userId, localDay, category, scenario, dedupeKey, now = Date.now()) {
  const id = crypto.randomUUID();
  const result = await db.prepare(`INSERT OR IGNORE INTO notification_deliveries
    (id, user_id, local_day, slot, category, scenario, dedupe_key, status, reserved_at)
    SELECT ?, ?, ?, slot, ?, ?, ?, 'reserved', ? FROM
      (SELECT 1 AS slot UNION ALL SELECT 2 UNION ALL SELECT 3) AS available
    WHERE NOT EXISTS (SELECT 1 FROM notification_deliveries AS used
      WHERE used.user_id = ? AND used.local_day = ? AND used.slot = available.slot AND used.status IN (${ACTIVE_STATUSES}))
      AND (? <> 'study' OR NOT EXISTS (SELECT 1 FROM notification_deliveries AS study
        WHERE study.user_id = ? AND study.local_day = ? AND study.category = 'study' AND study.status IN (${ACTIVE_STATUSES})))
    ORDER BY slot LIMIT 1 RETURNING id, slot`)
    .bind(id, userId, localDay, category, scenario, dedupeKey, now, userId, localDay, category, userId, localDay).first();
  return result?.id ?? null;
}

export async function dispatchNotification(env, user, item, now = Date.now()) {
  const botToken = String(env.BOT_TOKEN ?? '').trim();
  const botUsername = String(env.TELEGRAM_BOT_USERNAME ?? '').trim().replace(/^@/, '');
  const chatId = String(user.user_id).match(/^telegram:(\d+)$/)?.[1];
  if (!botToken || !botUsername || !chatId || !['unknown', 'granted'].includes(user.chat_access) || user.mode === 'paused') return false;
  const fresh = await env.DB.prepare('SELECT active_until, mode, chat_access FROM notification_preferences WHERE user_id = ?').bind(user.user_id).first();
  if (!fresh || fresh.mode === 'paused' || !['unknown', 'granted'].includes(fresh.chat_access)) return false;
  if (item.scenario !== 'invite' && fresh.mode !== 'all' && !['streak'].includes(item.scenario)) return false;
  if (item.scenario !== 'invite') {
    if (Number(fresh.active_until) > now) return false;
  }
  const clock = localClock(now, user.timezone);
  if (!allowedAt(now, user.timezone, user.reminder_time, item.scenario)) return false;
  if (['streak', 'review', 'winback'].includes(item.scenario)) {
    const completed = await env.DB.prepare('SELECT 1 AS found FROM study_days WHERE user_id = ? AND local_day = ?').bind(user.user_id, clock.day).first();
    if (completed) return false;
  }
  const category = item.scenario === 'invite' ? 'invite' : 'study';
  const id = await reserveDelivery(env.DB, user.user_id, clock.day, category, item.scenario, item.dedupeKey, now);
  if (!id) return false;
  const body = { chat_id: chatId, ...notificationCopy(item, botUsername) };
  let status = 'unknown'; let telegramMessageId = null; let telegramErrorCode = null;
  try {
    const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      signal: AbortSignal.timeout(10_000),
    });
    const result = await response.json();
    status = response.ok && result.ok ? 'sent' : 'failed';
    telegramMessageId = result.result?.message_id ?? null;
    telegramErrorCode = result.error_code ?? response.status;
    if (status === 'sent' && fresh.chat_access !== 'granted') {
      await env.DB.prepare("UPDATE notification_preferences SET chat_access = 'granted', updated_at = ? WHERE user_id = ?")
        .bind(now, user.user_id).run();
    }
    const refused = telegramErrorCode === 403 || (telegramErrorCode === 400
      && /chat not found|bot was blocked|user is deactivated/i.test(String(result.description ?? '')));
    if (refused) await env.DB.prepare(`UPDATE notification_preferences SET chat_access = 'blocked',
      paused_at = CASE WHEN mode <> 'paused' THEN ? ELSE paused_at END,
      mode = 'paused', updated_at = ? WHERE user_id = ?`).bind(now, now, user.user_id).run();
  } catch { /* Outcome is unknown: keep the slot to prevent a duplicate. */ }
  await env.DB.prepare(`UPDATE notification_deliveries SET status = ?, telegram_message_id = ?, telegram_error_code = ?, finished_at = ? WHERE id = ?`)
    .bind(status, telegramMessageId, telegramErrorCode, Date.now(), id).run();
  return status === 'sent';
}

export async function dispatchInvite(env, inviteeId, inviteId, inviterName, gameType, now = Date.now()) {
  if (!/^telegram:\d+$/.test(inviteeId)) return false;
  await ensurePreferences(env.DB, inviteeId, now);
  const user = await env.DB.prepare(`SELECT p.*, r.user_id, r.updated_at AS rating_updated_at FROM notification_preferences AS p
    JOIN ratings AS r ON r.user_id = p.user_id WHERE p.user_id = ?`).bind(inviteeId).first();
  if (!user || activityTime(user.rating_updated_at) > now - 10_000) return false;
  return dispatchNotification(env, user, { scenario: 'invite', inviteId, inviterName, gameType,
    dedupeKey: `invite:${inviteId}` }, now);
}

export async function runNotificationSchedule(env, now = Date.now()) {
  const phase = Math.max(1, Math.min(2, Number(env.NOTIFICATIONS_PHASE) || 1));
  let sent = 0; let scanned = 0; let cursor = '';
  for (;;) {
    const rows = await env.DB.prepare(`SELECT p.*, r.user_id, r.updated_at AS rating_updated_at FROM notification_preferences AS p
      JOIN ratings AS r ON r.user_id = p.user_id
      WHERE p.mode <> 'paused' AND p.chat_access IN ('unknown', 'granted') AND r.user_id LIKE 'telegram:%'
        AND p.user_id > ? ORDER BY p.user_id LIMIT 200`).bind(cursor).all();
    if (!rows.results.length) break;
    scanned += rows.results.length;
    for (const user of rows.results) {
    try {
      if (Number(user.active_until) > now) continue;
      const lastSeen = activityTime(user.rating_updated_at);
      const pending = await env.DB.prepare(`SELECT gi.id, gi.game_type, r.name
        FROM game_invites AS gi JOIN ratings AS r ON r.user_id = gi.inviter_id
        WHERE gi.invitee_id = ? AND gi.status = 'pending' AND gi.created_at >= datetime(?, 'unixepoch')
        ORDER BY gi.created_at ASC LIMIT 1`).bind(user.user_id, Math.floor((now - DAY) / 1000)).first();
      if (pending && lastSeen < now - 10_000) {
        const sentInvite = await dispatchNotification(env, user, { scenario: 'invite', inviteId: pending.id,
          inviterName: pending.name, gameType: pending.game_type, dedupeKey: `invite:${pending.id}` }, now);
        if (sentInvite) { sent += 1; continue; }
      }
      const { candidates } = await candidatesForUser(env.DB, user, now);
      const allowed = phase === 1 ? candidates.filter((item) => ['streak', 'review'].includes(item.scenario)) : candidates;
      const chosen = selectScenario(allowed);
      if (chosen && await dispatchNotification(env, user, chosen, now)) sent += 1;
    } catch (error) { console.error('Notification scan failed', user.user_id, error); }
    }
    cursor = rows.results.at(-1).user_id;
    if (rows.results.length < 200) break;
  }
  return { scanned, sent };
}
