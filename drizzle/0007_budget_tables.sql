-- 0007_budget_tables.sql
-- Budget tables: budget_transactions and budget_accounts

CREATE TABLE IF NOT EXISTS "budget_transactions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" uuid NOT NULL,
  "date" text,
  "description" text,
  "amount" numeric(10,2),
  "category" text,
  "subcategory" text,
  "account_name" text,
  "type" text CHECK ("type" IN ('income', 'expense', 'transfer', 'adjustment')),
  "expense_group" text DEFAULT 'living' CHECK ("expense_group" IN ('living', 'trading')),
  "excluded" boolean DEFAULT false,
  "created_at" timestamp DEFAULT now(),
  "updated_at" timestamp DEFAULT now(),
  CONSTRAINT "budget_transactions_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS "budget_accounts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" uuid NOT NULL,
  "name" text,
  "balance" numeric(10,2) DEFAULT 0,
  "type" text DEFAULT 'checking',
  "debt" boolean DEFAULT false,
  "created_at" timestamp DEFAULT now(),
  "updated_at" timestamp DEFAULT now(),
  CONSTRAINT "budget_accounts_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
);
