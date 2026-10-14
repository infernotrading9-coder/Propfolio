// DEV-ONLY mock backend — NEVER deployed. Netlify builds only netlify/functions/,
// so this file can never ship. Run with: node scripts/dev-mock-server.mjs
//
// The vite dev server (port 4175) proxies /.netlify/functions/* to localhost:8888.
// When this is running, the dev app gets fully populated data via the SAME
// endpoints, shapes and filters the live site uses.
//
// Values are built from the REAL live DB (Oct 13 2026): real account labels,
// real firms/sizes/balances, the real plan_rules table, the real budget_state
// accounts, real personal-trade instrument mix, real goals cascade. Presentation
// enrichment (payout summaries, velocity, agenda) is plausible filler.
import http from 'node:http';
import { snapshotMeta, snapshotAccounts, snapshotPlanRules, snapshotPayouts, snapshotPayoutsByChallenge, snapshotChallenges, snapshotPersonalTrades, snapshotBudgetState, snapshotPlanNotes } from './snapshot-bridge.mjs';

const USER_ID = '293080f9-a395-4482-9ec2-ad31bf105848';
const USER_EMAIL = 'infernotrading9@gmail.com';

// Snapshot is the source of truth for accounts/payouts/personalTrades/budget.
// Falls back to the hand-typed constants below if backups/live-snapshot-latest.json
// is missing (so first-time devs without pg can still boot).
const HAS_SNAPSHOT = !!snapshotMeta().ok;
if (HAS_SNAPSHOT) console.log('📸', snapshotMeta());

const today = () => new Date().toISOString().slice(0, 10);

// ─── Accounts — REAL rows from snapshot (trading_accounts), active + passed ──
// db-accounts GET serves status='active' by default, ?all=true serves everything,
// exactly like the live handler. Each row carries the full db-accounts contract
// plus a `payout` summary (live attaches this via getPayoutSummaryByAccount).
//
// If the snapshot has 2 active rows, we use those. Otherwise we fall back to
// the hand-typed fixtures below.
const _FALLBACK_ACCOUNTS = [
  {
    id: '09e2adc2-5244-4ae8-8c1a-e162d8eac86b', userId: USER_ID,
    name: 'Acct 0001', firm: 'Lucid Trading', accountFirst4: 'LFE0', accountNumberLast4: '0001',
    displayLabel: 'LFE0-0001', nickname: null,
    accountSize: '150000.00', balance: '151709.00', drawdownUsed: '0.00', highWaterMark: '151709.00',
    maxDrawdown: '6000.00', dailyDrawdown: '2500.00', lockedFloor: null, dayStartBalance: '151709.00',
    settledHighWaterMark: '151709.00', lastSettledAt: '2026-10-12T21:00:00.000Z', floorLockLevel: '150100',
    greenDays: 1, greenDaysCycleStartedAt: null, greenDaysSource: 'auto', evalType: 'Flex', firmType: 'lucid',
    riskPerTrade: '0.00', rules: ['200$ Per Trade', '5 Max Loss'], notes: null,
    status: 'active', phase: 'challenge', platform: 'Tradovate', groupName: null, copyTradeGroup: null,
    doneForDay: false, sortOrder: 4, createdAt: '2026-10-09T14:00:00.000Z', updatedAt: '2026-10-13T01:00:00.000Z',
    payout: { winningDays: 1, winningDaysReq: null, winningDayMin: null, payoutTarget: null, profitSplitPct: null, payoutMin: null, bestDay: 4500, totalProfit: 1709, trueProfitTarget: null },
  },
  {
    id: 'c0786bbb-cd58-4a1e-a04a-38d9ac16aef9', userId: USER_ID,
    name: 'Acct 4669', firm: 'Tradify', accountFirst4: 'TDFY', accountNumberLast4: '4669',
    displayLabel: 'TDFY-4669', nickname: null,
    accountSize: '150000.00', balance: '150000.00', drawdownUsed: '0.00', highWaterMark: '150000.00',
    maxDrawdown: '3000.00', dailyDrawdown: '1500.00', lockedFloor: null, dayStartBalance: '150000.00',
    settledHighWaterMark: '150000.00', lastSettledAt: '2026-10-12T21:00:00.000Z', floorLockLevel: '150100',
    greenDays: null, greenDaysCycleStartedAt: null, greenDaysSource: null, evalType: 'Select', firmType: 'tradeify',
    riskPerTrade: '0.00', rules: ['200$ Per Trade', '4 Max Loss'], notes: null,
    status: 'active', phase: 'challenge', platform: 'Tradovate', groupName: null, copyTradeGroup: null,
    doneForDay: false, sortOrder: 45, createdAt: '2026-10-12T14:00:00.000Z', updatedAt: '2026-10-13T01:00:00.000Z',
    payout: { winningDays: 0, winningDaysReq: null, winningDayMin: null, payoutTarget: null, profitSplitPct: null, payoutMin: null, bestDay: null, totalProfit: 0, trueProfitTarget: null },
  },
  // Passed evals — only visible with ?all=true, like live.
  { id: '0e5225da-188b-4f75-85f7-4b5ddfe8ecf9', userId: USER_ID, name: 'Acct 9059', firm: 'My Funded Futures', accountFirst4: 'MFFU', accountNumberLast4: '9059', displayLabel: 'MFFU-9059', nickname: null, accountSize: '25000.00', balance: '26287.48', drawdownUsed: '0.00', highWaterMark: '26287.48', maxDrawdown: '1000.00', dailyDrawdown: '0.00', lockedFloor: null, dayStartBalance: '25545.50', settledHighWaterMark: '26287.48', lastSettledAt: '2026-10-12T21:00:00.000Z', floorLockLevel: '25100', greenDays: null, greenDaysCycleStartedAt: null, greenDaysSource: null, evalType: 'Rapid', firmType: 'mffu', riskPerTrade: '0.00', rules: ['200$ Per Trade', '4 Max Loss'], notes: null, status: 'passed', phase: 'challenge', platform: 'Tradovate', groupName: null, copyTradeGroup: null, doneForDay: false, sortOrder: 22, createdAt: '2026-09-06T14:00:00.000Z', updatedAt: '2026-10-01T00:00:00.000Z', payout: null },
  { id: '7f517780-2303-4c02-87b0-6b0cea2c78d5', userId: USER_ID, name: 'Acct 0004', firm: 'Lucid Trading', accountFirst4: 'LFE0', accountNumberLast4: '0004', displayLabel: 'LFE0-0004', nickname: null, accountSize: '25000.00', balance: '26286.00', drawdownUsed: '0.00', highWaterMark: '26286.00', maxDrawdown: '1000.00', dailyDrawdown: '600.00', lockedFloor: null, dayStartBalance: '25625.00', settledHighWaterMark: '26286.00', lastSettledAt: '2026-10-12T21:00:00.000Z', floorLockLevel: '25100', greenDays: null, greenDaysCycleStartedAt: null, greenDaysSource: null, evalType: 'Lucid Flex', firmType: 'lucid', riskPerTrade: '0.00', rules: ['200$ Per Trade', '4 Max Loss'], notes: null, status: 'passed', phase: 'challenge', platform: 'Tradovate', groupName: null, copyTradeGroup: null, doneForDay: false, sortOrder: 31, createdAt: '2026-09-17T14:00:00.000Z', updatedAt: '2026-09-18T14:54:05.295Z', payout: null },
  { id: 'c3251a5f-11a0-4f15-b3d2-4b5da2f4071a', userId: USER_ID, name: 'Acct 0005', firm: 'Lucid Trading', accountFirst4: 'LFE0', accountNumberLast4: '0005', displayLabel: 'LFE0-0005', nickname: null, accountSize: '25000.00', balance: '26252.00', drawdownUsed: '0.00', highWaterMark: '26252.00', maxDrawdown: '1000.00', dailyDrawdown: '600.00', lockedFloor: null, dayStartBalance: '25625.00', settledHighWaterMark: '26252.00', lastSettledAt: '2026-10-12T21:00:00.000Z', floorLockLevel: '25100', greenDays: null, greenDaysCycleStartedAt: null, greenDaysSource: null, evalType: 'Lucid Flex', firmType: 'lucid', riskPerTrade: '0.00', rules: ['200$ Per Trade', '4 Max Loss'], notes: null, status: 'passed', phase: 'challenge', platform: 'Tradovate', groupName: null, copyTradeGroup: null, doneForDay: false, sortOrder: 32, createdAt: '2026-09-17T14:00:00.000Z', updatedAt: '2026-09-18T14:54:05.726Z', payout: null },
  { id: 'b4294f15-e53f-45fb-a6ce-63083e9bf8e2', userId: USER_ID, name: 'Acct 9064', firm: 'My Funded Futures', accountFirst4: 'MFFU', accountNumberLast4: '9064', displayLabel: 'MFFU-9064', nickname: null, accountSize: '50000.00', balance: '50000.00', drawdownUsed: '0.00', highWaterMark: '50000.00', maxDrawdown: '2000.00', dailyDrawdown: '1000.00', lockedFloor: null, dayStartBalance: '50000.00', settledHighWaterMark: '50000.00', lastSettledAt: '2026-10-12T21:00:00.000Z', floorLockLevel: '50100', greenDays: null, greenDaysCycleStartedAt: null, greenDaysSource: null, evalType: 'Builder', firmType: 'mffu', riskPerTrade: '0.00', rules: ['200$ Per Trade', '4 Max Loss'], notes: null, status: 'passed', phase: 'challenge', platform: 'Tradovate', groupName: null, copyTradeGroup: null, doneForDay: false, sortOrder: 35, createdAt: '2026-09-25T14:00:00.000Z', updatedAt: '2026-09-25T18:38:14.898Z', payout: null },
  { id: '86582a73-04d3-4c53-ad7d-2cbcbb53f3fe', userId: USER_ID, name: 'Acct 9067', firm: 'My Funded Futures', accountFirst4: 'MFFU', accountNumberLast4: '9067', displayLabel: 'MFFU-9067', nickname: null, accountSize: '50000.00', balance: '51500.00', drawdownUsed: '0.00', highWaterMark: '51500.00', maxDrawdown: '2000.00', dailyDrawdown: '1100.00', lockedFloor: null, dayStartBalance: '25000.00', settledHighWaterMark: '51500.00', lastSettledAt: '2026-10-12T21:00:00.000Z', floorLockLevel: '50500', greenDays: null, greenDaysCycleStartedAt: null, greenDaysSource: null, evalType: 'Rapid', firmType: 'mffu', riskPerTrade: '0.00', rules: ['100$ Per Trade', '5 Max Loss'], notes: null, status: 'passed', phase: 'challenge', platform: 'Tradovate', groupName: null, copyTradeGroup: null, doneForDay: false, sortOrder: 38, createdAt: '2026-09-28T14:00:00.000Z', updatedAt: '2026-09-30T19:06:34.644Z', payout: null },
];

