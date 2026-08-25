import { sql } from 'drizzle-orm';
import { db } from './connection';
import { randomUUID } from 'crypto';

/**
 * purchaseService — the ONE place a prop-firm eval purchase gets created.
 *
 * Buying an eval must spawn all three surfaces at once:
 *   1. a challenge row (Prop Firm Dashboard)
 *   2. a trading account card (Accounts tab)
 *   3. a budget expense (Budget tab, tagged isPropFirm)
 *
 * Both entry points go through here:
 *   - the web app (db-challenges POST with spawnAccountCard=true,
 *     db-accounts POST with spawnChallengeAndBudget=true)
 *   - the Telegram CLI (add-eval.mjs)
 *
 * Focus Hub / Netlify blobs are retired. Neon is the single source of truth.
 */

export interface PurchaseEvalInput {
  userId: string;
  propFirmId?: string | null;
  propFirmName?: string;
  brokerName?: string;
  accountSize: number;
  cost: number;
  totalPhases?: number;
  startDate?: string;
  strategy?: string;
  firmType?: string;
  evalType?: string;
  accountLast4?: string | null;
  maxDrawdown?: number;
  dailyDrawdown?: number;
  riskPerTrade?: number;
  rules?: string[];
  budgetAccountId?: string; // which budget account paid for it (defaults to acc_sofi)
}

interface SpawnOpts {
  maxDrawdown?: number;
  dailyDrawdown?: number;
  riskPerTrade?: number;
  rules?: string[];
  budgetAccountId?: string;
}

const round2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;

/**
 * Render a JS string array as a Postgres array literal (e.g. `{"a","b"}`), safe to
 * bind as a single parameter and cast with `::text[]`. Returns `{}` for empty input.
 * Needed because interpolating a JS array into drizzle's sql template produces a row
 * constructor, not an array — and an empty one produces invalid SQL `()`.
 */
function toPgTextArray(values?: string[] | null): string {
  const list = Array.isArray(values) ? values.filter((v) => v !== null && v !== undefined) : [];
  if (list.length === 0) return '{}';
  const escaped = list.map((v) => `"${String(v).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`);
  return `{${escaped.join(',')}}`;
}

async function findOrCreateFirm(userId: string, name: string, firmType?: string): Promise<{ id: string; name: string }> {
  const found = await db.execute(sql`SELECT id, name FROM firms WHERE user_id = ${userId} AND lower(name) = lower(${name}) LIMIT 1`);
  if (found && found.rows && found.rows.length > 0) {
    return { id: String(found.rows[0].id), name: String(found.rows[0].name) };
  }
  const id = randomUUID();
  await db.execute(sql`INSERT INTO firms (id, user_id, name, firm_type, created_at) VALUES (${id}, ${userId}, ${name}, ${firmType || 'futures'}, NOW())`);
  return { id, name };
}

/**
 * Create the rule-calendar account for a trading account, so the Rule Calendar
 * has a row to track daily compliance against from day one.
 *
 * Idempotent: if a calendar account already exists for this challenge (or, when
 * there is no challenge, with the same name), nothing is inserted. Failures are
 * swallowed by callers — a missing calendar row must never break a purchase.
 */
export async function spawnCalendarAccount(
  userId: string,
  opts: { name: string; challengeId?: string | null }
): Promise<{ calendarAccountId: string | null }> {
  const name = (opts.name || '').trim();
  if (!name) return { calendarAccountId: null };
  const challengeId = opts.challengeId || null;

  const existing = challengeId
    ? await db.execute(sql`SELECT id FROM calendar_accounts WHERE user_id = ${userId} AND challenge_id = ${challengeId} LIMIT 1`)
    : await db.execute(sql`SELECT id FROM calendar_accounts WHERE user_id = ${userId} AND name = ${name} LIMIT 1`);
  if (existing?.rows && existing.rows.length > 0) {
    return { calendarAccountId: String(existing.rows[0].id) };
  }

  const id = randomUUID();
  await db.execute(sql`
    INSERT INTO calendar_accounts (id, user_id, name, challenge_id, is_active, created_at)
    VALUES (${id}, ${userId}, ${name}, ${challengeId}, true, NOW())
  `);
  return { calendarAccountId: id };
}

