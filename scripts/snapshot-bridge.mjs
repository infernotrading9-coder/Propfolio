// scripts/snapshot-bridge.mjs
//
// DEV-ONLY. Reads backups/live-snapshot-latest.json (output of
// migration/scripts/99-snapshot-live.mjs) and translates the snake_case DB
// rows into the camelCase shapes the dev-mock-server returns, so that what
// the dev mock serves is what the live DB actually looks like RIGHT NOW,
// not a hand-typed snapshot from a previous day.
//
// The mock server reads from this; if the snapshot file is missing or
// stale, every helper falls back to a benign empty value so the dev
// server still works (just with less realistic data). The user can refresh
// the snapshot anytime with `npm run snapshot:live`.

import { existsSync, readFileSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const SNAP = join(ROOT, 'backups', 'live-snapshot-latest.json');

// Lazily loaded cache. If the file changes between calls, invalidate.
let _cache = null;
let _cacheMtime = 0;

function loadSnapshot() {
  if (!existsSync(SNAP)) return null;
  const mtime = statSync(SNAP).mtimeMs;
  if (_cache && mtime === _cacheMtime) return _cache;
  try {
    _cache = JSON.parse(readFileSync(SNAP, 'utf8'));
    _cacheMtime = mtime;
    return _cache;
  } catch {
    return null;
  }
}

export function snapshotMeta() {
  const s = loadSnapshot();
  if (!s) return { ok: false };
  return {
    ok: true,
    snappedAt: s.snappedAt,
    db: s.dbInfo?.database,
    rows: {
      trading_accounts: s.tables?.trading_accounts?.length ?? 0,
      challenges:       s.tables?.challenges?.length ?? 0,
      payouts:          s.tables?.payouts?.length ?? 0,
      personal_trades:  s.tables?.personal_trades?.length ?? 0,
      budget_accounts:  (() => {
        const bs = s.tables?.budget_state?.[0];
        if (!bs) return 0;
        try { return (typeof bs.state === 'string' ? JSON.parse(bs.state) : bs.state)?.accounts?.length ?? 0; }
        catch { return 0; }
      })(),
      plan_rules:       s.tables?.plan_rules?.length ?? 0,
      plan_notes:       s.tables?.plan_notes?.length ?? 0,
    },
  };
}

// ─── Trading accounts ────────────────────────────────────────────────────────
// DB shape (snake_case) → API shape (camelCase) the dev mock already used.
// We KEEP the snake_case fields too because some callers read either.
//
// id stays as-is (uuid string).
// account_number_last4 → accountNumberLast4
// display_label → displayLabel
// All numeric money fields stay as strings to mirror the API contract
// (the live drizzle schema returns numeric as a string to keep precision).

const ACCOUNT_NUMERIC = new Set([
  'account_size','balance','drawdown_used','high_water_mark','max_drawdown',
  'daily_drawdown','locked_floor','day_start_balance','settled_high_water_mark',
  'risk_per_trade','floor_lock_level',
]);

function toCamel(s) {
  return s.replace(/_([a-z0-9])/g, (_, c) => c.toUpperCase());
}

function translateAccount(row) {
  const out = {};
  for (const [k, v] of Object.entries(row)) {
    const camel = toCamel(k);
    // numeric money fields stay as strings
    out[camel] = ACCOUNT_NUMERIC.has(k) ? (v === null ? null : String(v)) : v;
  }
  // Joined/derived fields the live API stamps on each account row.
  // Without these the cockpit picker collapses to blank.
  if (!('displayLabel' in out) && row.account_first4 && row.account_number_last4) {
    out.displayLabel = `${row.account_first4}-${row.account_number_last4}`;
  }
  if (!('id' in out) || !out.id) {
    out.id = `mock-from-${row.display_label || `${row.account_first4}-${row.account_number_last4}`}`;
  }
  // Status default
  if (!('status' in out)) out.status = row.status || 'active';
  return out;
}

export function snapshotAccounts() {
  const s = loadSnapshot();
  if (!s) return [];
  const rows = s.tables?.trading_accounts ?? [];
  return rows.map(translateAccount);
}

export function snapshotPlanRules() {
  const s = loadSnapshot();
  if (!s) return [];
  return s.tables?.plan_rules ?? [];
}

export function snapshotPayouts() {
  const s = loadSnapshot();
  if (!s) return [];
  return s.tables?.payouts ?? [];
}

// Group payouts by challenge_id, summing amounts — used by the PayoutPanel.
export function snapshotPayoutsByChallenge() {
  const map = {};
  for (const p of snapshotPayouts()) {
    const cid = p.challenge_id;
    map[cid] = (map[cid] || 0) + parseFloat(p.amount || '0');
  }
  return map;
}

export function snapshotChallenges() {
  const s = loadSnapshot();
  if (!s) return [];
  return s.tables?.challenges ?? [];
}

// ─── Personal trades (PascalCase from drizzle → camelCase API shape) ─────────
// DB columns are snake_case; the dev mock mapped them to camelCase already,
// so apply the same camelCase pass-through used for accounts.

export function snapshotPersonalTrades() {
  const s = loadSnapshot();
  if (!s) return [];
  return (s.tables?.personal_trades ?? []).map((row) => {
    const out = {};
    for (const [k, v] of Object.entries(row)) out[toCamel(k)] = v;
    return out;
  });
}

// ─── Budget state ────────────────────────────────────────────────────────────
// budget_state is 1 row containing a JSONB `state` field with accounts /
// transactions / recurring / _deleted. We hand the whole thing back so the
// mock can use the real accounts, real transactions, real overdue flags.

export function snapshotBudgetState() {
  const s = loadSnapshot();
  if (!s) return null;
  const row = s.tables?.budget_state?.[0];
  if (!row) return null;
  try {
    return typeof row.state === 'string' ? JSON.parse(row.state) : row.state;
  } catch {
    return null;
  }
}

export function snapshotPlanNotes() {
  const s = loadSnapshot();
  if (!s) return [];
  return s.tables?.plan_notes ?? [];
}

export function snapshotFirms() {
  const s = loadSnapshot();
  if (!s) return [];
  return s.tables?.firms ?? [];
}
