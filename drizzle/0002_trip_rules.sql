CREATE TABLE trip_rules (
 id TEXT PRIMARY KEY, user_id TEXT NOT NULL, tag TEXT NOT NULL,
 starts_on TEXT NOT NULL, ends_on TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1,
 creation_request_id TEXT NOT NULL, creation_payload TEXT NOT NULL,
 revision INTEGER NOT NULL DEFAULT 1, request_id TEXT NOT NULL, request_payload TEXT NOT NULL,
 UNIQUE(user_id,request_id), UNIQUE(user_id,creation_request_id)
);
CREATE INDEX trip_rules_user_dates ON trip_rules(user_id,starts_on,ends_on);