/** Create a trading account card + register the budget expense for an existing challenge. */
export async function spawnAccountAndBudget(
  userId: string,
  opts: {
    firmName: string;
    accountSize: number;
    accountLast4?: string | null;
    accountName?: string;
    cost?: number;
    budgetAccountId?: string;
    challengeId?: string | null;
    purchaseDate?: string;
  } & SpawnOpts
): Promise<{ accountId: string; calendarAccountId: string | null }> {
  const accountSize = Math.max(0, Math.round(Number(opts.accountSize) || 0));
  const last4 = opts.accountLast4 || null;
  const name = opts.accountName || (last4 ? `Acct ${last4}` : `${opts.firmName} ${Math.round(accountSize / 1000)}K`);

  const sortRes = await db.execute(sql`SELECT COALESCE(MAX(sort_order), 0) + 1 AS n FROM trading_accounts WHERE user_id = ${userId}`);
  const sortOrder = sortRes.rows?.[0]?.n ?? 1;
  const accountId = randomUUID();

  // rules is a text[] column. Interpolating a JS array into the sql template
  // renders a row constructor — `()` for an empty array, which is invalid SQL and
  // used to make this INSERT fail silently inside its caller's try/catch. Build a
  // proper Postgres array literal instead and bind it as a single string param.
  const rulesLiteral = toPgTextArray(opts.rules);

  await db.execute(sql`
    INSERT INTO trading_accounts (
      id, user_id, name, firm, account_number_last4, account_size, balance, drawdown_used,
      high_water_mark, max_drawdown, daily_drawdown, risk_per_trade, rules, status, phase, sort_order, created_at, updated_at
    ) VALUES (
      ${accountId}, ${userId}, ${name}, ${opts.firmName}, ${last4}, ${String(accountSize)}, ${String(accountSize)}, '0',
      ${String(accountSize)}, ${String(opts.maxDrawdown || 0)}, ${String(opts.dailyDrawdown || 0)}, ${String(opts.riskPerTrade || 0)},
      ${rulesLiteral}::text[], 'active', 'challenge', ${sortOrder}, NOW(), NOW()
    )
  `);

  const cost = round2(opts.cost || 0);
  if (cost > 0) {
    await registerBudgetExpense(userId, {
      name: `Eval — ${opts.firmName} ${Math.round(accountSize / 1000)}K`,
      amount: cost,
      accountId: opts.budgetAccountId || 'acc_sofi',
      date: opts.purchaseDate,
    });
  }

  // Rule Calendar: give the new account a calendar row so daily rule compliance
  // can be tracked from day one. Never let this break the purchase.
  let calendarAccountId: string | null = null;
  try {
    const cal = await spawnCalendarAccount(userId, {
      name: `${name} (${opts.firmName})`,
      challengeId: opts.challengeId || null,
    });
    calendarAccountId = cal.calendarAccountId;
  } catch (e) {
    console.error('spawnCalendarAccount failed:', e);
  }

  return { accountId, calendarAccountId };
}

/** The complete purchase flow: challenge + account card + budget expense. */
export async function purchaseEval(input: PurchaseEvalInput): Promise<{ challengeId: string; accountId: string; calendarAccountId: string | null; firmId: string; firmName: string }> {
  const { userId } = input;
  const accountSize = Math.max(0, Math.round(Number(input.accountSize) || 0));
  const cost = round2(input.cost || 0);
  const today = input.startDate || new Date().toISOString().slice(0, 10);

  let firm: { id: string; name: string };
  if (input.propFirmId) {
    const f = await db.execute(sql`SELECT id, name FROM firms WHERE id = ${input.propFirmId} LIMIT 1`);
    if (f.rows && f.rows.length > 0) {
      firm = { id: String(f.rows[0].id), name: String(f.rows[0].name) };
    } else {
      firm = await findOrCreateFirm(userId, input.propFirmName || 'Prop Firm', input.firmType);
    }
  } else {
    firm = await findOrCreateFirm(userId, input.propFirmName || 'Prop Firm', input.firmType);
  }

  const challengeId = randomUUID();
  await db.execute(sql`
    INSERT INTO challenges (
      id, user_id, firm_id, broker_name, account_size, start_date, cost, initial_cost,
      total_phases, has_activation_fee, strategy, firm_type, eval_type, status, highest_milestone,
      outcome_type, account_last4, created_at, updated_at
    ) VALUES (
      ${challengeId}, ${userId}, ${firm.id}, ${input.brokerName || 'Trading Account'}, ${accountSize}, ${today},
      ${String(cost)}, ${String(cost)}, ${input.totalPhases || 3}, false, ${input.strategy || ''}, ${input.firmType || null},
      ${input.evalType || null}, 'active', 'purchased', 'active', ${input.accountLast4 || null}, NOW(), NOW()
    )
  `);

  const { accountId, calendarAccountId } = await spawnAccountAndBudget(userId, {
    firmName: firm.name,
    accountSize,
    accountLast4: input.accountLast4,
    cost,
    budgetAccountId: input.budgetAccountId,
    challengeId,
    purchaseDate: today,
    maxDrawdown: input.maxDrawdown,
    dailyDrawdown: input.dailyDrawdown,
    riskPerTrade: input.riskPerTrade,
    rules: input.rules,
  });

  return { challengeId, accountId, calendarAccountId, firmId: firm.id, firmName: firm.name };
}

