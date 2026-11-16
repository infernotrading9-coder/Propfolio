import React from 'react';
import { NeonCard } from './NeonCard';
import { PnLPeriodCard } from './PnLPeriodCard';
// The stats SHAPE and the stats MATHS both live in shared/ — the service and the
// dev mock import the same file, so a locally redeclared interface here would be
// a silent way for the UI to fall behind the API.
import {
  EMPTY_INSTANT_STATS,
  type InstantStats,
  type InstantPeriodRow,
} from '../../shared/instantStats.mts';

/**
 * Vest Markets — Instant Accounts.
 *
 * A SEPARATE TAB ON PURPOSE, not a toggle on the eval dashboard. Instant
 * accounts have no evaluation, so they must never reach the Funded Pass Rate
 * (which is derived from `challenges`). Keeping them in their own tab means no
 * eval surface has to filter anything, and no forgotten filter can fake a stat.
 *
 * Every NUMBER on this screen comes from the API's `stats` object. This file
 * derives nothing — no totals, no sums, no averages. (Two divergent copies of
 * the personal-trade maths caused a real bug in Oct 2026.)
 *
 * MONEY MODEL: the one-time price IS the max drawdown and is never recoverable
 * — Vest funded accounts cannot receive deposits, the trading capital is
 * Vest's. So `cost` is sunk the moment it is paid, and a claim is the only way
 * money ever comes back.
 */

interface InstantAccount {
  id: string;
  nickname: string;
  accountSize: number;
  cost: number;
  purchasedAt: string;
  status: 'alive' | 'dead';
  diedAt: string | null;
  fundingSource: string | null;
  notes: string | null;
  claimed: number;
  pnl: number;
  claimCount: number;
  lifespanDays: number | null;
}

interface InstantClaim {
  id: string;
  accountId: string;
  nickname: string;
  amount: number;
  claimedAt: string;
  notes: string | null;
}

const EMPTY_STATS: InstantStats = EMPTY_INSTANT_STATS;

/** The real Vest instant products. Price always equals the max drawdown. */
const VEST_SIZES = [
  { size: 500, cost: 10, label: '$500' },
  { size: 5000, cost: 200, label: '$5,000' },
  { size: 10000, cost: 400, label: '$10,000' },
  { size: 25000, cost: 1000, label: '$25,000' },
];

const money = (v: number | null | undefined) =>
  v === null || v === undefined
    ? '—'
    : (v < 0 ? '-$' : '$') + Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const today = () => new Date().toISOString().slice(0, 10);

/**
 * "V7" → "Account 7".
 *
 * The stored nickname keeps its Vest prefix — it is the bot's handle and the
 * numbering key that new purchases continue from. But Daniel asked for the CARD
 * to read "Account 1" rather than "B1", so this is presentation only: nothing is
 * renamed in the database, and a nickname with no digits falls through as-is.
 */
const accountLabel = (nickname: string): string => {
  const m = String(nickname || '').match(/(\d+)(?!.*\d)/);
  return m ? `Account ${parseInt(m[1], 10)}` : String(nickname || 'Account');
};