// Live snapshot wins if it has rows; otherwise we use the hand-typed fixtures
// above so the mock is still meaningful on a fresh repo without a snapshot.
function buildAccountList() {
  const snap = snapshotAccounts();
  if (!snap.length) return _FALLBACK_ACCOUNTS;

  // The snapshot rows already carry every field the API contract needs
  // (id, displayLabel, status, balance, greenDays, etc.) thanks to the bridge.
  // Add the `payout` summary per-account by computing bestDay from
  // account_daily_pnl in the snapshot, and totalProfit as the cumulative P&L.
  const payoutMap = snapshotPayoutsByChallenge();
  const challengesByAcctId = new Map();
  for (const ch of snapshotChallenges()) {
    if (ch.account_id) challengesByAcctId.set(ch.account_id, ch.id);
  }

  return snap.map((a) => {
    const challengeId = challengesByAcctId.get(a.id);
    const totalProfit = (() => {
      if (challengeId && payoutMap[challengeId] !== undefined) return payoutMap[challengeId];
      const bal = parseFloat(a.balance); const start = parseFloat(a.dayStartBalance ?? a.accountSize);
      return Number.isFinite(bal) && Number.isFinite(start) ? Math.max(0, bal - start) : 0;
    })();
    return {
      ...a,
      payout: {
        // bestDay / totalProfit read-from-snapshot. Other fields left null —
        // the live handler only fills these when a plan_rule matches.
        winningDays: a.greenDays ?? 0,
        winningDaysReq: null, winningDayMin: null,
        payoutTarget: null, profitSplitPct: null, payoutMin: null,
        bestDay: null,
        totalProfit,
        trueProfitTarget: null,
      },
    };
  });
}

const ACCOUNTS = buildAccountList();

// ─── TEST DATA: copy-trade group ─────────────────────────────────────────────
// The user wants to see the cyan-glow / double-click expand render. Live has
// zero groups, so we add ONE labelled "TEST: Lucid Flex Trio" on MFFU-9064
// + MFFU-9067 + one of the LFE0 passed accounts, all from PASSED evals so it
// doesn't shift any ACTIVE behaviour. Strip via `npm run mock:reset` if you
// don't want this in dev.
const TEST_GROUP_LABEL = 'TEST: Lucid Flex Trio';
const TEST_GROUP_IDS = ['c3251a5f-11a0-4f15-b3d2-4b5da2f4071a','b4294f15-e53f-45fb-a6ce-63083e9bf8e2','86582a73-04d3-4c53-ad7d-2cbcbb53f3fe'];
for (const a of ACCOUNTS) {
  if (TEST_GROUP_IDS.includes(a.id)) a.copyTradeGroup = TEST_GROUP_LABEL;
}

const activeAccounts = () => ACCOUNTS.filter((a) => a.status === 'active');