/** When an account card is created first, spawn the matching challenge + budget expense. */
export async function spawnChallengeAndBudgetFromAccount(
  userId: string,
  opts: {
    firmName: string;
    accountSize: number;
    accountLast4?: string | null;
    cost: number;
    startDate?: string;
    budgetAccountId?: string;
    maxDrawdown?: number;
    dailyDrawdown?: number;
    riskPerTrade?: number;
    rules?: string[];
    totalPhases?: number;
    strategy?: string;
    firmType?: string;
  }
): Promise<{ challengeId: string }> {
  const accountSize = Math.max(0, Math.round(Number(opts.accountSize) || 0));
  const cost = round2(opts.cost || 0);
  const firm = await findOrCreateFirm(userId, opts.firmName, opts.firmType);

  const challengeId = randomUUID();
  await db.execute(sql`
    INSERT INTO challenges (
      id, user_id, firm_id, broker_name, account_size, start_date, cost, initial_cost,
      total_phases, has_activation_fee, strategy, firm_type, status, highest_milestone,
      outcome_type, account_last4, created_at, updated_at
    ) VALUES (
      ${challengeId}, ${userId}, ${firm.id}, 'Trading Account', ${accountSize}, ${opts.startDate || new Date().toISOString().slice(0, 10)},
      ${String(cost)}, ${String(cost)}, ${opts.totalPhases || 3}, false, ${opts.strategy || ''}, ${opts.firmType || null},
      'active', 'purchased', 'active', ${opts.accountLast4 || null}, NOW(), NOW()
    )
  `);

  if (cost > 0) {
    await registerBudgetExpense(userId, {
      name: `Eval — ${opts.firmName} ${Math.round(accountSize / 1000)}K`,
      amount: cost,
      accountId: opts.budgetAccountId || 'acc_sofi',
    });
  }

  // Account-first flow: the account card already exists, so give it its Rule
  // Calendar row too and link it to the challenge we just created.
  try {
    const last4 = opts.accountLast4 || null;
    const accountName = last4 ? `Acct ${last4}` : `${opts.firmName} ${Math.round(accountSize / 1000)}K`;
    await spawnCalendarAccount(userId, {
      name: `${accountName} (${opts.firmName})`,
      challengeId,
    });
  } catch (e) {
    console.error('spawnCalendarAccount failed:', e);
  }

  return { challengeId };
}

/** Append a budget expense tagged isPropFirm and deduct it from the paying account's balance. */
export async function registerBudgetExpense(
  userId: string,
  txn: { name: string; amount: number; accountId: string; date?: string; categoryId?: string }
): Promise<void> {
  const amount = round2(txn.amount);
  if (amount <= 0) return;
  const row = await db.execute(sql`SELECT state FROM budget_state WHERE user_id = ${userId} LIMIT 1`);
  if (!row.rows || row.rows.length === 0) return;

  const state: any = row.rows[0].state && typeof row.rows[0].state === 'string'
    ? JSON.parse(row.rows[0].state)
    : row.rows[0].state;
  if (!state || typeof state !== 'object') return;

  const txns: any[] = Array.isArray(state.transactions) ? state.transactions : [];
  txns.push({
    id: Math.random().toString(36).slice(2, 9),
    name: txn.name,
    amount,
    type: 'expense',
    date: txn.date || new Date().toISOString().slice(0, 10),
    accountId: txn.accountId,
    categoryId: txn.categoryId || 'cat_wants',
    excluded: false,
    isPropFirm: true,
  });
  state.transactions = txns;

  const accounts: any[] = Array.isArray(state.accounts) ? state.accounts : [];
  const target = accounts.find((a: any) => a && a.id === txn.accountId);
  if (target) {
    target.balance = round2((Number(target.balance) || 0) - amount);
  }
  state.accounts = accounts;

  await db.execute(sql`UPDATE budget_state SET state = ${JSON.stringify(state)}::jsonb, updated_at = NOW() WHERE user_id = ${userId}`);
}
