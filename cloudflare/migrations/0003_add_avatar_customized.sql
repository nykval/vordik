ALTER TABLE ratings
  ADD COLUMN avatar_customized INTEGER NOT NULL DEFAULT 0 CHECK (avatar_customized IN (0, 1));