// db-state-full account shape — mirrors getFullState's AccountState (label,
// first4, last4, stage, ...) PLUS the cockpit picker fields the live endpoint
// omits (id, displayLabel, status, phase). The picker keys off
// nickname || displayLabel || id — without these the account renders blank.
const stateAccounts = activeAccounts().map((a) => ({
  id: a.id, label: a.displayLabel, displayLabel: a.displayLabel, nickname: a.nickname,
  first4: a.accountFirst4, last4: a.accountNumberLast4, firm: a.firm, plan: a.evalType,
  stage: a.phase === 'live' ? 'live_active' : a.phase === 'funded' ? 'funded_active' : 'eval_active',
  status: 'active', phase: a.phase,
  accountSize: parseFloat(a.accountSize), balance: parseFloat(a.balance),
  dayPnL: parseFloat(a.balance) - parseFloat(a.dayStartBalance),
  stopOutLevel: parseFloat(a.balance) - parseFloat(a.maxDrawdown),
  roomToStopOut: parseFloat(a.maxDrawdown),
  bindingRule: 'daily', dailyLossLimit: parseFloat(a.dailyDrawdown), maxDrawdown: parseFloat(a.maxDrawdown),
  drawdownUsed: parseFloat(a.drawdownUsed), floorLocked: false, floorLockLevel: a.floorLockLevel ? parseFloat(a.floorLockLevel) : null,
  rules: a.rules, payoutCount: 0, ruleStage: a.phase === 'funded' ? 'funded' : 'eval',
  consistencyPct: null, consistencyUnknown: true, profitSplitPct: a.payout?.profitSplitPct ?? null,
  payoutMin: a.payout?.payoutMin ?? null,
  bestDay: a.payout?.bestDay ?? null, trueProfitTarget: a.payout?.trueProfitTarget ?? null,
  consistencyOk: null, bestDaySource: 'daily_pnl', bestDaySnapshotDays: 3,
  totalProfit: a.payout?.totalProfit ?? 0, winningDays: a.greenDays ?? 0,
  profitSource: 'balance', winningDaysSource: a.greenDaysSource || 'stored',
  winningDaysReq: a.payout?.winningDaysReq ?? null, winningDayMin: a.payout?.winningDayMin ?? null,
  payoutTarget: a.payout?.payoutTarget ?? null, payoutInterval: 'green_days', payoutBuffer: null,
  lifespanDays: 4, daysAlive: 4, openedAt: a.createdAt?.slice(0, 10),
}));

// ─── plan_rules — REAL rows (16) so rule resolution matches live ───────────
const _FALLBACK_PLAN_RULES = [
  { firm_name: 'Alpha Futures', eval_type: 'Zero', account_size: '50000.00', stage: 'any', winning_days_req: 5, winning_day_min: '200.00', payout_min: '1500.00', payout_target: '3000.00', payout_cap_pct: null, profit_split_pct: '90.00', consistency_pct: null, payout_interval: 'green_days', payout_buffer: null, daily_loss_limit: '1000.00' },
  { firm_name: 'Alpha Futures', eval_type: 'Zero', account_size: '50000.00', stage: 'funded', winning_days_req: null, winning_day_min: null, payout_min: null, payout_target: null, payout_cap_pct: null, profit_split_pct: null, consistency_pct: '40.00', payout_interval: null, payout_buffer: null, daily_loss_limit: null },
  { firm_name: 'Alpha Futures', eval_type: 'Zero', account_size: null, stage: 'any', winning_days_req: null, winning_day_min: null, payout_min: null, payout_target: null, payout_cap_pct: null, profit_split_pct: null, consistency_pct: null, payout_interval: null, payout_buffer: null, daily_loss_limit: null },
  { firm_name: 'Lucid Trading', eval_type: 'Lucid Flex', account_size: '25000.00', stage: 'any', winning_days_req: 5, winning_day_min: '100.00', payout_min: '500.00', payout_target: '1000.00', payout_cap_pct: '50', profit_split_pct: '90.00', consistency_pct: null, payout_interval: 'green_days', payout_buffer: null, daily_loss_limit: null },
  { firm_name: 'Lucid Trading', eval_type: 'Lucid Daily', account_size: '25000.00', stage: 'any', winning_days_req: null, winning_day_min: null, payout_min: null, payout_target: null, payout_cap_pct: null, profit_split_pct: '90.00', consistency_pct: null, payout_interval: null, payout_buffer: null, daily_loss_limit: '600.00' },
  { firm_name: 'Lucid Trading', eval_type: 'Lucid Daily', account_size: '50000.00', stage: 'any', winning_days_req: null, winning_day_min: null, payout_min: null, payout_target: null, payout_cap_pct: null, profit_split_pct: null, consistency_pct: null, payout_interval: null, payout_buffer: null, daily_loss_limit: null },
  { firm_name: 'Lucid Trading', eval_type: 'Lucid Flex', account_size: '50000.00', stage: 'any', winning_days_req: 5, winning_day_min: '150.00', payout_min: '500.00', payout_target: '2000.00', payout_cap_pct: '50', profit_split_pct: '90.00', consistency_pct: null, payout_interval: 'green_days', payout_buffer: null, daily_loss_limit: '1200.00' },
  { firm_name: 'Lucid Trading', eval_type: 'Lucid Flex', account_size: '50000.00', stage: 'eval', winning_days_req: null, winning_day_min: null, payout_min: null, payout_target: null, payout_cap_pct: null, profit_split_pct: null, consistency_pct: '50.00', payout_interval: null, payout_buffer: null, daily_loss_limit: null },
  { firm_name: 'Lucid Trading', eval_type: 'Lucid Daily', account_size: null, stage: 'any', winning_days_req: null, winning_day_min: null, payout_min: null, payout_target: null, payout_cap_pct: null, profit_split_pct: '90.00', consistency_pct: null, payout_interval: null, payout_buffer: null, daily_loss_limit: null },
  { firm_name: 'Lucid Trading', eval_type: 'Lucid Flex', account_size: null, stage: 'any', winning_days_req: null, winning_day_min: null, payout_min: null, payout_target: null, payout_cap_pct: null, profit_split_pct: null, consistency_pct: null, payout_interval: null, payout_buffer: null, daily_loss_limit: null },
  { firm_name: 'My Funded Futures', eval_type: 'Rapid EOD', account_size: '50000.00', stage: 'any', winning_days_req: null, winning_day_min: null, payout_min: null, payout_target: null, payout_cap_pct: null, profit_split_pct: '90.00', consistency_pct: null, payout_interval: null, payout_buffer: null, daily_loss_limit: '1000.00' },
  { firm_name: 'My Funded Futures', eval_type: 'Rapid', account_size: '50000.00', stage: 'any', winning_days_req: null, winning_day_min: null, payout_min: '500.00', payout_target: null, payout_cap_pct: null, profit_split_pct: '90.00', consistency_pct: null, payout_interval: 'daily', payout_buffer: '2100', daily_loss_limit: '1000.00' },
  { firm_name: 'My Funded Futures', eval_type: 'Builder', account_size: '50000.00', stage: 'any', winning_days_req: 2, winning_day_min: null, payout_min: '500.00', payout_target: '2000.00', payout_cap_pct: null, profit_split_pct: '80.00', consistency_pct: '50.00', payout_interval: 'green_days', payout_buffer: '2100', daily_loss_limit: '1000.00' },
  { firm_name: 'My Funded Futures', eval_type: 'Rapid EOD', account_size: null, stage: 'any', winning_days_req: null, winning_day_min: null, payout_min: null, payout_target: null, payout_cap_pct: null, profit_split_pct: '90.00', consistency_pct: null, payout_interval: null, payout_buffer: null, daily_loss_limit: null },
  { firm_name: 'My Funded Futures', eval_type: 'Rapid', account_size: null, stage: 'any', winning_days_req: null, winning_day_min: null, payout_min: '500.00', payout_target: null, payout_cap_pct: null, profit_split_pct: '90.00', consistency_pct: '50.00', payout_interval: 'daily', payout_buffer: '1100', daily_loss_limit: null },
  { firm_name: 'Tradeify', eval_type: 'Select flex', account_size: '50000.00', stage: 'any', winning_days_req: 5, winning_day_min: '150.00', payout_min: '250.00', payout_target: '2500.00', payout_cap_pct: '50', profit_split_pct: '90.00', consistency_pct: null, payout_interval: 'green_days', payout_buffer: null, daily_loss_limit: '2000.00' },
];

