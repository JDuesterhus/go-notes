-- Logins compare usernames case-insensitively, so uniqueness has to as well.
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username_lower
    ON users (LOWER(username));
