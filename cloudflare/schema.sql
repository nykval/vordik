CREATE TABLE IF NOT EXISTS ratings (
  user_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  avatar_id TEXT NOT NULL DEFAULT 'avatar-01-dark-hair',
  avatar_customized INTEGER NOT NULL DEFAULT 0 CHECK (avatar_customized IN (0, 1)),
  score INTEGER NOT NULL DEFAULT 0 CHECK (score >= 0),
  vocabulary_size INTEGER NOT NULL DEFAULT 0 CHECK (vocabulary_size >= 0),
  average_difficulty INTEGER NOT NULL DEFAULT 0 CHECK (average_difficulty BETWEEN 0 AND 6),
  friend_code TEXT,
  friend_invite_token TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS ratings_order_idx
ON ratings(score DESC, vocabulary_size DESC, name ASC);

CREATE UNIQUE INDEX IF NOT EXISTS ratings_friend_code_idx ON ratings(friend_code) WHERE friend_code IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS ratings_friend_invite_token_idx ON ratings(friend_invite_token) WHERE friend_invite_token IS NOT NULL;

CREATE TABLE IF NOT EXISTS friend_requests (
  requester_id TEXT NOT NULL,
  addressee_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (requester_id, addressee_id),
  FOREIGN KEY (requester_id) REFERENCES ratings(user_id) ON DELETE CASCADE,
  FOREIGN KEY (addressee_id) REFERENCES ratings(user_id) ON DELETE CASCADE,
  CHECK (requester_id <> addressee_id)
);
CREATE INDEX IF NOT EXISTS friend_requests_addressee_idx ON friend_requests(addressee_id, created_at DESC);

CREATE TABLE IF NOT EXISTS friendships (
  user_a TEXT NOT NULL,
  user_b TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_a, user_b),
  FOREIGN KEY (user_a) REFERENCES ratings(user_id) ON DELETE CASCADE,
  FOREIGN KEY (user_b) REFERENCES ratings(user_id) ON DELETE CASCADE,
  CHECK (user_a < user_b)
);
CREATE INDEX IF NOT EXISTS friendships_user_b_idx ON friendships(user_b, created_at DESC);

CREATE TABLE IF NOT EXISTS games (
  id TEXT PRIMARY KEY,
  player_one_id TEXT NOT NULL,
  player_two_id TEXT NOT NULL,
  game_type TEXT NOT NULL DEFAULT 'word_chain',
  status TEXT NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting', 'active', 'finished')),
  winner_id TEXT,
  finish_reason TEXT,
  rounds_played INTEGER NOT NULL DEFAULT 0,
  correct_words INTEGER NOT NULL DEFAULT 0,
  max_bid INTEGER NOT NULL DEFAULT 0,
  best_round INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  started_at TEXT,
  finished_at TEXT,
  FOREIGN KEY (player_one_id) REFERENCES ratings(user_id) ON DELETE CASCADE,
  FOREIGN KEY (player_two_id) REFERENCES ratings(user_id) ON DELETE CASCADE,
  FOREIGN KEY (winner_id) REFERENCES ratings(user_id) ON DELETE SET NULL,
  CHECK (player_one_id <> player_two_id)
);
CREATE INDEX IF NOT EXISTS games_player_one_idx ON games(player_one_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS games_player_two_idx ON games(player_two_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS games_type_players_idx ON games(game_type, player_one_id, player_two_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS game_invites (
  id TEXT PRIMARY KEY,
  inviter_id TEXT NOT NULL,
  invitee_id TEXT NOT NULL,
  game_type TEXT NOT NULL DEFAULT 'word_chain',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected', 'cancelled')),
  game_id TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (inviter_id) REFERENCES ratings(user_id) ON DELETE CASCADE,
  FOREIGN KEY (invitee_id) REFERENCES ratings(user_id) ON DELETE CASCADE,
  FOREIGN KEY (game_id) REFERENCES games(id) ON DELETE SET NULL,
  CHECK (inviter_id <> invitee_id)
);
CREATE INDEX IF NOT EXISTS game_invites_incoming_idx ON game_invites(invitee_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS game_invites_type_idx ON game_invites(game_type, invitee_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS game_connection_tokens (
  token_hash TEXT PRIMARY KEY,
  game_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  FOREIGN KEY (game_id) REFERENCES games(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES ratings(user_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS game_connection_tokens_expiry_idx ON game_connection_tokens(expires_at);
