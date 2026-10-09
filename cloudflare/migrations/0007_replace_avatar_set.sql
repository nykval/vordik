UPDATE ratings
SET
  avatar_id = CASE ((random() & 9223372036854775807) % 9)
    WHEN 0 THEN 'avatar-01-dark-hair'
    WHEN 1 THEN 'avatar-02-curly-hair'
    WHEN 2 THEN 'avatar-03-silver-bun'
    WHEN 3 THEN 'avatar-04-cap-and-beard'
    WHEN 4 THEN 'avatar-05-red-hair'
    WHEN 5 THEN 'avatar-06-afro'
    WHEN 6 THEN 'avatar-07-silver-moustache'
    WHEN 7 THEN 'avatar-08-ponytail'
    ELSE 'avatar-09-glasses'
  END,
  avatar_customized = 0,
  updated_at = CURRENT_TIMESTAMP;
