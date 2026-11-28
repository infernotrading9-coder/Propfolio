import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { X, Gamepad2, Loader2, Play, ArrowLeftRight } from 'lucide-react';
import { CoinTower } from './CoinTower';

/**
 * Game Mode — the whole page becomes the climb.
 *
 * Daniel: "I want to keep all these tabs but I want to have a mode to switch into … it could be
 * game mode … we can have two of them under different tabs, one from personal trading and one for
 * prop trading, so I can gamify my experience with trading."
 *
 * So this is a MODE, not a tab: the tabs all stay exactly as they are, and this is a full-screen
 * overlay you step into and back out of. Nothing is duplicated or moved — it reads the same data
 * the tabs do and shows it as a tower.
 *
 * ONE TOWER AT A TIME, filling the page, with an ARCADE SWITCH between the two. Daniel: "i want it
 * cover the whole page, and just 1 either the personal or firm i would like to press an arcade
 * button where it switches between either or." Two cards side by side made both towers small;
 * one tower at full size is the game he actually wanted. The choice persists, so the mode always
 * opens on whichever climb he was last looking at.
 *
 * THE TOWER IS ONE COMPACTING COLUMN (Nov 28 2026). Daniel: *"we just have one tower right no
 * nothing side to side anymore … simple goal is 10 coins and then when i hit 10 coins some cool
 * animation comes out and the coin turns bigger and changes color maybe purple titanium … and then
 * the other gold coins start to stack on top of those so every metallic wide coin is a thousand."*
 * Ten $100 coins forge into one purple-titanium ingot worth $1,000; the next ten start above it.
 * Going back under a milestone splits the ingot into its ten coins again. Only ONE climb is on
 * screen at a time — see CoinTower for the geometry.
 *
 * The two towers:
 *
 *  1. PERSONAL — the NinjaTrader account balance, in $100 coins, with the all-time high drawn as
 *     a permanent gold rule so a losing day cannot erase the evidence that he got there.
 *
 *  2. PROP — NET PnL in dollars (`payouts − costs`), on the same $100 coin and $1,000 ingot as the
 *     personal side. Daniel: *"for the firm one, it should measure pnl not evals, so it should
 *     track ROI"* … then *"Also for the prop side I want it in $ instead"*.
 *
 *     Why NET and not the firms' nominal sizes or eval passes: a prop firm's nominal account size
 *     is not money he has, and an eval passed is not money either — a "pass rate" tower would
 *     celebrate the thing that has cost him the most and earned him the least. What is actually
 *     true is `payouts − costs`: what the firms have paid him minus what he paid them.
 *
 *     The TARGET is the ROI goal converted to dollars (`spend × roiTarget/100`) — at the default
 *     100% that is exactly what he has paid the firms, so filling every ingot means earning back
 *     every dollar they took. Switching the unit from percent to dollars changed nothing about his
 *     progress: PnL ÷ spend IS ROI, so the same number is simply read out in $.
 *
 *     COSTS = Σ challenge.cost (what he spent on evals), PAYOUTS = Σ payouts[].amount (what was
 *     actually claimed). Both are read exactly as `PnLChart` and `PnLPeriodCard` read them, so this
 *     tower cannot disagree with the dashboard's P&L card about the same money.
 */

const STATE_API = '/.netlify/functions/db-state';
const TRADES_API = '/.netlify/functions/db-personal-trades';
const NOTES_API = '/.netlify/functions/db-notes';

const BALANCE_MARKER = /\[balance\b[^\]]*\]/i;
/**
 * A note whose body carries this sets the prop ROI target, e.g. `[roi 250]` to aim at 250%.
 * Read from the MARKER rather than the title, because the title parser here is money-shaped
 * (`$50,000`) and an ROI target is a percentage — parsing it as dollars would silently make the
 * target $250,000,000.
 */
const ROI_MARKER = /\[roi\b([^\]]*)\]/i;