export const InstantTab: React.FC = () => {
  // ── ALL hooks first, before any early return (React error #310) ───────────
  const [accounts, setAccounts] = React.useState<InstantAccount[]>([]);
  const [claims, setClaims] = React.useState<InstantClaim[]>([]);
  const [stats, setStats] = React.useState<InstantStats>(EMPTY_STATS);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  // The P&L cards have a mobile variant; same 768px breakpoint the dashboard
  // uses for the very same card.
  const [isMobile, setIsMobile] = React.useState(false);

  const [showBuy, setShowBuy] = React.useState(false);
  const [buyCount, setBuyCount] = React.useState(1);
  const [buySize, setBuySize] = React.useState(500);
  const [buyCost, setBuyCost] = React.useState(10);
  const [buyDate, setBuyDate] = React.useState(today());
  const [buyFunding, setBuyFunding] = React.useState('card');

  const [claimFor, setClaimFor] = React.useState<InstantAccount | null>(null);
  const [claimAmount, setClaimAmount] = React.useState('');
  const [claimDate, setClaimDate] = React.useState(today());

  // Mistake recovery: edit an account's fields, or fix/remove a payout.
  const [editFor, setEditFor] = React.useState<InstantAccount | null>(null);
  const [editSize, setEditSize] = React.useState(500);
  const [editCost, setEditCost] = React.useState(10);
  const [editDate, setEditDate] = React.useState(today());
  const [editFunding, setEditFunding] = React.useState('card');
  const [editNotes, setEditNotes] = React.useState('');
  const [editClaim, setEditClaim] = React.useState<InstantClaim | null>(null);
  const [confirmClaimDeleteId, setConfirmClaimDeleteId] = React.useState<string | null>(null);

  const [confirmDeleteId, setConfirmDeleteId] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  // Failed-account summary controls. Closed by default — the whole point is that
  // the failed cards are out of sight, but they must stay REACHABLE (a mistaken
  // purchase still has to be deletable, and a card marked dead by accident still
  // has to be revivable).
  const [period, setPeriod] = React.useState<'monthly' | 'weekly'>('monthly');
  const [periodCount, setPeriodCount] = React.useState<6 | 12 | 'all'>(12);
  const [showFailed, setShowFailed] = React.useState(false);

  const getAuthHeaders = React.useCallback((): Record<string, string> => {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    try {
      const raw = localStorage.getItem('user');
      if (raw) {
        const u = JSON.parse(raw);
        if (u?.id) headers['X-User-Id'] = String(u.id);
        if (u?.email) headers['X-User-Email'] = String(u.email);
        if (u?.name) headers['X-User-Name'] = String(u.name);
      }
    } catch {}
    return headers;
  }, []);

  const load = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/.netlify/functions/db-instant', { headers: getAuthHeaders() });
      if (!res.ok) throw new Error(`load failed (${res.status})`);
      const d = await res.json();
      setAccounts(d.accounts || []);
      setClaims(d.claims || []);
      setStats(d.stats || EMPTY_STATS);
    } catch (e: any) {
      setError(String(e?.message || e));
    } finally {
      setLoading(false);
    }
  }, [getAuthHeaders]);

  React.useEffect(() => {
    load();
  }, [load]);

  React.useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth <= 768);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  const post = React.useCallback(
    async (body: Record<string, unknown>): Promise<boolean> => {
      setBusy(true);
      setError(null);
      try {
        const res = await fetch('/.netlify/functions/db-instant', {
          method: 'POST',
          headers: getAuthHeaders(),
          body: JSON.stringify(body),
        });
        const d = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(d?.error || `request failed (${res.status})`);
        await load();
        return true;
      } catch (e: any) {
        setError(String(e?.message || e));
        return false;
      } finally {
        setBusy(false);
      }
    },
    [getAuthHeaders, load],
  );

  const submitBuy = async () => {
    const ok = await post({
      action: 'buy-accounts',
      count: Math.max(1, Math.trunc(Number(buyCount) || 1)),
      accountSize: Number(buySize),
      cost: Number(buyCost),
      purchasedAt: buyDate,
      fundingSource: buyFunding,
    });
    if (ok) {
      setShowBuy(false);
      setBuyCount(1);
    }
  };

  const submitClaim = async () => {
    // Editing an existing payout reuses this modal — same fields, different action.
    if (editClaim) {
      const ok = await post({
        action: 'update-claim',
        id: editClaim.id,
        amount: Number(claimAmount),
        claimedAt: claimDate,
      });
      if (ok) {
        setEditClaim(null);
        setClaimAmount('');
      }
      return;
    }
    if (!claimFor) return;
    const ok = await post({
      action: 'log-claim',
      accountId: claimFor.id,
      amount: Number(claimAmount),
      claimedAt: claimDate,
    });
    if (ok) {
      setClaimFor(null);
      setClaimAmount('');
    }
  };

  const setStatus = (a: InstantAccount, status: 'alive' | 'dead') =>
    post({ action: 'update-account', id: a.id, status });

  const removeAccount = async (id: string) => {
    await post({ action: 'delete-account', id });
    setConfirmDeleteId(null);
  };

  /**
   * Mistake recovery. Editing writes through `update-account`, which is the SAME
   * path the bot uses — and because every number on the tab is derived from the
   * rows on read, a corrected cost or date moves the P&L rows and every tile on
   * the next refresh with nothing else to recompute.
   */
  const openEdit = (a: InstantAccount) => {
    setEditFor(a);
    setEditSize(a.accountSize);
    setEditCost(a.cost);
    setEditDate(a.purchasedAt);
    setEditFunding(a.fundingSource ?? 'card');
    setEditNotes(a.notes ?? '');
  };

  const submitEdit = async () => {
    if (!editFor) return;
    const ok = await post({
      action: 'update-account',
      id: editFor.id,
      accountSize: Number(editSize),
      cost: Number(editCost),
      purchasedAt: editDate,
      fundingSource: editFunding,
      notes: editNotes.trim() === '' ? null : editNotes.trim(),
    });
    if (ok) setEditFor(null);
  };

  const openClaimEdit = (cl: InstantClaim) => {
    setEditClaim(cl);
    setClaimFor(null);
    setClaimAmount(String(cl.amount));
    setClaimDate(cl.claimedAt);
  };

  const removeClaim = async (id: string) => {
    await post({ action: 'delete-claim', id });
    setConfirmClaimDeleteId(null);
  };

  // ── renders ──────────────────────────────────────────────────────────────
  if (loading && accounts.length === 0 && !error) {
    return <div className="text-white/60 py-10 text-center">Loading instant accounts…</div>;
  }

  const netTone = stats.net > 0 ? 'text-green-400' : stats.net < 0 ? 'text-red-400' : 'text-white/70';

  // Presentation-only partitioning — every NUMBER below still comes from the API.
  const activeAccounts = accounts.filter((a) => a.status !== 'dead');
  const failedAccounts = accounts.filter((a) => a.status === 'dead');
  // `?? []` is a guard for an API that predates these fields: a dev mock started
  // BEFORE this change answers without them, and `.slice` on undefined is a white
  // screen. An absent array reads as "no rows", never as an invented figure.
  const periodRows: InstantPeriodRow[] =
    (period === 'monthly' ? stats.monthly : stats.weekly) ?? [];
  const visiblePeriods = periodCount === 'all' ? periodRows : periodRows.slice(0, periodCount);

  // One modal serves "log a payout" and "fix a payout" — only the action differs.
  const claimTargetName = editClaim
    ? accountLabel(editClaim.nickname)
    : claimFor
      ? accountLabel(claimFor.nickname)
      : '';

  return (
    <div className="space-y-6">
      {error && (
        <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-red-200 text-sm">
          {error}
        </div>
      )}

      {/* ── header ───────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="rounded-full border border-cyan-400/40 bg-cyan-400/10 px-3 py-1 text-xs font-semibold tracking-wide text-cyan-200">
            NO EVALUATION
          </span>
          <span className="text-white/50 text-sm">
            Kept separate from evals — these never touch the pass rate.
          </span>
        </div>
        <div className="flex gap-2">
          <button
            onClick={load}
            className="rounded-md border border-white/15 px-3 py-2 text-sm text-white/80 hover:bg-white/10"
          >
            Refresh
          </button>
          <button
            onClick={() => setShowBuy(true)}
            className="rounded-md border border-emerald-400/40 bg-emerald-400/15 px-4 py-2 text-sm font-semibold text-emerald-200 hover:bg-emerald-400/25"
          >
            + Buy accounts
          </button>
        </div>
      </div>

      {/* ── stat tiles ───────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <NeonCard glow="purple" className="p-4">
          <div className="text-white/50 text-xs uppercase tracking-wider">Accounts bought</div>
          <div className="text-3xl font-bold text-white mt-1">{stats.accountsBought}</div>
          <div className="text-white/50 text-xs mt-1">
            {stats.accountsAlive} alive · {stats.accountsDead} dead
          </div>
        </NeonCard>

        <NeonCard glow="green" className="p-4">
          <div className="text-white/50 text-xs uppercase tracking-wider">Money in</div>
          <div className="text-3xl font-bold text-green-300 mt-1">{money(stats.claimed)}</div>
          <div className="text-white/50 text-xs mt-1">
            {stats.payoutsReceived} payout{stats.payoutsReceived === 1 ? '' : 's'}
            {stats.avgClaim !== null ? ` · avg ${money(stats.avgClaim)}` : ''}
          </div>
        </NeonCard>

        <NeonCard glow="red" className="p-4">
          <div className="text-white/50 text-xs uppercase tracking-wider">Money out</div>
          <div className="text-3xl font-bold text-red-300 mt-1">{money(stats.spent)}</div>
          <div className="text-white/50 text-xs mt-1">sunk — the price is the drawdown</div>
        </NeonCard>

        <NeonCard glow={stats.net >= 0 ? 'green' : 'red'} className="p-4">
          <div className="text-white/50 text-xs uppercase tracking-wider">Net</div>
          <div className={`text-3xl font-bold mt-1 ${netTone}`}>{money(stats.net)}</div>
          <div className="text-white/50 text-xs mt-1">
            {stats.roi !== null ? `${(stats.roi * 100).toFixed(1)}% on spend` : '—'}
          </div>
        </NeonCard>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <NeonCard glow="cyan" className="p-4">
          <div className="text-white/50 text-xs uppercase tracking-wider">Accounts per payout</div>
          <div className="text-2xl font-bold text-cyan-200 mt-1">
            {stats.accountsPerPayout !== null ? stats.accountsPerPayout.toFixed(2) : '—'}
          </div>
          <div className="text-white/50 text-xs mt-1">
            {stats.accountsThatPaid} of {stats.accountsBought} accounts ever paid
          </div>
        </NeonCard>

        <NeonCard glow="amber" className="p-4">
          <div className="text-white/50 text-xs uppercase tracking-wider">Cost per payout</div>
          <div className="text-2xl font-bold text-amber-200 mt-1">{money(stats.costPerPayout)}</div>
          <div className="text-white/50 text-xs mt-1">what one payout costs to produce</div>
        </NeonCard>

        <NeonCard glow="purple" className="p-4">
          <div className="text-white/50 text-xs uppercase tracking-wider">Net per account</div>
          <div className={`text-2xl font-bold mt-1 ${netTone}`}>{money(stats.netPerAccount)}</div>
          <div className="text-white/50 text-xs mt-1">
            {stats.stillToBreakEven > 0
              ? `${money(stats.stillToBreakEven)} to break even`
              : `average across all ${stats.accountsBought} accounts`}
          </div>
        </NeonCard>

        <NeonCard glow="pink" className="p-4">
          <div className="text-white/50 text-xs uppercase tracking-wider">Top account</div>
          <div className="text-2xl font-bold text-pink-200 mt-1">
            {stats.topAccount ? money(stats.topAccount.claimed) : '—'}
          </div>
          <div className="text-white/50 text-xs mt-1">
            {stats.topAccount
              ? `${accountLabel(stats.topAccount.nickname)} · most payouts (${stats.topAccount.payouts})`
              : 'no payouts yet'}
          </div>
        </NeonCard>
      </div>

      {/* ── active accounts ──────────────────────────────────────────────── */}
      <div>
        <h3 className="text-lg font-semibold text-white/90 mb-3">
          Active accounts
          {activeAccounts.length > 0 && <span className="text-white/40 text-sm font-normal"> · {activeAccounts.length}</span>}
        </h3>
        {accounts.length === 0 ? (
          <div className="rounded-xl border border-white/10 bg-white/5 p-8 text-center text-white/50">
            No instant accounts yet. Use <span className="text-emerald-300">+ Buy accounts</span> to add your first batch.
          </div>
        ) : activeAccounts.length === 0 ? (
          <div className="rounded-xl border border-white/10 bg-white/5 p-6 text-center text-white/50">
            Nothing live right now — every account is closed. Buy a batch to get back in.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {activeAccounts.map((a) => (
              <AccountCard
                key={a.id}
                a={a}
                busy={busy}
                confirming={confirmDeleteId === a.id}
                onClaim={(acct) => {
                  setClaimFor(acct);
                  setClaimAmount('');
                  setClaimDate(today());
                }}
                onEdit={openEdit}
                onSetStatus={setStatus}
                onRequestDelete={setConfirmDeleteId}
                onConfirmDelete={removeAccount}
                onCancelDelete={() => setConfirmDeleteId(null)}
              />
            ))}
          </div>
        )}
      </div>

      {/* ── P&L cards — the SAME card the dashboard renders ──────────────── */}
      {accounts.length > 0 && (
        <div>
          <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
            <div>
              <h3 className="text-lg font-semibold text-white/90">
                {period === 'monthly' ? 'Monthly' : 'Weekly'} P&amp;L
              </h3>
              <div className="text-white/45 text-xs">
                after costs · every account bought in the {period === 'monthly' ? 'month' : 'week'}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className="inline-flex bg-white/5 border border-white/10 rounded-md p-1 text-xs">
                <button
                  onClick={() => setPeriod('monthly')}
                  className={`px-2 py-1 rounded ${period === 'monthly' ? 'bg-white/10 text-white' : 'text-white/70 hover:text-white'}`}
                >
                  Monthly
                </button>
                <button
                  onClick={() => setPeriod('weekly')}
                  className={`px-2 py-1 rounded ${period === 'weekly' ? 'bg-white/10 text-white' : 'text-white/70 hover:text-white'}`}
                >
                  Weekly
                </button>
              </div>
              <div className="inline-flex bg-white/5 border border-white/10 rounded-md p-1 text-xs">
                <button
                  onClick={() => setPeriodCount(6)}
                  className={`px-2 py-1 rounded ${periodCount === 6 ? 'bg-white/10 text-white' : 'text-white/70 hover:text-white'}`}
                >
                  6
                </button>
                <button
                  onClick={() => setPeriodCount(12)}
                  className={`px-2 py-1 rounded ${periodCount === 12 ? 'bg-white/10 text-white' : 'text-white/70 hover:text-white'}`}
                >
                  12
                </button>
                <button
                  onClick={() => setPeriodCount('all')}
                  className={`px-2 py-1 rounded ${periodCount === 'all' ? 'bg-white/10 text-white' : 'text-white/70 hover:text-white'}`}
                >
                  All
                </button>
              </div>
            </div>
          </div>

          {visiblePeriods.length === 0 ? (
            <div className="rounded-xl border border-white/10 bg-white/5 p-6 text-center text-white/50 text-sm">
              No period rows came back from the API. On the dev server that means the mock needs a
              restart; on live it means the deploy predates this tab.
            </div>
          ) : (
            <div className="min-h-[200px] py-2">
              {/* Same grid classes as the dashboard's card view, so the cards land identically. */}
              <div className={`grid gap-4 ${
                isMobile
                  ? 'grid-cols-1 sm:grid-cols-2 gap-4'
                  : 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6'
              }`}>
                {visiblePeriods.map((row) => (
                  <PnLPeriodCard
                    key={row.key}
                    isMobile={isMobile}
                    item={{ period: row.key, displayPeriod: row.main, costs: row.cost, payouts: row.claimed }}
                  />
                ))}
              </div>
            </div>
          )}

          {failedAccounts.length > 0 && (
            <>
              <button
                onClick={() => setShowFailed((v) => !v)}
                className="mt-3 rounded-md border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white/50 hover:text-white"
              >
                {showFailed ? '▾ Hide' : '▸ Show'} the {failedAccounts.length} closed accounts
                <span className="text-white/30"> (to revive or delete one)</span>
              </button>

              {showFailed && (
                <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {failedAccounts.map((a) => (
                    <AccountCard
                      key={a.id}
                      a={a}
                      busy={busy}
                      confirming={confirmDeleteId === a.id}
                      onClaim={(acct) => {
                        setClaimFor(acct);
                        setClaimAmount('');
                        setClaimDate(today());
                      }}
                      onEdit={openEdit}
                      onSetStatus={setStatus}
                      onRequestDelete={setConfirmDeleteId}
                      onConfirmDelete={removeAccount}
                      onCancelDelete={() => setConfirmDeleteId(null)}
                    />
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ── claim history ────────────────────────────────────────────────── */}
      {claims.length > 0 && (
        <div>
          <h3 className="text-lg font-semibold text-white/90 mb-3">Payout history</h3>
          <div className="rounded-xl border border-white/10 bg-white/5 divide-y divide-white/5">
            {claims.map((cl) => (
              <div key={cl.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                <div className="flex items-center gap-3">
                  <span className="text-white/80 font-semibold">{accountLabel(cl.nickname)}</span>
                  <span className="text-white/40">{cl.claimedAt}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-green-300 font-semibold">{money(cl.amount)}</span>
                  {/* Fix a mistyped amount, or remove a payout that never happened. */}
                  <button
                    disabled={busy}
                    onClick={() => openClaimEdit(cl)}
                    title="Edit this payout"
                    className="rounded-md border border-white/15 px-2 py-1 text-xs text-white/60 hover:text-white disabled:opacity-40"
                  >
                    Edit
                  </button>
                  {confirmClaimDeleteId === cl.id ? (
                    <span className="flex items-center gap-2">
                      <button
                        disabled={busy}
                        onClick={() => removeClaim(cl.id)}
                        className="rounded-md border border-red-500 bg-red-500/25 px-2 py-1 text-xs font-semibold text-red-100 disabled:opacity-40"
                      >
                        Delete?
                      </button>
                      <button
                        onClick={() => setConfirmClaimDeleteId(null)}
                        className="text-xs text-white/50 hover:text-white"
                      >
                        Cancel
                      </button>
                    </span>
                  ) : (
                    <button
                      onClick={() => setConfirmClaimDeleteId(cl.id)}
                      title="Delete this payout"
                      className="rounded-md border border-white/10 px-2 py-1 text-xs text-white/40 hover:text-red-300"
                    >
                      ✕
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── buy modal ────────────────────────────────────────────────────── */}
      {showBuy && (
        <Modal title="Buy instant accounts" onClose={() => setShowBuy(false)}>
          <div className="space-y-4">
            <div>
              <label className="block text-white/60 text-xs uppercase tracking-wider mb-2">Account size</label>
              <div className="flex flex-wrap gap-2">
                {VEST_SIZES.map((v) => (
                  <button
                    key={v.size}
                    onClick={() => {
                      setBuySize(v.size);
                      setBuyCost(v.cost);
                    }}
                    className={`rounded-md border px-3 py-2 text-sm ${
                      buySize === v.size
                        ? 'border-emerald-400/60 bg-emerald-400/20 text-emerald-100'
                        : 'border-white/15 text-white/70 hover:bg-white/10'
                    }`}
                  >
                    {v.label} · {money(v.cost)}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Field label="How many">
                <input
                  type="number"
                  min={1}
                  max={50}
                  value={buyCount}
                  onChange={(e) => setBuyCount(Number(e.target.value))}
                  className="w-full rounded-md border border-white/15 bg-black/30 px-3 py-2 text-white"
                />
              </Field>
              <Field label="Price each">
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={buyCost}
                  onChange={(e) => setBuyCost(Number(e.target.value))}
                  className="w-full rounded-md border border-white/15 bg-black/30 px-3 py-2 text-white"
                />
              </Field>
              <Field label="Date">
                <input
                  type="date"
                  value={buyDate}
                  onChange={(e) => setBuyDate(e.target.value)}
                  className="w-full rounded-md border border-white/15 bg-black/30 px-3 py-2 text-white"
                />
              </Field>
              <Field label="Paid with">
                <select
                  value={buyFunding}
                  onChange={(e) => setBuyFunding(e.target.value)}
                  className="w-full rounded-md border border-white/15 bg-black/30 px-3 py-2 text-white"
                >
                  <option value="card">card</option>
                  <option value="crypto">crypto</option>
                  <option value="credit">credit</option>
                </select>
              </Field>
            </div>

            <div className="rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-xs text-white/60">
              {buyCount} × {money(buyCost)} ={' '}
              <span className="text-white/90 font-semibold">{money(buyCount * buyCost)}</span> spent.
              Remember this is sunk — the price is the drawdown, and it never comes back.
            </div>

            <div className="flex justify-end gap-2">
              <button onClick={() => setShowBuy(false)} className="rounded-md border border-white/15 px-4 py-2 text-sm text-white/70">
                Cancel
              </button>
              <button
                disabled={busy || buyCount < 1 || buyCount > 50 || !(buyCost > 0)}
                onClick={submitBuy}
                className="rounded-md border border-emerald-400/50 bg-emerald-400/20 px-4 py-2 text-sm font-semibold text-emerald-100 disabled:opacity-40"
              >
                {busy ? 'Saving…' : `Buy ${buyCount}`}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* ── claim modal (log OR fix a payout) ────────────────────────────── */}
      {(claimFor || editClaim) && (
        <Modal
          title={`${editClaim ? 'Edit payout' : 'Claim'} · ${claimTargetName}`}
          onClose={() => {
            setClaimFor(null);
            setEditClaim(null);
          }}
        >
          <div className="space-y-4">
            <Field label="Amount received (after the 95% split)">
              <input
                type="number"
                min={0}
                step="0.01"
                autoFocus
                value={claimAmount}
                onChange={(e) => setClaimAmount(e.target.value)}
                className="w-full rounded-md border border-white/15 bg-black/30 px-3 py-2 text-white"
              />
            </Field>
            <Field label="Date">
              <input
                type="date"
                value={claimDate}
                onChange={(e) => setClaimDate(e.target.value)}
                className="w-full rounded-md border border-white/15 bg-black/30 px-3 py-2 text-white"
              />
            </Field>
            <div className="rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-xs text-white/60">
              Enter what Vest actually credits you — post-split. A pre-split figure inflates
              every number on this tab by about 5%. Claims credit to the Primary Account
              after 24 hours.
            </div>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => {
                  setClaimFor(null);
                  setEditClaim(null);
                }}
                className="rounded-md border border-white/15 px-4 py-2 text-sm text-white/70"
              >
                Cancel
              </button>
              <button
                disabled={busy || !(Number(claimAmount) > 0)}
                onClick={submitClaim}
                className="rounded-md border border-green-400/50 bg-green-400/20 px-4 py-2 text-sm font-semibold text-green-100 disabled:opacity-40"
              >
                {busy ? 'Saving…' : editClaim ? 'Save changes' : 'Log claim'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* ── edit account modal ───────────────────────────────────────────── */}
      {editFor && (
        <Modal title={`Edit ${accountLabel(editFor.nickname)}`} onClose={() => setEditFor(null)}>
          <div className="space-y-4">
            <div>
              <label className="block text-white/60 text-xs uppercase tracking-wider mb-2">Account size</label>
              <div className="flex flex-wrap gap-2">
                {VEST_SIZES.map((v) => (
                  <button
                    key={v.size}
                    onClick={() => setEditSize(v.size)}
                    className={`rounded-md border px-3 py-2 text-sm ${
                      editSize === v.size
                        ? 'border-emerald-400/60 bg-emerald-400/20 text-emerald-100'
                        : 'border-white/15 text-white/70 hover:bg-white/10'
                    }`}
                  >
                    {v.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Price paid">
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={editCost}
                  onChange={(e) => setEditCost(Number(e.target.value))}
                  className="w-full rounded-md border border-white/15 bg-black/30 px-3 py-2 text-white"
                />
              </Field>
              <Field label="Bought on">
                <input
                  type="date"
                  value={editDate}
                  onChange={(e) => setEditDate(e.target.value)}
                  className="w-full rounded-md border border-white/15 bg-black/30 px-3 py-2 text-white"
                />
              </Field>
              <Field label="Paid with">
                <select
                  value={editFunding}
                  onChange={(e) => setEditFunding(e.target.value)}
                  className="w-full rounded-md border border-white/15 bg-black/30 px-3 py-2 text-white"
                >
                  <option value="card">card</option>
                  <option value="crypto">crypto</option>
                  <option value="credit">credit</option>
                </select>
              </Field>
              <Field label="Note">
                <input
                  type="text"
                  value={editNotes}
                  onChange={(e) => setEditNotes(e.target.value)}
                  placeholder="optional"
                  className="w-full rounded-md border border-white/15 bg-black/30 px-3 py-2 text-white"
                />
              </Field>
            </div>

            <div className="rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-xs text-white/60">
              Moving the <span className="text-white/90">bought on</span> date moves this account into
              that week/month on the P&amp;L cards; changing the price changes the cost, the net and the
              break-even. Nothing else needs recalculating — every figure is derived on read.
            </div>

            <div className="flex justify-end gap-2">
              <button
                onClick={() => setEditFor(null)}
                className="rounded-md border border-white/15 px-4 py-2 text-sm text-white/70"
              >
                Cancel
              </button>
              <button
                disabled={busy || !(Number(editCost) > 0)}
                onClick={submitEdit}
                className="rounded-md border border-emerald-400/50 bg-emerald-400/20 px-4 py-2 text-sm font-semibold text-emerald-100 disabled:opacity-40"
              >
                {busy ? 'Saving…' : 'Save changes'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};

// ── small local presentational helpers ───────────────────────────────────────

/**
 * One account card. The SAME markup serves a live account and one in the
 * expanded failed list — the only difference is where it is rendered, which is
 * what keeps "hide the failed cards" from also hiding the only route to Revive
 * or Delete on a card that was closed by mistake.
 */
const AccountCard: React.FC<{
  a: InstantAccount;
  busy: boolean;
  confirming: boolean;
  onClaim: (a: InstantAccount) => void;
  onEdit: (a: InstantAccount) => void;
  onSetStatus: (a: InstantAccount, status: 'alive' | 'dead') => void;
  onRequestDelete: (id: string) => void;
  onConfirmDelete: (id: string) => void;
  onCancelDelete: () => void;
}> = ({ a, busy, confirming, onClaim, onEdit, onSetStatus, onRequestDelete, onConfirmDelete, onCancelDelete }) => (
  <div
    className={`rounded-xl border p-4 backdrop-blur ${
      a.status === 'dead' ? 'border-red-500/30 bg-red-950/20' : 'border-emerald-400/25 bg-white/5'
    }`}
  >
    <div className="flex items-start justify-between gap-2">
      <div>
        <div className="text-white font-bold text-lg leading-tight">{accountLabel(a.nickname)}</div>
        <div className="text-white/50 text-xs">
          {money(a.accountSize)} · paid {money(a.cost)}
        </div>
      </div>
      <span
        className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
          a.status === 'dead' ? 'bg-red-500/20 text-red-300' : 'bg-emerald-400/20 text-emerald-300'
        }`}
      >
        {a.status}
      </span>
    </div>

    <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
      <div>
        <div className="text-white/40 text-[10px] uppercase tracking-wider">Claimed</div>
        <div className="text-green-300 font-semibold">{money(a.claimed)}</div>
      </div>
      <div title="Claims minus the price paid. The price is 100% sunk, so a brand-new account reads negative until it claims.">
        <div className="text-white/40 text-[10px] uppercase tracking-wider">Net</div>
        <div className={`font-semibold ${a.pnl > 0 ? 'text-green-300' : a.pnl < 0 ? 'text-red-300' : 'text-white/60'}`}>
          {money(a.pnl)}
        </div>
      </div>
    </div>

    <div className="mt-2 text-white/40 text-xs">
      bought {a.purchasedAt}
      {a.diedAt ? ` · died ${a.diedAt}` : ''}
      {a.lifespanDays !== null ? ` (${a.lifespanDays}d)` : ''}
      {a.claimCount > 1 ? ` · ${a.claimCount} claims` : ''}
      {a.fundingSource ? ` · ${a.fundingSource}` : ''}
      {a.notes ? ` · ${a.notes}` : ''}
    </div>

    <div className="mt-3 flex flex-wrap gap-2">
      <button
        disabled={busy}
        onClick={() => onClaim(a)}
        className="rounded-md border border-green-400/40 bg-green-400/10 px-3 py-1.5 text-xs font-semibold text-green-200 hover:bg-green-400/20 disabled:opacity-40"
      >
        Log claim
      </button>
      <button
        disabled={busy}
        onClick={() => onEdit(a)}
        className="rounded-md border border-white/20 px-3 py-1.5 text-xs font-semibold text-white/70 hover:bg-white/10 disabled:opacity-40"
      >
        Edit
      </button>
      {a.status === 'alive' ? (
        <button
          disabled={busy}
          onClick={() => onSetStatus(a, 'dead')}
          className="rounded-md border border-red-400/40 bg-red-400/10 px-3 py-1.5 text-xs font-semibold text-red-200 hover:bg-red-400/20 disabled:opacity-40"
        >
          Mark dead
        </button>
      ) : (
        <button
          disabled={busy}
          onClick={() => onSetStatus(a, 'alive')}
          className="rounded-md border border-white/20 px-3 py-1.5 text-xs font-semibold text-white/70 hover:bg-white/10 disabled:opacity-40"
        >
          Revive
        </button>
      )}
      {confirming ? (
        <>
          <button
            disabled={busy}
            onClick={() => onConfirmDelete(a.id)}
            className="rounded-md border border-red-500 bg-red-500/25 px-3 py-1.5 text-xs font-semibold text-red-100 disabled:opacity-40"
          >
            Delete?
          </button>
          <button
            onClick={onCancelDelete}
            className="rounded-md border border-white/20 px-3 py-1.5 text-xs text-white/60"
          >
            Cancel
          </button>
        </>
      ) : (
        <button
          onClick={() => onRequestDelete(a.id)}
          className="rounded-md border border-white/10 px-2 py-1.5 text-xs text-white/40 hover:text-red-300"
        >
          ✕
        </button>
      )}
    </div>
  </div>
);


const Field: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div>
    <label className="block text-white/60 text-xs uppercase tracking-wider mb-1">{label}</label>
    {children}
  </div>
);

const Modal: React.FC<{ title: string; onClose: () => void; children: React.ReactNode }> = ({
  title,
  onClose,
  children,
}) => (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
    <div
      className="w-full max-w-lg rounded-2xl border border-white/15 bg-[#0d0d12] p-5 shadow-2xl"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-xl font-bold text-white">{title}</h3>
        <button onClick={onClose} className="text-white/50 hover:text-white text-xl leading-none">
          ✕
        </button>
      </div>
      {children}
    </div>
  </div>
);

export default InstantTab;
