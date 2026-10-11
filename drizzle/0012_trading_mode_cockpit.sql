ALTER TABLE "trading_mode_state" ADD COLUMN IF NOT EXISTS "cockpit_state" text DEFAULT 'pre_trade';
ALTER TABLE "trading_mode_state" ADD COLUMN IF NOT EXISTS "current_strategy" text;
ALTER TABLE "trading_mode_state" ADD COLUMN IF NOT EXISTS "strategy_attempts" integer DEFAULT 0;
ALTER TABLE "trading_mode_state" ADD COLUMN IF NOT EXISTS "last_strategy_time" timestamp;
ALTER TABLE "trading_mode_state" ADD COLUMN IF NOT EXISTS "fresh_setup" boolean DEFAULT true;
ALTER TABLE "trading_mode_state" ADD COLUMN IF NOT EXISTS "last_voice_key" text;
CREATE TABLE IF NOT EXISTS "strategy_log" ("id" uuid PRIMARY KEY DEFAULT gen_random_uuid(), "user_id" text NOT NULL, "strategy" text NOT NULL, "attempt" integer DEFAULT 1, "state" text DEFAULT 'pre_trade', "created_at" timestamp DEFAULT NOW());
ALTER TABLE "calendar_entries" ADD COLUMN IF NOT EXISTS "balance_snapshot" decimal(12,2);
ALTER TABLE "calendar_entries" ADD COLUMN IF NOT EXISTS "pnl_snapshot" decimal(12,2);