const DEFAULT_PERSONAL_TARGET = 50_000;
/** Only used before any money has gone to a firm, so the tower has a scale to draw. */
const DEFAULT_PROP_TARGET = 10_000;
const DEFAULT_ROI_TARGET = 100;
const DEFAULT_UNIT = 100;

/** Which climb he was last looking at — the mode should open where he left it. */
const TOWER_KEY = 'pf-game-tower';
type TowerKey = 'personal' | 'prop';

const money = (n: number): string =>
  '$' + n.toLocaleString('en-US', { maximumFractionDigits: 0 });

const pct = (n: number): string => (n < 0 ? '\u2212' : '') + `${Math.abs(Math.round(n))}%`;

/** PnL is signed — a losing book has to read −$3,213, not $3,213. */
const signedMoney = (n: number): string => (n < 0 ? '\u2212' : '+') + money(Math.abs(n));

function moneyFromTitle(title: string): number | null {
  const m = title.match(/\$\s?(\d[\d,]*(?:\.\d+)?)\s*([kK])?/);
  if (!m) return null;
  const n = parseFloat(m[1].replace(/,/g, ''));
  if (!isFinite(n)) return null;
  return m[2] ? n * 1000 : n;
}

/** `unit:$100` out of a marker, else the default. */
function unitFromBody(body: string | null | undefined): number {
  const m = (body || '').match(/unit:\s*\$?\s*([\d,]+)/i);
  const v = m ? parseFloat(m[1].replace(/,/g, '')) : NaN;
  return Number.isFinite(v) && v > 0 ? v : DEFAULT_UNIT;
}

/** The ROI target out of `[roi]` / `[roi 250]`, else the default. */
function roiTargetFromBody(body: string | null | undefined): number {
  const m = (body || '').match(ROI_MARKER);
  if (!m) return DEFAULT_ROI_TARGET;
  const v = parseFloat(String(m[1] || '').replace(/[^\d.]/g, ''));
  return Number.isFinite(v) && v > 0 ? v : DEFAULT_ROI_TARGET;
}

/** Anything a challenge stores for payouts — an array, or a bare number on older rows. */
function payoutsOf(c: any): { date: string; amount: number }[] {
  if (Array.isArray(c?.payouts)) {
    return c.payouts.map((p: any) => ({
      date: String(p?.date || c?.startDate || ''),
      amount: Number(p?.amount) || 0,
    }));
  }
  if (typeof c?.payouts === 'number') {
    return [{ date: String(c?.startDate || ''), amount: c.payouts }];
  }
  return [];
}

/**
 * The prop book: what was spent, what was claimed, the net, and the ROI.
 *
 * PnL is `payouts − costs`, deliberately the same arithmetic as PnLPeriodCard's
 * `pnl = item.payouts - item.costs` — two different definitions of "net" on the same
 * money is how a dashboard ends up contradicting itself.
 */
export function propBook(challenges: any[]) {
  let cost = 0;
  let paid = 0;
  for (const c of challenges || []) {
    cost += Number(c?.cost) || 0;
    for (const p of payoutsOf(c)) paid += p.amount;
  }
  const pnl = paid - cost;
  return { cost, paid, pnl, roi: cost > 0 ? (pnl / cost) * 100 : 0 };
}

/**
 * Best-ever NET PROFIT from the firms, in dollars, walked along the real timeline of money in
 * and out.
 *
 * Derived rather than stored, and it CAN be derived exactly — unlike the personal balance, which
 * needs a column because a deposit is invisible to a trade ledger. On the prop side every dollar
 * is either a known cost (dated by the challenge's start) or a known payout (dated by the
 * payout), so the whole path is reconstructible and the peak of it is the true record.
 *
 * Dollars rather than percent because Daniel asked for the prop tower "in $" — and it costs
 * nothing, since ROI is just this divided by the spend at the same point in time.
 *
 * ISO dates sort lexically, so no Date parsing (and no timezone shift) is involved.
 */
