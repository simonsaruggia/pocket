CREATE TABLE transactions (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL,
  request_id TEXT NOT NULL,
  amount_cents INTEGER NOT NULL CHECK(amount_cents > 0 AND amount_cents <= 100000000000),
  kind TEXT NOT NULL CHECK(kind IN ('expense','income')),
  category_id TEXT NOT NULL,
  occurred_on TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  tags TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL,
  UNIQUE(user_id, request_id)
);
--> statement-breakpoint
CREATE INDEX transactions_user_date ON transactions(user_id, occurred_on);
--> statement-breakpoint
CREATE TABLE tags (
  user_id TEXT NOT NULL,
  name TEXT NOT NULL COLLATE NOCASE,
  created_at TEXT NOT NULL,
  PRIMARY KEY(user_id, name)
);
--> statement-breakpoint
CREATE TABLE budgets (
  user_id TEXT NOT NULL,
  month TEXT NOT NULL,
  amount_cents INTEGER NOT NULL CHECK(amount_cents >= 0 AND amount_cents <= 100000000000),
  PRIMARY KEY(user_id, month)
);
