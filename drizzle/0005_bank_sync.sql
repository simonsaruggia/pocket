CREATE TABLE bank_config (user_id TEXT PRIMARY KEY, session TEXT, accounts TEXT NOT NULL DEFAULT '[]', expires TEXT, sync_from TEXT, auto_save INTEGER NOT NULL DEFAULT 0, ai_enabled INTEGER NOT NULL DEFAULT 0, last_sync INTEGER NOT NULL DEFAULT 0, last_attempt INTEGER NOT NULL DEFAULT 0, error TEXT NOT NULL DEFAULT '');
CREATE TABLE bank_auth (state TEXT PRIMARY KEY, user_id TEXT NOT NULL, browser_hash TEXT NOT NULL, expires INTEGER NOT NULL, sync_from TEXT NOT NULL);
CREATE TABLE bank_items (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, account_hash TEXT NOT NULL, entry_ref TEXT NOT NULL, payload TEXT NOT NULL, draft TEXT, reason TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'review', transaction_id TEXT, created_at TEXT NOT NULL, UNIQUE(user_id,account_hash,entry_ref));
CREATE INDEX bank_items_user_status ON bank_items(user_id,status);
CREATE TABLE bank_ai_usage (user_id TEXT NOT NULL, month TEXT NOT NULL, requests INTEGER NOT NULL DEFAULT 0, PRIMARY KEY(user_id,month));
