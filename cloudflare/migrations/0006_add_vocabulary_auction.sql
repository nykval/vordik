ALTER TABLE game_invites ADD COLUMN game_type TEXT NOT NULL DEFAULT 'word_chain';
ALTER TABLE games ADD COLUMN game_type TEXT NOT NULL DEFAULT 'word_chain';
ALTER TABLE games ADD COLUMN rounds_played INTEGER NOT NULL DEFAULT 0;
ALTER TABLE games ADD COLUMN correct_words INTEGER NOT NULL DEFAULT 0;
ALTER TABLE games ADD COLUMN max_bid INTEGER NOT NULL DEFAULT 0;
ALTER TABLE games ADD COLUMN best_round INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS games_type_players_idx
  ON games(game_type, player_one_id, player_two_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS game_invites_type_idx
  ON game_invites(game_type, invitee_id, status, created_at DESC);
