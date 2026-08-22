-- Calendar accounts: rule-tracking calendars linked to challenges/phases
CREATE TABLE IF NOT EXISTS "calendar_accounts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id"),
  "name" text NOT NULL,
  "challenge_id" uuid,
  "is_active" boolean DEFAULT true NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);

-- Calendar entries: daily rule compliance per calendar account
CREATE TABLE IF NOT EXISTS "calendar_entries" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "calendar_account_id" uuid NOT NULL REFERENCES "calendar_accounts"("id"),
  "date" text NOT NULL,
  "followed_rules" boolean,
  "rule_compliance" text,
  "notes" text,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

-- Unique constraint: one entry per date per calendar account
CREATE UNIQUE INDEX IF NOT EXISTS "calendar_entries_account_date_idx"
  ON "calendar_entries" ("calendar_account_id", "date");
