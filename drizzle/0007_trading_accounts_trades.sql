-- Trading accounts table (migrated from Focus Hub blobs)
CREATE TABLE IF NOT EXISTS "trading_accounts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" uuid NOT NULL REFERENCES "users"("id"),
  "name" text NOT NULL,
  "firm" text NOT NULL,
  "account_number_last4" text,
  "account_size" numeric(12, 2) NOT NULL DEFAULT '0',
  "balance" numeric(12, 2) NOT NULL DEFAULT '0',
  "drawdown_used" numeric(12, 2) NOT NULL DEFAULT '0',
  "high_water_mark" numeric(12, 2) NOT NULL DEFAULT '0',
  "max_drawdown" numeric(12, 2) DEFAULT '0',
  "daily_drawdown" numeric(12, 2) DEFAULT '0',
  "risk_per_trade" numeric(12, 2) DEFAULT '0',
  "rules" text[],
  "notes" text,
  "status" text DEFAULT 'active',
  "phase" text DEFAULT 'challenge',
  "platform" text,
  "group_name" text,
  "sort_order" integer DEFAULT 0,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

-- Trades table - individual trade log
CREATE TABLE IF NOT EXISTS "trades" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" uuid NOT NULL REFERENCES "users"("id"),
  "account_id" uuid NOT NULL REFERENCES "trading_accounts"("id"),
  "direction" text,
  "instrument" text,
  "entry_price" numeric(12, 4),
  "exit_price" numeric(12, 4),
  "amount" numeric(12, 2) NOT NULL,
  "result" text NOT NULL,
  "risk_reward" numeric(6, 2),
  "rules_followed" boolean DEFAULT true,
  "notes" text,
  "trade_date" timestamp DEFAULT now() NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);

-- Daily account ordering
CREATE TABLE IF NOT EXISTS "account_daily_order" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" uuid NOT NULL REFERENCES "users"("id"),
  "order_date" text NOT NULL,
  "ordered_account_ids" text[] NOT NULL,
  "notes" text,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

-- Index for faster queries
CREATE INDEX IF NOT EXISTS "trading_accounts_user_id_idx" ON "trading_accounts"("user_id");
CREATE INDEX IF NOT EXISTS "trades_user_id_idx" ON "trades"("user_id");
CREATE INDEX IF NOT EXISTS "trades_account_id_idx" ON "trades"("account_id");
CREATE INDEX IF NOT EXISTS "account_daily_order_user_id_idx" ON "account_daily_order"("user_id");
CREATE INDEX IF NOT EXISTS "account_daily_order_date_idx" ON "account_daily_order"("order_date");