export function peakPnl(challenges: any[]): number {
  const events: { d: string; cost: number; paid: number }[] = [];
  for (const c of challenges || []) {
    events.push({ d: String(c?.startDate || ''), cost: Number(c?.cost) || 0, paid: 0 });
    for (const p of payoutsOf(c)) events.push({ d: p.date, cost: 0, paid: p.amount });
  }
  events.sort((a, b) => a.d.localeCompare(b.d));
  let cost = 0;
  let paid = 0;
  let best = 0;
  for (const e of events) {
    cost += e.cost;
    paid += e.paid;
    best = Math.max(best, paid - cost);
  }
  return best;
}

interface TowerSpec {
  key: TowerKey;
  label: string;
  sub: string;
  /** The truth, unclamped — a losing prop book really is negative and the readout must say so. */
  value: number;
  target: number;
  unit: number;
  peak: number | null;
  /** How the tower's coins are labelled. Also used for the level-up banner. */
  formatValue: (n: number) => string;
  /**
   * The big number, which is NOT always the coin label: the prop tower's coins read "9% → 10%"
   * but a headline of "23%" beside "of 100% ROI" is ambiguous, so the headline says "23% ROI".
   */
  headlineFormat: (n: number) => string;
  notch: number;
  bigNotch: number;
  /** One tower = one milestone, so the label under it needs its own formatter. */
  formatMilestone: (n: number) => string;
  /** Optional extra readout under the tower. */
  detail?: string;
}

