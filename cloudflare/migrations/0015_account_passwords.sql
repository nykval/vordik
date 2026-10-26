CREATE TABLE IF NOT EXISTS account_credentials (
  user_id TEXT PRIMARY KEY REFERENCES phone_accounts(user_id) ON DELETE CASCADE,
  telegram_user_id TEXT UNIQUE,
  telegram_username TEXT UNIQUE,
  password_salt TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
