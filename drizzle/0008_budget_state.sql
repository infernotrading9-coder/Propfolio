-- 0008_budget_state.sql
-- Full BudgetFlow state as JSONB (one row per user).
-- The flat budget_transactions/budget_accounts tables from 0007 cannot represent
-- the full BudgetState shape (categories, savingsGoals, completedGoals, account
-- icons/colors/loan terms/subAccounts), so the component state is stored whole.

CREATE TABLE IF NOT EXISTS "budget_state" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" uuid NOT NULL UNIQUE,
  "state" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamp DEFAULT now(),
  "updated_at" timestamp DEFAULT now(),
  CONSTRAINT "budget_state_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
);
