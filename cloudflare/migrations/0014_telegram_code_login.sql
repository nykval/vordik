CREATE TABLE IF NOT EXISTS telegram_login_challenges (
  challenge_id TEXT PRIMARY KEY,
  browser_hash TEXT NOT NULL,
  link_hash TEXT NOT NULL UNIQUE,
  phone_hash TEXT NOT NULL,
  phone_mask TEXT NOT NULL,
  code_hash TEXT,
  user_id TEXT,
  chat_id INTEGER,
  telegram_username TEXT,
  name TEXT,
  attempts INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'awaiting_contact', 'sending', 'delivered')),
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS telegram_login_challenges_expiry ON telegram_login_challenges(expires_at);
CREATE INDEX IF NOT EXISTS telegram_login_challenges_chat ON telegram_login_challenges(chat_id, status, expires_at);

CREATE TABLE IF NOT EXISTS telegram_login_sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  joined_at TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS telegram_login_sessions_expiry ON telegram_login_sessions(expires_at);