const PLAN_RULES = (snapshotPlanRules().length ? snapshotPlanRules() : _FALLBACK_PLAN_RULES);


// ─── Personal trades — REAL instrument mix from personal_trades (116 rows:
// MNQZ6 57, MNQM6 19, MNQH6 17, MNQU6 9, NQH6 4, MGCM6 3, MESM6 3...). Values
// generated within the real ranges; all account_name NinjaTrader (only account
// that exists live). ────────────────────────────────────────────────────────────
function genTrades() {
  const trades = [];
  const day = (d) => new Date(Date.UTC(2026, 9, d, 15 + Math.floor(Math.random() * 4), Math.floor(Math.random() * 60), 0, 0));
  const series = [
    { instrument: 'MNQZ6', n: 14, lo: -96, hi: 152.5 },
    { instrument: 'MNQM6', n: 6, lo: -556.5, hi: 1296 },
    { instrument: 'MNQH6', n: 5, lo: -654.5, hi: 888.5 },
    { instrument: 'MNQU6', n: 3, lo: -382.5, hi: 608.5 },
    { instrument: 'NQH6', n: 2, lo: -1605, hi: 800 },
    { instrument: 'MGCM6', n: 1, lo: -391, hi: 68 },
    { instrument: 'MESM6', n: 1, lo: -43.75, hi: 65 },
    // Crypto trades — so the Personal tab has multiple accounts to switch between
    { instrument: 'BTCUSDT', n: 3, lo: -100, hi: 300, crypto: true },
    { instrument: 'ETHUSDT', n: 2, lo: -50, hi: 100, crypto: true },
  ];
  let i = 1;
  for (const s of series) {
    for (let k = 0; k < s.n; k++) {
      const amount = Math.round((s.lo + Math.random() * (s.hi - s.lo)) * 100) / 100;
      const win = amount >= 0;
      const isCrypto = s.crypto === true;
      trades.push({
        id: `mock-pt-${i++}`, userId: USER_ID, broker: isCrypto ? 'Binance' : 'NinjaTrader', accountName: isCrypto ? 'Crypto' : 'NinjaTrader',
        instrument: s.instrument, direction: Math.random() > 0.5 ? 'long' : 'short',
        entryPrice: '0', exitPrice: '0', quantity: '1.0000', amount: amount.toFixed(2),
        result: win ? 'win' : 'loss', fees: '0.00', strategy: null, slType: null, tpMethod: null,
        tryCounter: null, riskReward: null, marginCallFees: '0', notes: '', externalId: null,
        tradeDate: day(5 + (i % 7)).toISOString(),
        createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      });
    }
  }
  return trades;
}
const PERSONAL_TRADES = (snapshotPersonalTrades().length
  ? snapshotPersonalTrades().map((t) => ({
      // Snapshot rows are bare DB rows — fill in the API-shape fields the
      // Personal tab reads so live and dev match exactly. Where the live
      // DB has null (strategy, sl_type, etc. — your data did too), we
      // leave them null instead of inventing.
      id: t.id,
      userId: t.userId ?? USER_ID,
      broker: t.broker ?? 'NinjaTrader',
      accountName: t.accountName ?? 'NinjaTrader',
      instrument: t.instrument,
      direction: t.direction,
      entryPrice: t.entryPrice ?? '0',
      exitPrice: t.exitPrice ?? '0',
      quantity: t.quantity ?? '1.0000',
      amount: String(t.amount ?? 0),
      result: t.result,
      fees: t.fees ?? '0.00',
      strategy: t.strategy ?? null,
      slType: t.slType ?? null,
      tpMethod: t.tpMethod ?? null,
      tryCounter: t.tryCounter ?? null,
      stuckToSize: t.stuckToSize ?? false,
      riskReward: t.riskReward ?? null,
      marginCallFees: t.marginCallFees ?? '0',
      notes: t.notes ?? '',
      externalId: t.externalId ?? null,
      tradeDate: t.tradeDate,
      createdAt: t.createdAt ?? new Date().toISOString(),
    }))
  : genTrades()
);

const personalStats = (() => {
  const wins = PERSONAL_TRADES.filter((t) => t.result === 'win');
  const losses = PERSONAL_TRADES.filter((t) => t.result === 'loss');
  const signed = (t) => (t.result === 'loss' ? -Math.abs(parseFloat(t.amount)) : Math.abs(parseFloat(t.amount)));
  const totalPnL = PERSONAL_TRADES.reduce((s, t) => s + signed(t), 0);
  const byInstrument = {};
  for (const t of PERSONAL_TRADES) {
    const key = t.instrument;
    byInstrument[key] = byInstrument[key] || { instrument: key, count: 0, wins: 0, losses: 0, winRate: 0, pnl: 0 };
    byInstrument[key].count++; t.result === 'win' ? byInstrument[key].wins++ : byInstrument[key].losses++;
    byInstrument[key].pnl += signed(t);
  }
  Object.values(byInstrument).forEach((b) => { b.winRate = Math.round((b.wins / b.count) * 1000) / 10; });
  return {
    balance: 15480.75, totalTrades: PERSONAL_TRADES.length, wins: wins.length, losses: losses.length,
    winRate: Math.round((wins.length / PERSONAL_TRADES.length) * 1000) / 10,
    totalPnL: Math.round(totalPnL * 100) / 100,
    avgWin: wins.length ? Math.round((wins.reduce((s, t) => s + Math.abs(parseFloat(t.amount)), 0) / wins.length) * 100) / 100 : 0,
    avgLoss: losses.length ? Math.round((losses.reduce((s, t) => s + Math.abs(parseFloat(t.amount)), 0) / losses.length) * 100) / 100 : 0,
    bestTrade: Math.max(...PERSONAL_TRADES.map((t) => Math.abs(parseFloat(t.amount)))),
    worstTrade: Math.min(...PERSONAL_TRADES.map((t) => -Math.abs(parseFloat(t.amount)))),
    avgFees: 0, totalFees: 0, avgRR: 0, marginCallCount: 0, totalMarginCallFees: 0,
    byInstrument: Object.values(byInstrument),
    byInstrumentRaw: Object.values(byInstrument),
    dailyPnL: [], byStrategy: [], bySlType: [], byTpMethod: [], byTryCounter: [], byStuckToSize: [],
  };
})();

const PROMPT_OPTIONS = {
  setup_tf: [{ value: '15s', label: '15s' }, { value: '1m', label: '1m' }, { value: '5m', label: '5m' }, { value: '15m', label: '15m' }, { value: '1h', label: '1h' }],
  entry_tf: [{ value: '15s', label: '15s' }, { value: '1m', label: '1m' }, { value: '5m', label: '5m' }, { value: '15m', label: '15m' }],
  sl_placement: [{ value: 'Below Entry', label: 'Below Entry' }, { value: 'Below Setup', label: 'Below Setup' }, { value: 'Wide', label: 'Wide' }, { value: 'Hard', label: 'Hard' }, { value: 'Mental', label: 'Mental' }],
};
const VARIANTS = ['RSI divergence', 'Below structure', 'Liquidity sweep', 'Trend continuation', 'Opening range'];

