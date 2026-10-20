INSERT OR IGNORE INTO notification_preferences (user_id, mode, chat_access, updated_at)
SELECT user_id, 'all', 'unknown', unixepoch('now') * 1000
FROM ratings WHERE user_id LIKE 'telegram:%';

UPDATE notification_preferences
SET mode = 'all', updated_at = unixepoch('now') * 1000
WHERE mode = 'paused' AND paused_at = 0 AND chat_access = 'unknown';
