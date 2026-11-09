ALTER TABLE transactions ADD COLUMN currency TEXT NOT NULL DEFAULT 'EUR';
--> statement-breakpoint
ALTER TABLE transactions ADD COLUMN fx TEXT;
--> statement-breakpoint
ALTER TABLE budgets ADD COLUMN currency TEXT NOT NULL DEFAULT 'EUR';
--> statement-breakpoint
ALTER TABLE budgets ADD COLUMN fx TEXT;
--> statement-breakpoint
CREATE TABLE fx_rates (
  currency TEXT NOT NULL,
  requested_date TEXT NOT NULL,
  rate_date TEXT NOT NULL,
  rate TEXT NOT NULL,
  provider TEXT NOT NULL,
  PRIMARY KEY (currency, requested_date)
);
--> statement-breakpoint
ALTER TABLE fx_rates ADD COLUMN ars_per_usd TEXT NOT NULL DEFAULT '1';
--> statement-breakpoint
ALTER TABLE fx_rates ADD COLUMN ars_rate_date TEXT;
