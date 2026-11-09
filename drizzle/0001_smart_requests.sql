CREATE TABLE IF NOT EXISTS smart_requests (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, created_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS smart_requests_user_time ON smart_requests(user_id,created_at);