export const GameMode: React.FC<{
  onExit: () => void;
  /**
   * Drop straight into the trading cockpit from inside the game. `propMode: true` starts a
   * prop-firm session, false a personal one — matching the Dashboard's own two buttons, whose
   * prop path also POSTs `enter_cockpit`.
   */
  onStartSession?: (propMode: boolean) => void;
}> = ({ onExit, onStartSession }) => {
  const [loading, setLoading] = useState(true);
  const [notes, setNotes] = useState<any[]>([]);
  const [challenges, setChallenges] = useState<any[]>([]);
  const [personalBalance, setPersonalBalance] = useState<number | null>(null);
  const [personalPeak, setPersonalPeak] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  /** Which tower is on screen. Remembered, because the mode should reopen where he left it. */
  const [active, setActive] = useState<TowerKey>(() => {
    try { return localStorage.getItem(TOWER_KEY) === 'prop' ? 'prop' : 'personal'; } catch { return 'personal'; }
  });
  const show = useCallback((k: TowerKey) => {
    setActive(k);
    try { localStorage.setItem(TOWER_KEY, k); } catch { /* private mode */ }
  }, []);

  /**
   * DEV ONLY. A per-tower local offset so the animation can be played with before the real feed
   * moves. Kept per tower so the prop tower can be exercised without disturbing the personal one.
   */
  const [devDeltas, setDevDeltas] = useState<Record<string, number>>({});
  const devManual = useRef(false);

  const getAuthHeaders = useCallback(() => {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    try {
      const raw = localStorage.getItem('user');
      if (raw) {
        const u = JSON.parse(raw);
        if (u?.id) headers['X-User-Id'] = String(u.id);
        if (u?.email) headers['X-User-Email'] = String(u.email);
        if (u?.name) headers['X-User-Name'] = String(u.name);
      }
    } catch { /* not signed in */ }
    return headers;
  }, []);

  const load = useCallback(async () => {
    const h = getAuthHeaders();
    const grab = async (url: string) => {
      try {
        const res = await fetch(url, { headers: h });
        return res.ok ? await res.json() : null;
      } catch {
        return null;   // one dead source must not blank the whole mode
      }
    };
    const [state, trades, planNotes] = await Promise.all([
      grab(STATE_API),
      grab(`${TRADES_API}?action=stats`),
      grab(`${NOTES_API}?action=list-notes`),
    ]);
    if (state?.challenges) setChallenges(state.challenges);
    const b = trades?.stats?.balance;
    if (typeof b === 'number' && Number.isFinite(b)) setPersonalBalance(b);
    // The all-time high comes off the same row (migration 70). Absent until the balance feed has
    // pushed once, and the tower then just draws no record line.
    const pk = trades?.stats?.peakBalance;
    if (typeof pk === 'number' && Number.isFinite(pk)) setPersonalPeak(pk);
    if (Array.isArray(planNotes?.notes)) setNotes(planNotes.notes);
    if (!state && !trades) setError('Could not reach your accounts — showing what loaded.');
    setLoading(false);
  }, [getAuthHeaders]);

  useEffect(() => { void load(); }, [load]);

  // Re-pull on a timer: the coin animation fires on the CHANGE in coins held, so a one-shot fetch
  // could never play it, and a game mode you leave open should stay live.
  useEffect(() => {
    const t = window.setInterval(() => { if (!devManual.current) void load(); }, 60_000);
    return () => window.clearInterval(t);
  }, [load]);

  /**
   * Lock the page behind. The mode is `fixed inset-0` so it covers the viewport regardless, but
   * without this the dashboard underneath still scrolls — and a live scrollbar down the right edge
   * of a full-screen game is exactly what stops it feeling like one.
   */
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  /** Escape gets you out — a full-screen mode with only a small X is a trap. */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onExit();
      // Tab flips the tower, for when the mouse is nowhere near the switch.
      if (e.key === 'Tab') { e.preventDefault(); show(active === 'personal' ? 'prop' : 'personal'); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onExit, show, active]);

  /** The goal notes that carry the targets, so both towers stay editable from the tabs. */
  const personalGoal = useMemo(
    () => notes.find((n) => BALANCE_MARKER.test(n.body || '') && (moneyFromTitle(n.title) ?? 0) > 0) ?? null,
    [notes],
  );
  const roiGoal = useMemo(
    () => notes.find((n) => ROI_MARKER.test(n.body || '')) ?? null,
    [notes],
  );

  const towers: TowerSpec[] = useMemo(() => {
    const book = propBook(challenges);

    return [
      {
        key: 'personal',
        label: 'Personal',
        sub: 'Account balance',
        value: personalBalance ?? 0,
        target: personalGoal ? moneyFromTitle(personalGoal.title) ?? DEFAULT_PERSONAL_TARGET : DEFAULT_PERSONAL_TARGET,
        unit: personalGoal ? unitFromBody(personalGoal.body) : DEFAULT_UNIT,
        peak: personalPeak,
        formatValue: money,
        headlineFormat: money,
        // The tier ladder: a $1,000 ingot is the notch, a $10,000 bar is the ★ award. They match
        // CoinTower's TIERS exactly — a notch that does not line up with a forge would celebrate a
        // moment that has no piece to show for it.
        notch: 1000,
        bigNotch: 10000,
        formatMilestone: money,
      },
      {
        key: 'prop',
        label: 'Prop',
        sub: 'Net P&L from the firms',
        value: book.pnl,
        /*
         * IN DOLLARS, at Daniel's request ("for the prop side I want it in $ instead"). One coin
         * is $100 and ten coins a tower — exactly the personal side — so a prop tower is a $1,000
         * milestone too.
         *
         * THE TARGET is the ROI goal converted: `spend x roiTarget/100`. At the default 100% that
         * is simply what he has paid the firms, which is the honest prop goal — fill every tower
         * and he has earned back every dollar they took. It also means progress is unchanged from
         * when this tower tracked ROI, because PnL/spend IS ROI. The `[roi 250]` marker still
         * means "aim for 250%", it just now reads out as its dollar equivalent.
         */
        target: book.cost > 0
          ? book.cost * ((roiGoal ? roiTargetFromBody(roiGoal.body) : DEFAULT_ROI_TARGET) / 100)
          : DEFAULT_PROP_TARGET,
        unit: DEFAULT_UNIT,
        peak: Math.max(peakPnl(challenges), book.pnl),
        formatValue: money,
        formatMilestone: money,
        headlineFormat: signedMoney,
        notch: 1000,
        bigNotch: 10000,
        detail: book.cost > 0
          ? `${money(book.paid)} paid − ${money(book.cost)} spent · ${pct(book.roi)} ROI · break-even at $0`
          : 'No money spent with the firms yet — the tower starts at the first eval.',
      },
    ];
  }, [challenges, personalBalance, personalPeak, personalGoal, roiGoal]);

  const tower = towers.find((t) => t.key === active) ?? towers[0];
  const other = active === 'personal' ? 'Prop' : 'Personal';

  // `value` is the truth and drives the digits; `current` is only what the tower can draw, since
  // coins cannot go below empty.
  const value = tower.value + (devDeltas[tower.key] ?? 0);
  const current = Math.max(0, value);
  const held = Math.floor(current / tower.unit);
  const totalCoins = Math.ceil(tower.target / tower.unit);
  const pctOfTarget = Math.max(0, Math.min(100, Math.round((value / tower.target) * 100)));

  return (
    <div
      className="fixed inset-0 z-[80] flex flex-col overflow-hidden"
      style={{
        background:
          'radial-gradient(ellipse 120% 80% at 50% -10%, #1a1206 0%, #07090d 45%, #04060a 100%)',
      }}
      role="dialog"
      aria-label="Game mode"
    >
      {/* Keyframes for the switch. Namespaced, so they cannot collide with the Dashboard's
          own `.pf-arcade` FAB styles even though both are on screen. */}
      <style>{`
@keyframes pfGmGlow {
  0%, 100% { box-shadow: 0 4px 0 #78350f, 0 6px 20px rgba(251,191,36,0.40), inset 0 -2px 4px rgba(0,0,0,0.28), inset 0 2px 4px rgba(255,255,255,0.3); }
  50%      { box-shadow: 0 4px 0 #78350f, 0 6px 32px rgba(251,191,36,0.9), 0 0 40px rgba(251,191,36,0.5), inset 0 -2px 4px rgba(0,0,0,0.28), inset 0 2px 4px rgba(255,255,255,0.3); }
}
@keyframes pfGmSpin { 0% { filter: hue-rotate(0deg); } 100% { filter: hue-rotate(360deg); } }
.pf-gm-arcade { animation: pfGmSpin 9s linear infinite, pfGmGlow 2.4s ease-in-out infinite; }
@media (prefers-reduced-motion: reduce) { .pf-gm-arcade { animation: none !important; } }
`}</style>

      <div className="flex shrink-0 items-center justify-between gap-3 px-4 py-3 sm:px-6">
        <div className="flex items-center gap-2">
          <Gamepad2 className="h-5 w-5 text-amber-300" />
          <h1 className="text-sm font-black uppercase tracking-[0.2em] text-amber-200">Game Mode</h1>
        </div>

        {/*
          THE ARCADE SWITCH. Styled as the same cabinet as the Dashboard's arcade FABs — conic
          metallic face, chunky 3D edge, pulsing glow, slow hue drift — because it IS the same
          machine. Both labels are shown with the live one lit, so the button says where you are
          as well as where it takes you.
        */}
        <button
          onClick={() => show(active === 'personal' ? 'prop' : 'personal')}
          title={`Switch to the ${other} tower (or press Tab)`}
          aria-label={`Switch to the ${other} tower`}
          className="pf-gm-arcade relative flex items-center gap-2 rounded-full px-3 py-2 text-[11px] font-black uppercase tracking-wider text-amber-950 transition-transform duration-200 hover:scale-105 active:scale-95 sm:px-4"
          style={{
            background:
              'conic-gradient(from 210deg, #fde68a 0%, #f59e0b 18%, #ef4444 34%, #a855f7 52%, #3b82f6 68%, #22d3ee 84%, #fde68a 100%)',
            border: '2px solid rgba(255,255,255,0.5)',
            textShadow: '0 1px 0 rgba(255,255,255,0.45)',
          }}
        >
          <span className={active === 'personal' ? '' : 'opacity-45'}>Personal</span>
          <ArrowLeftRight className="h-3.5 w-3.5" />
          <span className={active === 'prop' ? '' : 'opacity-45'}>Prop</span>
        </button>

        <button
          onClick={onExit}
          title="Exit game mode (Esc)"
          className="flex shrink-0 items-center gap-1.5 rounded-lg border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-bold text-white/70 transition-colors hover:bg-white/10 hover:text-white"
        >
          <X className="h-3.5 w-3.5" /> Exit
        </button>
      </div>

      {loading ? (
        <div className="flex flex-1 items-center justify-center gap-2 text-sm text-white/40">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading your climb…
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col px-4 pb-4 sm:px-6 sm:pb-5">
          <div className="mx-auto flex min-h-0 w-full max-w-[1700px] flex-1 flex-col">
            <div className="mb-3 flex shrink-0 items-end justify-between gap-3">
              <div>
                <h2 className="text-2xl font-black tracking-tight text-amber-100 sm:text-3xl">{tower.label}</h2>
                <p className="text-[11px] uppercase tracking-wider text-white/35">{tower.sub}</p>
              </div>
              <div className="text-right">
                <div className="text-4xl font-black tabular-nums leading-none text-white sm:text-6xl">
                  {tower.headlineFormat(value)}
                </div>
                <div className="mt-1 text-xs text-white/45">
                  of {money(tower.target)} · {pctOfTarget}%
                </div>
              </div>
            </div>

            {/* The tower IS the page: it takes every pixel left between the readout and the
                footer, and `fill` sizes the coins to exactly that. The wrapper has to be a real
                flex-1/min-h-0 box or the card would size itself to its content and the tower
                would never grow — `fill` measures this space to decide the coin size. */}
            <div className="flex min-h-0 flex-1 flex-col">
              <CoinTower
                /*
                 * Keyed on the tower so switching REMOUNTS it. Without this the coin tower's
                 * "what did it used to be" refs survive the switch — so going Personal → Prop
                 * compares this tower's level against the other one's, decides it just levelled
                 * up, and fires the banner, the full-screen gold vignette and the chime. Every
                 * single time he flipped sides.
                 */
                key={tower.key}
                fill
                target={tower.target}
                unit={tower.unit}
                balance={current}
                peak={tower.peak}
                formatValue={tower.formatValue}
                formatMilestone={tower.formatMilestone}
                notch={tower.notch}
                bigNotch={tower.bigNotch}
                onNudge={import.meta.env.DEV ? (d) => {
                  devManual.current = true;
                  setDevDeltas((s) => ({ ...s, [tower.key]: (s[tower.key] ?? 0) + d }));
                } : undefined}
              />
            </div>

            <div className="mt-3 flex shrink-0 flex-wrap items-center justify-between gap-x-4 gap-y-2">
              <div className="min-w-0">
                <p className="text-[11px] text-white/30">
                  {held.toLocaleString()} / {totalCoins.toLocaleString()} coins · 1 coin ={' '}
                  {tower.formatValue(tower.unit)}
                </p>
                {tower.detail && <p className="mt-0.5 text-[11px] text-white/25">{tower.detail}</p>}
              </div>

              {/*
                The loop back into the actual work. A game you can only look at is a scoreboard;
                a game with a Start button is a session.
              */}
              {onStartSession && (
                <button
                  onClick={() => onStartSession(tower.key === 'prop')}
                  title={tower.key === 'prop'
                    ? 'Open the cockpit on a prop-firm account'
                    : 'Open the cockpit on your personal account'}
                  className="flex shrink-0 items-center justify-center gap-2 rounded-xl border border-amber-400/30 bg-amber-400/10 px-4 py-2 text-xs font-black uppercase tracking-wider text-amber-100 transition-colors hover:bg-amber-400/20"
                >
                  <Play className="h-3.5 w-3.5" />
                  Start {tower.key === 'prop' ? 'prop' : 'personal'} session
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {error && <p className="shrink-0 px-4 pb-3 text-[11px] text-amber-300/70 sm:px-6">{error}</p>}
    </div>
  );
};

export default GameMode;
