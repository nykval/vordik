CREATE TABLE IF NOT EXISTS notification_preferences (
  user_id TEXT PRIMARY KEY REFERENCES ratings(user_id) ON DELETE CASCADE,
  mode TEXT NOT NULL DEFAULT 'paused' CHECK (mode IN ('all', 'essential', 'paused')),
  reminder_time TEXT NOT NULL DEFAULT '19:00',
  timezone TEXT NOT NULL DEFAULT 'Europe/Moscow',
  chat_access TEXT NOT NULL DEFAULT 'unknown' CHECK (chat_access IN ('unknown', 'granted', 'denied', 'blocked')),
  weekly_goal INTEGER NOT NULL DEFAULT 20 CHECK (weekly_goal BETWEEN 5 AND 500),
  active_until INTEGER NOT NULL DEFAULT 0,
  last_seen_at INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS study_events (
  event_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES ratings(user_id) ON DELETE CASCADE,
  occurred_at INTEGER NOT NULL,
  local_day TEXT NOT NULL,
  mechanic TEXT NOT NULL,
  attempts INTEGER NOT NULL,
  correct INTEGER NOT NULL,
  duration_ms INTEGER NOT NULL,
  vocabulary_score INTEGER NOT NULL,
  word_updates TEXT NOT NULL DEFAULT '[]',
  received_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS study_events_user_day ON study_events(user_id, local_day);

CREATE TABLE IF NOT EXISTS study_days (
  user_id TEXT NOT NULL REFERENCES ratings(user_id) ON DELETE CASCADE,
  local_day TEXT NOT NULL,
  completed_at INTEGER NOT NULL,
  is_legacy INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, local_day)
);

CREATE TABLE IF NOT EXISTS word_review_state (
  user_id TEXT NOT NULL REFERENCES ratings(user_id) ON DELETE CASCADE,
  word_id TEXT NOT NULL,
  knowledge INTEGER NOT NULL,
  correct_answers INTEGER NOT NULL,
  wrong_answers INTEGER NOT NULL,
  last_review_at INTEGER NOT NULL,
  last_correct_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, word_id)
);
CREATE INDEX IF NOT EXISTS word_review_due ON word_review_state(user_id, last_review_at);

CREATE TABLE IF NOT EXISTS weekly_goals (
  user_id TEXT NOT NULL REFERENCES ratings(user_id) ON DELETE CASCADE,
  week_start TEXT NOT NULL,
  baseline_score INTEGER NOT NULL,
  goal_delta INTEGER NOT NULL,
  PRIMARY KEY (user_id, week_start)
);

CREATE TABLE IF NOT EXISTS notification_deliveries (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES ratings(user_id) ON DELETE CASCADE,
  local_day TEXT NOT NULL,
  slot INTEGER NOT NULL CHECK (slot BETWEEN 1 AND 3),
  category TEXT NOT NULL CHECK (category IN ('invite', 'study')),
  scenario TEXT NOT NULL,
  dedupe_key TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL CHECK (status IN ('reserved', 'sent', 'failed', 'unknown')),
  telegram_message_id INTEGER,
  telegram_error_code INTEGER,
  reserved_at INTEGER NOT NULL,
  finished_at INTEGER
);
CREATE UNIQUE INDEX IF NOT EXISTS notification_active_slot
  ON notification_deliveries(user_id, local_day, slot)
  WHERE status IN ('reserved', 'sent', 'unknown');
CREATE INDEX IF NOT EXISTS notification_history ON notification_deliveries(user_id, local_day, status);
