CREATE TABLE IF NOT EXISTS ratings (
  user_id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  score INTEGER NOT NULL DEFAULT 0 CHECK (score >= 0),
  vocabulary_size INTEGER NOT NULL DEFAULT 0 CHECK (vocabulary_size >= 0),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS ratings_order_idx
  ON ratings (score DESC, vocabulary_size DESC, name COLLATE NOCASE ASC);
