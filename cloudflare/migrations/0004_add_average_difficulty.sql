ALTER TABLE ratings
ADD COLUMN average_difficulty INTEGER NOT NULL DEFAULT 0
CHECK (average_difficulty BETWEEN 0 AND 6);
