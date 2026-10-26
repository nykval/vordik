CREATE TABLE IF NOT EXISTS phone_accounts (
  user_id TEXT PRIMARY KEY,
  phone_hash TEXT NOT NULL UNIQUE,
  phone_mask TEXT NOT NULL,
  name TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS phone_challenges (
  phone_hash TEXT PRIMARY KEY,
  challenge_id TEXT NOT NULL UNIQUE,
  code_hash TEXT NOT NULL,
  phone_mask TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  expires_at INTEGER NOT NULL,
  resend_after INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS phone_challenges_expiry ON phone_challenges(expires_at);

CREATE TABLE IF NOT EXISTS account_sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES phone_accounts(user_id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS account_sessions_expiry ON account_sessions(expires_at);
CREATE INDEX IF NOT EXISTS account_sessions_user ON account_sessions(user_id);

CREATE TABLE IF NOT EXISTS auth_rate_limits (
  bucket_key TEXT PRIMARY KEY,
  count INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS auth_rate_limits_expiry ON auth_rate_limits(expires_at);
