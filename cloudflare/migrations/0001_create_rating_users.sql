CREATE TABLE IF NOT EXISTS rating_users (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  score INTEGER NOT NULL DEFAULT 0 CHECK (score >= 0),
  vocabulary_size INTEGER NOT NULL DEFAULT 0 CHECK (vocabulary_size >= 0),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS rating_users_leaderboard
  ON rating_users (score DESC, vocabulary_size DESC, name COLLATE NOCASE ASC);
