/**
 * SINGLE SOURCE OF TRUTH for Vest instant-account statistics.
 *
 * ⚠️  DO NOT RE-IMPLEMENT THIS ALGORITHM ANYWHERE ELSE.
 *
 * Three consumers import this file, and they MUST all use it:
 *   - server/db/instantService.ts      → stats()                    (live)
 *   - scripts/dev-mock-server.mjs      → the dev mock's db-instant   (dev)
 *   - src/components/InstantTab.tsx    → displays only, derives none (UI)
 *
 * Why this file exists: `shared/personalStats.mts` was created after three
 * independent copies of the personal-trade maths silently drifted — the dev mock
 * reported the worst loss as the best trade and blanked four charts, so dev
 * looked different from live for the same data. The same trap applies here: a
 * mock that computes its own "accounts per payout" will disagree with live and
 * the disagreement will be invisible. One implementation makes that impossible.
 *
 * MONEY CONVENTIONS — these are the whole point, get them wrong and every number
 * on the tab is wrong:
 *   - `cost` is 100% sunk. On a Vest instant account the one-time price IS the
 *     max drawdown, and it is never recoverable — funded accounts cannot receive
 *     deposits and the trading capital is Vest's. There is no equity, ever.
 *   - `claimed` / claim `amount` are POST-split (the figure Vest credits after
 *     the 95% split). So break-even is simply SUM(claims) >= SUM(cost). If a
 *     pre-split number is ever passed in, everything inflates by ~5%.
 *
 * The numeric shape is deliberately loose (string | number) so Drizzle rows,
 * raw-SQL rows, API JSON and mock rows all satisfy it directly.
 */

export interface InstantAccountLike {
  id?: string;
  nickname?: string;
  accountSize?: string | number;
  cost?: string | number;
  purchasedAt?: string;
  status?: string;              // 'alive' | 'dead'
  diedAt?: string | null;
  fundingSource?: string | null;
  claimed?: string | number;    // total claimed on this account, post-split
  claimCount?: string | number;
  lifespanDays?: number | null;
}

export interface InstantStats {
  accountsBought: number;
  accountsAlive: number;
  accountsDead: number;
  accountsThatPaid: number;

  spent: number;
  claimed: number;
  net: number;
  roi: number | null;           // net / spent, 3dp

  payoutsReceived: number;
  avgClaim: number | null;
  accountsPerPayout: number | null; // how many accounts it takes to land one payout
  costPerPayout: number | null;     // what one payout costs to produce
  netPerAccount: number | null;
  stillToBreakEven: number;         // 0 once past it
  recoveredPct: number | null;      // claimed / spent, 3dp

  avgLifespanDays: number | null;   // dead accounts only
  firstPurchase: string | null;
  lastPurchase: string | null;

  /**
   * THE ONE ACCOUNT THAT PAID BEST — most payouts, and among ties the most money.
   * null until at least one claim exists. Vest pays on demand with no minimum, so
   * one account CAN claim repeatedly and this is the record of that.
   */
  topAccount: InstantTopAccount | null;

  /**
   * Every account rolled up one row per period, newest period first — what the
   * Instant tab's Monthly / Weekly P&L cards render.
   */
  monthly: InstantPeriodRow[];
  weekly: InstantPeriodRow[];
}

/** The account with the most payouts (ties broken by dollars claimed). */
export interface InstantTopAccount {
  nickname: string;
  payouts: number;
  claimed: number;
}

/** One period row in the P&L card grid (a month, or a Mon–Sun week). */
export interface InstantPeriodRow {
  key: string;     // 'YYYY-MM' (monthly) or the Monday's 'YYYY-MM-DD' (weekly)
  top: string;     // heading line 1 — the year
  main: string;    // heading line 2 — 'Nov' or 'Nov 3–9'
  label: string;   // one-line form, for tooltips/titles
  cost: number;    // sunk spend on the accounts bought in this period
  claimed: number; // post-split claims on those same accounts
  net: number;     // claimed - cost
  accounts: number;
  payouts: number;
}

