CREATE TABLE IF NOT EXISTS mail_visitors (id TEXT PRIMARY KEY, token_hash TEXT NOT NULL UNIQUE, created_at TEXT NOT NULL, expires INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS correspondence (id TEXT PRIMARY KEY, visitor_id TEXT NOT NULL REFERENCES mail_visitors(id), direction TEXT NOT NULL CHECK(direction IN ('visitor','admin')), name TEXT NOT NULL, body TEXT NOT NULL, created_at TEXT NOT NULL, read_at TEXT);
CREATE INDEX IF NOT EXISTS correspondence_thread ON correspondence(visitor_id,created_at);
CREATE INDEX IF NOT EXISTS correspondence_unread ON correspondence(direction,read_at);