// ─── Budget state — REAL accounts/balances/loanKinds from budget_state ─────────
const BUDGET_ACCOUNTS = [
  { id: 'acc_sofi', icon: 'bank', name: 'Sofi', color: 'blue', balance: 58.01, overdue: false },
  { id: 'acc_cash', icon: 'cash', name: 'Cash', color: 'green', balance: 214, overdue: false },
  { id: 'acc_affirm', icon: 'card', name: 'Affirm', color: 'cyan', balance: 1076.92, overdue: false, loanKind: 'credit' },
  { id: 'acc_klarna', icon: 'card', name: 'Klarna', color: 'cyan', balance: 524.8, overdue: false, loanKind: 'credit' },
  { id: 'acc_sezzle', icon: 'card', name: 'Sezzle', color: 'cyan', balance: 0, overdue: false, loanKind: 'credit' },
  { id: 'acc_premier', icon: 'card', name: 'Premier', color: 'cyan', balance: 553.23, overdue: false, loanKind: 'credit' },
  { id: 'acc_aspire', icon: 'card', name: 'Aspire', color: 'orange', balance: 1972.57, overdue: false, loanKind: 'credit' },
  { id: 'acc_destiny', icon: 'card', name: 'Destiny', color: 'pink', balance: 889.94, overdue: false, loanKind: 'credit' },
  { id: 'acc_capitalone', icon: 'card', name: 'Capital One', color: 'orange', balance: 470.79, overdue: false, loanKind: 'credit' },
  { id: 'acc_cashapp', icon: 'cash', name: 'Cash App', color: 'green', balance: -196.9, overdue: false },
  { id: 'acc_christian', icon: 'card', name: 'Christian', color: 'orange', notes: 'Daniel owes $1,500. Arrangement: pay off Christian\'s card ($1,700) by Oct 22 2026 instead of $500 instalments; that leaves Christian owing Daniel $200. Recorded as a $200 receivable only AFTER the payment actually clears.', balance: 1500, overdue: false, loanKind: 'debt', loanOriginal: 1500, loanPayoffBalance: 1500 },
  { id: 'acc_atlas', icon: 'cash', name: 'Atlas', color: 'green', balance: 10, overdue: false },
  { id: 'acc_one_pay', icon: 'cash', name: 'One Pay', color: 'green', balance: -105.73, overdue: false },
  { id: 'acc_revel', icon: 'card', name: 'Revel', color: 'orange', balance: 386.4, overdue: false, loanKind: 'credit' },
  { id: '6tdzumg', icon: 'cash', name: 'SplitPay', color: 'green', balance: 0, overdue: false, loanKind: 'debt', subAccounts: [{ id: 'xpynj4t', name: 'Unallocated', balance: 0, isUnallocated: true }], loanOriginal: 0, loanPayoffBalance: 0 },
  { id: 'pkqdn66', icon: 'cash', name: 'American Water', color: 'green', balance: 1457.2, overdue: true, loanKind: 'debt', subAccounts: [{ id: 'oajqcd4', name: 'Unallocated', balance: 0, isUnallocated: true }], loanOriginal: 0, overdueNotes: 'Utility arrears — BAD debt. Holds the score down until cleared.', overdueSince: '2026-10-03', loanPayoffBalance: 0 },
  { id: 'acc_reflex', name: 'Reflex', balance: 499.75, dueDate: 0, overdue: false, loanKind: 'credit', isLiability: true, interestRate: 0 },
  { id: 'acc_dave', name: 'Dave', notes: 'Lending app. Daniel OWES this — stored positive like every other liability. Corrected Sep 30 2026 (was negative, which read as a receivable).', balance: 294.18, dueDate: 0, overdue: false, loanKind: 'borrow', isLiability: true, interestRate: 0 },
  { id: 'acc_rent_held', name: 'Rent money held', balance: 0, dueDate: 0, overdue: false, loanKind: 'borrow', isLiability: false, interestRate: 0 },
  { id: 'acc_bills_held_v2', name: 'Bills money held', balance: 314, dueDate: 0, loanKind: 'borrow', isLiability: true, interestRate: 0 },
];

const _FALLBACK_BUDGET_STATE = {
  income: 3240.32,
  excludePropFirm: true,
  accounts: BUDGET_ACCOUNTS,
  categories: [
    { id: 'cat_needs', name: 'Needs', percent: 85 },
    { id: 'cat_wants', name: 'Wants', percent: 10 },
    { id: '8sxjlu9', name: 'Savings', percent: 5 },
    { id: 'cat_propfirm', name: 'Prop Firm', percent: 0 },
  ],
  transactions: [
    { id: 'bc5543b5', date: '2026-09-04', name: 'Eval — Lucid Trading 50K (0007)', type: 'expense', amount: 101.6, excluded: false, accountId: 'acc_one_pay', categoryId: 'cat_propfirm', isPropFirm: true },
    { id: '55f209e9', date: '2026-09-06', name: 'Eval — Lucid Trading 50K (0048)', type: 'expense', amount: 90.2, excluded: false, accountId: 'acc_sofi', categoryId: 'cat_propfirm', isPropFirm: true },
    { id: '9b535d4e', date: '2026-09-06', name: 'Eval — Lucid Trading 50K (0049)', type: 'expense', amount: 90.2, excluded: false, accountId: 'acc_sofi', categoryId: 'cat_propfirm', isPropFirm: true },
    { id: '68f3acd6', date: '2026-09-06', name: 'Eval — MFF 25K (9059)', type: 'expense', amount: 72.5, excluded: false, accountId: 'acc_sofi', categoryId: 'cat_propfirm', isPropFirm: true },
    { id: '2d447c6d', date: '2026-09-07', name: 'Balance reconcile (unlogged activity)', type: 'adjustment', amount: 415.37, account: 'acc_sofi', category: 'adjustment', direction: 'income', isPropFirm: false, reconciled: true, expenseGroup: 'living' },
    { id: 'd3e9b852', date: '2026-09-07', name: 'Balance reconcile (unlogged activity)', type: 'adjustment', amount: 81, account: 'acc_cash', category: 'adjustment', direction: 'income', isPropFirm: false, reconciled: true, expenseGroup: 'living' },
  ],
  recurring: [
    { id: 'rec_car_insurance', name: 'Car + insurance', notes: 'Car $680 + insurance $354. Due the 9th of every month.', active: true, amount: 1034, accountId: null, frequency: 'monthly', categoryId: 'cat_needs', dayOfMonth: 9 },
  ],
  _deleted: {},
};

// Snapshot covers accounts/transactions/recurring/categories. We MERGE with
// the fallback so the snapshot's missing keys (categories, _deleted) still
// have plausible defaults, but real accounts/balances/loanKinds come through.
const BUDGET_STATE = (() => {
  const snap = snapshotBudgetState();
  if (!snap) return _FALLBACK_BUDGET_STATE;
  return {
    ..._FALLBACK_BUDGET_STATE,
    ...snap,
    // Make sure these exist even if the snapshot row didn't include them
    _deleted: snap._deleted || _FALLBACK_BUDGET_STATE._deleted,
    categories: snap.categories || _FALLBACK_BUDGET_STATE.categories,
  };
})();