export const EMPTY_INSTANT_STATS: InstantStats = {
  accountsBought: 0, accountsAlive: 0, accountsDead: 0, accountsThatPaid: 0,
  spent: 0, claimed: 0, net: 0, roi: null, payoutsReceived: 0, avgClaim: null,
  accountsPerPayout: null, costPerPayout: null, netPerAccount: null,
  stillToBreakEven: 0, recoveredPct: null, avgLifespanDays: null,
  firstPurchase: null, lastPurchase: null,
  topAccount: null,
  monthly: [], weekly: [],
};

const num = (v: unknown): number => {
  if (v === null || v === undefined) return 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

const round2 = (v: number): number => Math.round(v * 100) / 100;
/** 3 decimals for ratios. NB `round2(x * 1000) / 1000` is NOT this — it gives 5. */
const round3 = (v: number): number => Math.round(v * 1000) / 1000;

export function daysBetween(from: string, to: string): number | null {
  const a = Date.parse(from + 'T00:00:00Z');
  const b = Date.parse(to + 'T00:00:00Z');
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.round((b - a) / 86_400_000));
}

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Monday of the week containing `date`, as YYYY-MM-DD (UTC). Falls back to the raw date. */
export function weekStartOf(date: string): string {
  const t = Date.parse(date + 'T00:00:00Z');
  if (!Number.isFinite(t)) return date;
  const dow = (new Date(t).getUTCDay() + 6) % 7; // Monday = 0
  return new Date(t - dow * 86_400_000).toISOString().slice(0, 10);
}

function monthHeading(ym: string) {
  const [y, m] = ym.split('-');
  const name = MONTH_NAMES[Number(m) - 1] ?? ym;
  return { top: y, main: name, label: `${name} ${y}` };
}

/** Week headings read 'Nov 3–9', or 'Oct 27–Nov 2' when the week straddles a month. */
function weekHeading(start: string) {
  const s = Date.parse(start + 'T00:00:00Z');
  if (!Number.isFinite(s)) return { top: '', main: start, label: start };
  const a = new Date(s);
  const b = new Date(s + 6 * 86_400_000);
  const am = MONTH_NAMES[a.getUTCMonth()];
  const bm = MONTH_NAMES[b.getUTCMonth()];
  const main =
    am === bm ? `${am} ${a.getUTCDate()}–${b.getUTCDate()}` : `${am} ${a.getUTCDate()}–${bm} ${b.getUTCDate()}`;
  return { top: String(a.getUTCFullYear()), main, label: `${main}, ${a.getUTCFullYear()}` };
}

/**
 * Roll a set of accounts up into one row per period, newest period first.
 *
 * EVERY account counts, dead or alive — that is deliberate. Daniel's rule
 * (Nov 14 2026): the card grid must reconcile with the Net tile, so a period
 * shows everything he paid for in it, not just the accounts that happen to have
 * closed. Dead-only rows under-reported any period he still had a live account
 * in, which read as "I spent a lot less than I did".
 *
 * Bucketing is by PURCHASE date, and each account brings its own whole claim
 * total along. Bucketing claims by their own claim date instead would need the
 * claim rows in here (this function only receives accounts) and could put a
 * claim in a period with no accounts in it. An instant account pays and dies
 * inside a day, so the two conventions only diverge if a claim is logged long
 * after its purchase.
 */
function rollupPeriods(
  accounts: InstantAccountLike[],
  keyOf: (a: InstantAccountLike) => string,
  headingOf: (key: string) => { top: string; main: string; label: string },
): InstantPeriodRow[] {
  const buckets = new Map<string, InstantPeriodRow>();
  for (const a of accounts) {
    if (!a.purchasedAt) continue;
    const key = keyOf(a);
    let row = buckets.get(key);
    if (!row) {
      const h = headingOf(key);
      row = { key, top: h.top, main: h.main, label: h.label, cost: 0, claimed: 0, net: 0, accounts: 0, payouts: 0 };
      buckets.set(key, row);
    }
    row.cost += num(a.cost);
    row.claimed += num(a.claimed);
    row.accounts += 1;
    row.payouts += num(a.claimCount);
  }
  return [...buckets.values()]
    .map((r) => ({ ...r, cost: round2(r.cost), claimed: round2(r.claimed), net: round2(r.claimed - r.cost) }))
    .sort((x, y) => (x.key < y.key ? 1 : x.key > y.key ? -1 : 0));
}