// ─── Notes / Goals — REAL cascade from plan_notes ─────────────────────────────
const _FALLBACK_NOTES = [
  { id: 'd8e1e508-268b-4704-933e-88ced7b35e2e', userId: USER_ID, horizon: 'long_term', title: 'Grow personal account to $20K', body: '', priority: 10, completed: false, completedAt: null, parentId: null, sortOrder: 0, createdAt: '2026-10-11T23:57:48.640Z', updatedAt: '2026-10-11T23:57:48.640Z' },
  { id: '1978d3ce-2d63-4d75-ba2b-547d8740b46f', userId: USER_ID, horizon: 'mid_term', title: 'First $500', body: '', priority: 10, completed: false, completedAt: null, parentId: 'd8e1e508-268b-4704-933e-88ced7b35e2e', sortOrder: 0, createdAt: '2026-10-11T23:57:49.149Z', updatedAt: '2026-10-11T23:57:49.149Z' },
  { id: '92a38a11-30a3-47bd-9597-28eeedb239eb', userId: USER_ID, horizon: 'mid_term', title: 'Reach $1,000', body: '', priority: 9, completed: false, completedAt: null, parentId: 'd8e1e508-268b-4704-933e-88ced7b35e2e', sortOrder: 1, createdAt: '2026-10-11T23:57:49.641Z', updatedAt: '2026-10-11T23:57:49.641Z' },
  { id: '2dda1871-c236-42ef-9bb1-c66659c4158b', userId: USER_ID, horizon: 'mid_term', title: 'Scale to $5K', body: '', priority: 8, completed: false, completedAt: null, parentId: 'd8e1e508-268b-4704-933e-88ced7b35e2e', sortOrder: 2, createdAt: '2026-10-11T23:57:50.062Z', updatedAt: '2026-10-11T23:57:50.062Z' },
  { id: '8bc01530-c1d6-43bd-959b-406a8f2c89c7', userId: USER_ID, horizon: 'mid_term', title: 'Scale to $10K', body: '', priority: 7, completed: false, completedAt: null, parentId: 'd8e1e508-268b-4704-933e-88ced7b35e2e', sortOrder: 3, createdAt: '2026-10-11T23:57:50.471Z', updatedAt: '2026-10-11T23:57:50.471Z' },
  { id: 'bdf8b59b-cc25-4589-a498-a9d9955e837b', userId: USER_ID, horizon: 'mid_term', title: 'Scale to $20K', body: '', priority: 6, completed: false, completedAt: null, parentId: 'd8e1e508-268b-4704-933e-88ced7b35e2e', sortOrder: 4, createdAt: '2026-10-11T23:57:50.873Z', updatedAt: '2026-10-11T23:57:50.873Z' },
  { id: 'fef7cfcb-89bd-49f2-88e3-25930e9113e2', userId: USER_ID, horizon: 'short_term', title: 'Hit first $100 green day', body: '', priority: 7, completed: false, completedAt: null, parentId: '1978d3ce-2d63-4d75-ba2b-547d8740b46f', sortOrder: 0, createdAt: '2026-10-11T23:57:51.320Z', updatedAt: '2026-10-11T23:57:51.320Z' },
  { id: '0bdacdc6-244e-4a06-b95f-f4f9da1d58f4', userId: USER_ID, horizon: 'short_term', title: 'Pass an eval for first payout', body: '', priority: 7, completed: false, completedAt: null, parentId: '1978d3ce-2d63-4d75-ba2b-547d8740b46f', sortOrder: 1, createdAt: '2026-10-11T23:57:51.703Z', updatedAt: '2026-10-11T23:57:51.703Z' },
  { id: 'd3253f03-e37e-4367-959b-7e66cc0c8fcb', userId: USER_ID, horizon: 'short_term', title: 'Spark income for seed money', body: '', priority: 7, completed: false, completedAt: null, parentId: '1978d3ce-2d63-4d75-ba2b-547d8740b46f', sortOrder: 2, createdAt: '2026-10-11T23:57:52.168Z', updatedAt: '2026-10-11T23:57:52.168Z' },
  { id: '11887dc3-e6ef-46ec-954d-bda0d7e31af3', userId: USER_ID, horizon: 'short_term', title: '3 consistent green days on personal', body: '', priority: 7, completed: false, completedAt: null, parentId: '1978d3ce-2d63-4d75-ba2b-547d8740b46f', sortOrder: 3, createdAt: '2026-10-11T23:57:52.732Z', updatedAt: '2026-10-11T23:57:52.732Z' },
];

const NOTES = (snapshotPlanNotes().length ? snapshotPlanNotes() : _FALLBACK_NOTES);


const AGENDA_ENTRIES = [
  { title: 'Review market plan', startTime: '08:30', endTime: '09:00', category: 'Trading', icon: '📈' },
  { title: 'Lucid 150K — Session 1', startTime: '09:30', endTime: '11:30', category: 'Trading', icon: '🎯' },
  { title: 'Lunch break', startTime: '12:00', endTime: '13:00', category: 'Life', icon: '🍽️' },
  { title: 'Tradify 150K — Session 2', startTime: '13:30', endTime: '15:30', category: 'Trading', icon: '💼' },
  { title: 'Log trades + journal', startTime: '16:00', endTime: '17:00', category: 'Admin', icon: '📝' },
];

const budgetSummary = (() => {
  const accounts = BUDGET_STATE.accounts || [];
  const cash = accounts.filter((a) => !['credit', 'debt', 'borrow'].includes(a.loanKind || '') && a.balance > 0).reduce((s, a) => s + a.balance, 0);
  const owed = accounts.filter((a) => ['credit', 'debt', 'borrow'].includes(a.loanKind || '') && a.balance > 0 && !a.overdue).reduce((s, a) => s + a.balance, 0);
  const overdue = accounts.filter((a) => a.overdue).reduce((s, a) => s + a.balance, 0);
  return {
    cashOnHand: Math.round(cash * 100) / 100,
    totalOwed: Math.round((owed + overdue) * 100) / 100,
    overdueDebt: Math.round(overdue * 100) / 100,
    owedToMe: 0,
    monthlyRecurring: 1034,
    net: Math.round((cash + 0 - owed - overdue) * 100) / 100,
    accounts: accounts.map((a) => ({
      id: a.id, name: a.name, balance: a.balance,
      isLiability: ['credit', 'debt', 'borrow'].includes(a.loanKind || ''),
      overdue: !!a.overdue, overdueSince: a.overdueSince || null, owedToMe: 0,
    })),
    recurring: BUDGET_STATE.recurring,
  };
})();

// Cockpit state machine — in-memory per user
let cockpitState = { cockpitState: 'pre_trade', mode: 'balanced', score: 67, slHitCount: 0, dailyWins: 0, dailyLosses: 0, streak: 0, strategyStats: {}, currentStrategy: null, lastAction: null, lastActionTime: Date.now(), cooldown: false };