/**
 * Derive every number the Instant tab shows. Pure — no DB, no clock, no fetch.
 *
 * Derived fresh on every call and never stored: a remembered total for this is a
 * wrong total, which is the entire lesson from the Vest ledger episode.
 */
export function computeInstantStats(input: InstantAccountLike[] | null | undefined): InstantStats {
  const accounts = Array.isArray(input) ? input : [];
  if (accounts.length === 0) return { ...EMPTY_INSTANT_STATS };

  let spent = 0;
  let claimed = 0;
  let alive = 0;
  let dead = 0;
  let paying = 0;
  let payouts = 0;
  const lifespans: number[] = [];
  const dates: string[] = [];

  for (const a of accounts) {
    const cost = num(a.cost);
    const cl = num(a.claimed);
    spent += cost;
    claimed += cl;

    if (a.status === 'dead') {
      dead += 1;
      // Prefer a computed lifespan; fall back to a supplied one. Never invent one.
      const ls =
        a.lifespanDays !== null && a.lifespanDays !== undefined
          ? num(a.lifespanDays)
          : a.purchasedAt && a.diedAt
            ? daysBetween(a.purchasedAt, a.diedAt)
            : null;
      if (ls !== null) lifespans.push(ls);
    } else {
      alive += 1;
    }

    const cc = num(a.claimCount);
    payouts += cc;
    if (cc > 0) paying += 1;

    if (a.purchasedAt) dates.push(a.purchasedAt);
  }

  dates.sort();
  const net = claimed - spent;

  // Most payouts on ONE account; ties go to the most money. `>` (never `>=`) keeps
  // the FIRST such account, and the input is ordered by purchase date, so a dead
  // heat is resolved the same way on every read — the bot and the UI must not
  // disagree about which account is "top".
  let topAccount: InstantTopAccount | null = null;
  for (const a of accounts) {
    const cc = num(a.claimCount);
    if (cc <= 0) continue;
    const cl = num(a.claimed);
    if (topAccount === null || cc > topAccount.payouts || (cc === topAccount.payouts && cl > topAccount.claimed)) {
      topAccount = { nickname: String(a.nickname ?? ''), payouts: cc, claimed: round2(cl) };
    }
  }

  return {
    accountsBought: accounts.length,
    accountsAlive: alive,
    accountsDead: dead,
    accountsThatPaid: paying,

    spent: round2(spent),
    claimed: round2(claimed),
    net: round2(net),
    roi: spent > 0 ? round3(net / spent) : null,

    payoutsReceived: payouts,
    avgClaim: payouts > 0 ? round2(claimed / payouts) : null,
    accountsPerPayout: payouts > 0 ? round2(accounts.length / payouts) : null,
    costPerPayout: payouts > 0 ? round2(spent / payouts) : null,
    netPerAccount: round2(net / accounts.length),
    stillToBreakEven: round2(Math.max(0, spent - claimed)),
    recoveredPct: spent > 0 ? round3(claimed / spent) : null,

    avgLifespanDays:
      lifespans.length > 0
        ? round2(lifespans.reduce((s, d) => s + d, 0) / lifespans.length)
        : null,
    firstPurchase: dates[0] ?? null,
    lastPurchase: dates[dates.length - 1] ?? null,

    topAccount,

    monthly: rollupPeriods(accounts, (a) => String(a.purchasedAt).slice(0, 7), monthHeading),
    weekly: rollupPeriods(accounts, (a) => weekStartOf(String(a.purchasedAt)), weekHeading),
  };
}