function send(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS' });
  res.end(payload);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost:8888');
  const path = url.pathname.replace(/^\/\.netlify\/functions\//, '').replace(/^\//, '');
  const method = req.method;

  if (method === 'OPTIONS') return send(res, 200, { ok: true });

  let body = null;
  if (method === 'POST' || method === 'PUT') {
    body = await new Promise((resolve) => {
      let data = '';
      req.on('data', (c) => { data += c; });
      req.on('end', () => { try { resolve(data ? JSON.parse(data) : {}); } catch { resolve({}); } });
    });
  }

  const q = url.searchParams;

  // ── db-state-full: cockpit + dashboard state ─────────────────────────────
  if (path === 'db-state-full') {
    return send(res, 200, {
      accounts: stateAccounts,
      velocity: {
        evalFailures: { n: 12, avgDays: 14.2, medianDays: 13, fastestDays: 3 },
        fundedFailures: { n: 3, avgDays: 22.5 },
        evalPasses: { n: 6, avgDays: 9.8, fastestDays: 1 },
        oldestOpenDays: 5, newestOpenDays: 1,
      },
      budget: budgetSummary,
      botNotes: [],
      totals: { activeEvals: 2, fundedAccounts: 0, liveAccounts: 0, spentThisMonth: 0, payoutsThisMonth: 0 },
      lastActions: [
        { id: 'log1', action: 'set-balance', summary: 'Balance set for LFE0-0001', createdAt: '2026-10-12T21:05:00.000Z', undone: false },
      ],
    });
  }

  // ── db-accounts: the Accounts tab source (active-only, like live) ────────
  if (path === 'db-accounts') {
    if (q.get('action') === 'get-trading-mode') {
      return send(res, 200, {
        score: 67, mode: 'balanced', evalCount: 2, fundedCount: 0, liveCount: 0,
        cashOnHand: String(budgetSummary.cashOnHand), totalDebt: String(budgetSummary.totalOwed),
        overdueDebt: String(budgetSummary.overdueDebt), owedToMe: '0',
        personalBalance: 15480.75, riskPerTrade: 200, maxEvalLoss: 1, maxFundedLoss: 1, maxLiveLoss: 0,
        notes: null, rules: [
          { mode: 'balanced', rules: ['200$ Per Trade', '5 Max Loss'] },
          { mode: 'conservative', rules: ['150$ Per Trade', '5 Max Loss'] },
          { mode: 'aggressive', rules: ['300$ Per Trade', '3 Max Loss'] },
        ],
      });
    }
    const showAll = q.get('all') === 'true';
    return send(res, 200, { accounts: showAll ? ACCOUNTS : activeAccounts() });
  }

  // ── db-personal-trades ────────────────────────────────────────────────────
  if (path === 'db-personal-trades') {
    if (method === 'GET') {
      if (q.get('action') === 'stats') return send(res, 200, { stats: personalStats });
      const limit = q.get('limit') ? parseInt(q.get('limit')) : undefined;
      return send(res, 200, { trades: limit ? PERSONAL_TRADES.slice(0, limit) : PERSONAL_TRADES });
    }
    const action = body?.action;
    if (action === 'stats') return send(res, 200, { stats: personalStats });
    if (action === 'strategies') {
      const set = [...new Set(PERSONAL_TRADES.map((t) => t.strategy).filter(Boolean))];
      return send(res, 200, { strategies: set });
    }
    if (action === 'prompt-options') return send(res, 200, { options: PROMPT_OPTIONS });
    if (action === 'variant-history') return send(res, 200, { variants: VARIANTS });
    if (action === 'log-strategy') return send(res, 200, { ok: true });
    if (action === 'strategy-stats') return send(res, 200, { strategies: [] });
    if (action === 'log-trade') return send(res, 200, { trade: { id: 't-new', ...(body || {}) } });
    if (action === 'delete-trade') return send(res, 200, { deleted: true });
    if (action === 'update-trade') return send(res, 200, { trade: { id: body?.id, ...(body || {}) } });
    if (action === 'update-balance') return send(res, 200, { balance: { balance: body?.balance ?? '15480.75' } });
    if (action === 'add-prompt-option') return send(res, 200, { option: { id: 'opt-new', ...body } });
    if (action === 'remove-prompt-option') return send(res, 200, { deleted: true });
    return send(res, 200, { ok: true });
  }

  // ── trading-mode: cockpit state machine ───────────────────────────────────
  if (path === 'trading-mode') {
    if (method === 'GET') {
      return send(res, 200, { ...cockpitState, voiceKey: null, voiceMessage: '' });
    }
    const action = body?.action || 'unknown';
    const now = Date.now();
    if (action === 'enter_cockpit') { cockpitState.cockpitState = 'pre_trade'; cockpitState.freshSetup = true; }
    else if (action === 'in_trade') { cockpitState.cockpitState = 'in_trade'; }
    else if (action === 'out_trade') { cockpitState.cockpitState = 'out_trade'; }
    else if (action === 'tp_hit') { cockpitState.cockpitState = 'tp_hit'; cockpitState.dailyWins++; cockpitState.streak = cockpitState.streak > 0 ? cockpitState.streak + 1 : 1; }
    else if (action === 'sl_hit') { cockpitState.cockpitState = 'sl_hit'; cockpitState.dailyLosses++; cockpitState.slHitCount++; cockpitState.streak = cockpitState.streak < 0 ? cockpitState.streak - 1 : -1; cockpitState.cooldown = true; }
    else if (action === 'ddl') { cockpitState.cockpitState = 'ddl'; }
    else if (action === 'breach') { cockpitState.cockpitState = 'breach'; }
    else if (action === 'fresh_trade') { cockpitState.cockpitState = 'pre_trade'; cockpitState.freshSetup = true; cockpitState.slHitCount = 0; }
    else if (action && action.startsWith('strategy')) { cockpitState.cockpitState = 'in_trade'; cockpitState.currentStrategy = body?.strategy || null; cockpitState.freshSetup = true; }
    cockpitState.lastAction = action;
    cockpitState.lastActionTime = now;
    return send(res, 200, { ...cockpitState, voiceKey: null, voiceMessage: '' });
  }

  // ── db-calendar ───────────────────────────────────────────────────────────
  if (path === 'db-calendar') {
    if (action(body) === 'upsert-entry') {
      return send(res, 200, { entry: { id: 'cal-1', date: body.date, followedRules: body.followedRules, balanceSnapshot: body.balanceSnapshot, pnlSnapshot: body.pnlSnapshot } });
    }
    if (action(body) === 'create-account') return send(res, 200, { account: { id: 'cal-acct-1' } });
    return send(res, 200, { ok: true });
  }

  // ── db-budget-state ───────────────────────────────────────────────────────
  if (path === 'db-budget-state') {
    return send(res, 200, { state: { ...BUDGET_STATE, transactions: [...BUDGET_STATE.transactions] } });
  }

  // ── db-notes ──────────────────────────────────────────────────────────────
  if (path === 'db-notes') {
    const act = body?.action;
    if (act === 'list-notes') return send(res, 200, { notes: NOTES });
    if (act === 'create-note') return send(res, 200, { note: { id: 'n-new', ...body, userId: USER_ID, createdAt: new Date().toISOString() } });
    if (act === 'update-note') return send(res, 200, { note: { ...body, userId: USER_ID } });
    if (act === 'delete-note') return send(res, 200, { deleted: true });
    if (act === 'request-breakdown') return send(res, 200, { ok: true });
    return send(res, 200, { notes: NOTES });
  }

  // ── daily-agenda ──────────────────────────────────────────────────────────
  if (path === 'daily-agenda') {
    if (method === 'GET') return send(res, 200, { date: q.get('date') || today(), entries: AGENDA_ENTRIES });
    return send(res, 200, { ok: true, date: body?.date, entries: body?.entries });
  }

  // ── db-prop-trades ────────────────────────────────────────────────────────
  if (path === 'db-prop-trades') {
    const act = body?.action;
    if (act === 'stats') return send(res, 200, { stats: { totals: { count: 2, wins: 1, losses: 1, pnl: 1709 }, byPhase: [{ phase: 'eval', count: 2, wins: 1, losses: 1, pnl: 1709 }] } });
    if (act === 'create') return send(res, 200, { trade: { id: 'pt-new', ...body } });
    if (act === 'log-strategy') return send(res, 200, { ok: true });
    return send(res, 200, { stats: { totals: { count: 2, wins: 1, losses: 1, pnl: 1709 }, byPhase: [] } });
  }

  // ── db-trades (plan-rules read — the bot reads these) ─────────────────────
  if (path === 'db-trades') {
    if (q.get('action') === 'plan-rules') {
      return send(res, 200, { rules: PLAN_RULES });
    }
    return send(res, 200, { rules: PLAN_RULES });
  }

  // ── db-challenges (buy/pass/promote — echo success so UI flow completes) ──
  if (path === 'db-challenges') {
    const act = body?.action || q.get('action');
    if (act === 'buy-eval') return send(res, 200, { challenge: { id: 'ch-new', ...body }, account: { id: 'acct-new' } });
    if (act === 'pass-eval') return send(res, 200, { ok: true });
    if (act === 'promote-to-live') return send(res, 200, { ok: true });
    if (act === 'fail-account') return send(res, 200, { ok: true });
    return send(res, 200, { ok: true });
  }

  // ── db-state (Dashboard remote load — returns firms + challenges) ──────────
  if (path === 'db-state' || path === 'user/data') {
    return send(res, 200, {
      firms: [
        { id: 'firm-1', name: 'Lucid Trading', createdAt: '2026-10-09T14:00:00.000Z' },
        { id: 'firm-2', name: 'My Funded Futures', createdAt: '2026-09-06T14:00:00.000Z' },
        { id: 'firm-3', name: 'Tradify', createdAt: '2026-10-12T14:00:00.000Z' },
        { id: 'firm-4', name: 'Alpha Futures', createdAt: '2026-09-10T14:00:00.000Z' },
      ],
      challenges: [
        { id: 'ch-09e2adc2', propFirmId: 'firm-1', brokerName: 'Lucid Trading', accountLast4: '0001', accountSize: 150000, cost: 197.5, initialCost: 197.5, startDate: '2026-10-09', lifecycle: 'eval_active', accountId: '09e2adc2-5244-4ae8-8c1a-e162d8eac86b', displayLabel: 'LFE0-0001', evalType: 'Flex', payouts: [], phase1Completed: false, activationFeeAmount: null, firmType: 'lucid', hasActivationFee: false, isDeferred: false, purchasedBy: null },
        { id: 'ch-c0786bbb', propFirmId: 'firm-3', brokerName: 'Tradify', accountLast4: '4669', accountSize: 150000, cost: 210.0, initialCost: 210.0, startDate: '2026-10-12', lifecycle: 'eval_active', accountId: 'c0786bbb-cd58-4a1e-a04a-38d9ac16aef9', displayLabel: 'TDFY-4669', evalType: 'Select', payouts: [], phase1Completed: false, activationFeeAmount: null, firmType: 'tradeify', hasActivationFee: false, isDeferred: false, purchasedBy: null },
        { id: 'ch-0e5225da', propFirmId: 'firm-2', brokerName: 'My Funded Futures', accountLast4: '9059', accountSize: 25000, cost: 72.5, initialCost: 72.5, startDate: '2026-09-06', lifecycle: 'eval_passed', accountId: '0e5225da-188b-4f75-85f7-4b5ddfe8ecf9', displayLabel: 'MFFU-9059', evalType: 'Rapid', payouts: [], phase1Completed: true, phase1CompletedAt: '2026-09-09T15:23:32.059Z', activationFeeAmount: null, firmType: 'mffu', hasActivationFee: false, isDeferred: false, purchasedBy: null },
        { id: 'ch-7f517780', propFirmId: 'firm-1', brokerName: 'Lucid Trading', accountLast4: '0004', accountSize: 25000, cost: 165.0, initialCost: 165.0, startDate: '2026-09-17', lifecycle: 'eval_passed', accountId: '7f517780-2303-4c02-87b0-6b0cea2c78d5', displayLabel: 'LFE0-0004', evalType: 'Lucid Flex', payouts: [], phase1Completed: true, phase1CompletedAt: '2026-09-18T14:54:05.295Z', activationFeeAmount: null, firmType: 'lucid', hasActivationFee: false, isDeferred: false, purchasedBy: null },
      ],
      selectedFirmId: null,
      user: { id: USER_ID, email: USER_EMAIL, name: 'Daniel' },
    });
  }

  // ── Auth-ish: accept dev headers, never 401 ───────────────────────────────
  if (path === 'auth-login' || path === 'auth-signup' || path === 'auth-google' || path === 'auth-session' || path === 'auth-logout') {
    return send(res, 200, { user: { id: USER_ID, email: USER_EMAIL, name: 'Daniel' }, token: 'dev-token' });
  }

  send(res, 404, { error: `Mock not implemented: ${method} ${path}` });
});

function action(body) { return body?.action; }

server.listen(8888, '0.0.0.0', () => {
  const meta = snapshotMeta();
  const a = ACCOUNTS;
  const activeA = a.filter((x) => x.status === 'active');
  const passedA = a.filter((x) => x.status === 'passed');
  console.log('🧪 DEV-ONLY mock functions server on http://localhost:8888 (vite :4175 proxies here)');
  console.log(`   Snapshot: ${meta.ok ? `live from ${meta.snappedAt}` : 'NONE — using hand-typed fixtures'}`);
  console.log(`   Accounts: ${activeA.length} active + ${passedA.length} passed (${a.length} total)`);
  if (activeA[0]) console.log(`     ├─ ${activeA[0].displayLabel} ${activeA[0].firm} $${activeA[0].balance} greenDays=${activeA[0].greenDays}`);
  if (activeA[1]) console.log(`     └─ ${activeA[1].displayLabel} ${activeA[1].firm} $${activeA[1].balance} greenDays=${activeA[1].greenDays}`);
  console.log(`   Payouts: ${snapshotPayouts().length} across the snapshot`);
  console.log(`   Personal trades: ${PERSONAL_TRADES.length} (snapshot sample)`);
  console.log(`   plan_rules: ${PLAN_RULES.length} · budget: ${BUDGET_STATE.accounts?.length ?? 0} accounts · notes: ${NOTES.length}`);
  console.log('   NEVER deployed — stop this before touching production.');
});