import React, { useState, useEffect, useLayoutEffect, useRef } from 'react';
import { Coins, Volume2, VolumeX } from 'lucide-react';

/**
 * The Coin Tower — the personal account's climb to its target, as coins you can count.
 *
 * EXTRACTED FROM GoalsTab when the account goal moved to Trading → Personal. It belongs
 * with the account, not with life goals: the tab it now lives on already owns the balance,
 * the daily P&L and the equity curve, which is exactly its data source.
 *
 * One coin is ALWAYS $100 and the count is real — a target of $50,000 is 500 coins, stacked
 * `COINS_PER_STACK` high. If the target is raised the tower recounts itself; nothing here
 * needs editing, which is why the target is the only thing the UI lets you change.
 */

/** Money formatter. GoalsTab has its own one-liner; duplicating it beats coupling two
 *  components through a shared module for a single expression. */
const fmtMoney = (n: number): string =>
  '$' + n.toLocaleString('en-US', { maximumFractionDigits: 0 });

/**
 * Keyframes for the coin animation. Injected inline once, because Tailwind's config
 * here has no custom-keyframes plugin and this keeps the whole feature in one file.
 * `prefers-reduced-motion` switches them all off rather than animating someone who
 * asked the OS not to.
 */

const COIN_STYLE = `
@keyframes pfCoinPop {
  0%   { transform: scale(0.35) translateY(7px); opacity: 0; }
  60%  { transform: scale(1.22) translateY(-3px); opacity: 1; }
  100% { transform: scale(1) translateY(0); opacity: 1; }
}
@keyframes pfCoinGlow {
  0%   { box-shadow: 0 0 0 0 rgba(251,191,36,0.60); }
  100% { box-shadow: 0 0 0 12px rgba(251,191,36,0); }
}
/* A coin dropping into its slot and settling — gravity reads as "landed" far better
   than a scale-up, which is what makes it feel like a game instead of a bar chart. */
@keyframes pfCoinDrop {
  0%   { transform: translateY(-16px) scale(0.72); opacity: 0; }
  55%  { transform: translateY(2px) scale(1.08); opacity: 1; }
  75%  { transform: translateY(-1px) scale(0.99); }
  100% { transform: translateY(0) scale(1); opacity: 1; }
}
/* Light catching the metal as it lands. */
@keyframes pfCoinShine {
  0%   { filter: brightness(1); }
  28%  { filter: brightness(2.1) saturate(1.25); }
  100% { filter: brightness(1); }
}
/* A gold wash over the whole screen at a $1,000 crossing — the "level up" flash. */
@keyframes pfVignette {
  0%   { opacity: 0; }
  16%  { opacity: 1; }
  100% { opacity: 0; }
}
/* The award banner: pops in, holds, drifts out. Transform carries its own -50% x-offset
   so it stays centred regardless of the element's width. */
@keyframes pfBannerIn {
  0%   { opacity: 0; transform: translate(-50%, -8px) scale(0.92); }
  12%  { opacity: 1; transform: translate(-50%, 0) scale(1.05); }
  20%  { transform: translate(-50%, 0) scale(1); }
  78%  { opacity: 1; }
  100% { opacity: 0; transform: translate(-50%, -6px); }
}
/* Coins thrown outward from the hero coin. Direction comes in as --dx/--dy per particle. */
@keyframes pfBurst {
  0%   { transform: translate(-50%, -50%) translate(0, 0) scale(0.5); opacity: 1; }
  100% { transform: translate(-50%, -50%) translate(var(--dx), var(--dy)) scale(0.9); opacity: 0; }
}
@keyframes pfPlusFloat {
  0%   { transform: translate(-50%, 2px); opacity: 0; }
  25%  { opacity: 1; }
  100% { transform: translate(-50%, -26px); opacity: 0; }
}
@media (prefers-reduced-motion: reduce) {
  .pf-anim { animation: none !important; }
}
`;

/**
 * A balance-tracked goal rendered as a game rather than a percentage.
 *
 * Three things stacked, largest to smallest:
 *   1. the $1,000 rail    — 50 segments, the whole climb at a glance;
 *   2. the coin row       — ONLY the $1,000 he is currently inside, as ten $100 coins;
 *   3. the milestones     — markers that light up by themselves when crossed.
 *
 * Everything is derived from ONE number, which is the point: a computed ladder cannot
 * read $1,250 before $500, needs no 500 rows of notes to stay in step with the
 * account, and cannot be hand-ticked (see `lockedIds`). A losing day lowers the
 * balance and the coins un-fill — which is the intent, since "a bad day adds more $100
 * deposits" is just the arithmetic of a balance that went down.
 *
 * The coin row deliberately shows a WINDOW. All 500 slots at a $17 balance is 483 empty
 * holes and reads as failure; ten slots with three filled reads as nearly there. That
 * is the difference between a progress bar and a reason to deposit another $100.
 */
/**
 * How many $100 coins stand in one stack. 500 coins / 20 = **25 stacks**, which is the
 * arithmetic Daniel did out loud: "500 divided by 20, which is 25 stacks to the right."
 */
const COINS_PER_STACK = 20;

/**
 * A level-up every NOTCH units — the same $1,000 step GoalsTab's money goals used.
 * It is only a DEFAULT now: the prop tower counts percent of ROI, where a $1,000
 * step would never fire, so it passes its own notch instead.
 */
const NOTCH = 1000;

/**
 * Counts up to `value` whenever it changes — a ~0.65s ease-out odometer.
 *
 * The cheapest game-feel there is: a total that ticks upward makes a deposit read as a
 * SCORE, where an instant swap just looks like a re-render.
 *
 * Honours `prefers-reduced-motion` by jumping straight to the value — someone who asked
 * their OS to stop motion does not want their money rolling either.
 */
const useCountUp = (value: number | null): number => {
  const [shown, setShown] = useState(value ?? 0);
  const from = useRef(value ?? 0);
  useEffect(() => {
    if (value == null) return;
    const a = from.current;
    if (a === value) return;
    if (typeof window !== 'undefined'
        && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      from.current = value;
      setShown(value);
      return;
    }
    let raf = 0;
    const t0 = performance.now();
    const DUR = 650;
    const tick = (t: number) => {
      const p = Math.min(1, (t - t0) / DUR);
      const eased = 1 - Math.pow(1 - p, 3);
      setShown(a + (value - a) * eased);
      if (p < 1) raf = requestAnimationFrame(tick);
      else from.current = value;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return shown;
};

/**
 * The coin tower — the balance-tracked climb as coins you can actually count.
 *
 * Its own section rather than a strip inside the goal card (Daniel: "I don't want it
 * inside the same card … a separate section … and I want the coins stacked on top of
 * each other"). One coin is ALWAYS $100 and the unit is not negotiable — at a $50,000
 * target that is 500 coins, stacked 20 high and 25 across, filling bottom-to-top and
 * then left-to-right.
 *
 * That is a lot of DOM — 500 nodes — but they are trivial divs, and seeing the true
 * count IS the point. An earlier version showed a ten-coin "window" of the current
 * $1,000; that hid how much was left, which is the number he actually wants to watch
 * shrink coin by coin.
 */
const SOUND_KEY = 'pf-coin-sound';

/**
 * A tiny synthesized "clink" — no audio file, no library, ~30 lines.
 *
 * WHY WEB AUDIO AND NOT AN <audio> ELEMENT: iOS refuses to start playback without a user
 * gesture, and Daniel has already been bitten by `setTimeout`-scheduled audio being
 * unreliable there. Web Audio sidesteps both — the context is created/resumed inside a real
 * tap, and everything after that is scheduled on the AUDIO clock, not the JS timer queue,
 * so it cannot drift or get dropped by a backgrounded tab.
 *
 * The context is shared and created lazily, because iOS also caps how many you may have.
 */
let audioCtx: AudioContext | null = null;

const getAudio = (): AudioContext | null => {
  if (typeof window === 'undefined') return null;
  try {
    const Ctor = window.AudioContext || (window as any).webkitAudioContext;
    if (!Ctor) return null;
    if (!audioCtx) audioCtx = new Ctor();
    if (audioCtx.state === 'suspended') void audioCtx.resume();
    return audioCtx;
  } catch {
    return null;
  }
};

/**
 * `coin` = a bright two-note ding for one deposit.
 * `level` = a four-note rise for a $1,000 / $5,000 crossing.
 * A pure triangle wave with an exponential decay envelope — the fast attack and short tail
 * are what make it read as metal rather than a beep.
 */
const playChime = (kind: 'coin' | 'level') => {
  const ctx = getAudio();
  if (!ctx) return;
  const notes = kind === 'coin' ? [1568, 2093] : [1047, 1319, 1568, 2093];
  const step = kind === 'coin' ? 0 : 0.075;
  const tail = kind === 'coin' ? 0.22 : 0.45;
  notes.forEach((freq, i) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.value = freq;
    const start = ctx.currentTime + i * step;
    const end = start + tail;
    const peak = (kind === 'coin' ? 0.13 : 0.15) / (1 + i * 0.4);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(peak, start + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, end);
    osc.connect(gain).connect(ctx.destination);
    osc.start(start);
    osc.stop(end + 0.02);
  });
};

export const CoinTower: React.FC<{
  target: number;
  unit: number;
  balance: number | null;
  /**
   * The all-time high — drawn as a permanent gold rule where the best fill ever
   * reached, so a losing day cannot erase the evidence that he got there.
   *
   * Only drawn when it sits strictly ABOVE the current fill; level with the fill
   * it would just double the top edge of the coins. Null = no record yet.
   */
  peak?: number | null;
  /**
   * How to print one slot's value. Defaults to money, because the personal tower
   * counts dollars — but the prop tower counts PERCENT of ROI, where a "$10"
   * label would simply be false. Every user-facing number goes through this.
   */
  formatValue?: (n: number) => string;
  /**
   * How tall one coin is, in px. The default suits a tower sitting inside a card; Game Mode
   * passes `fill` instead and lets the coin size be derived from the page.
   */
  coinPx?: number;
  /**
   * How many coins stand in one stack. 20 is the personal tower's arithmetic (500 coins →
   * 25 stacks). A tower with FEW coins needs fewer per stack or it ends up as a handful of
   * absurdly wide slabs: the prop tower's 100 coins read as coins at 10 across, not at 5.
   */
  coinsPerStack?: number;
  /**
   * Size the coins to the PAGE instead of to a fixed 8px — the full-screen Game Mode tower.
   *
   * Measuring instead of guessing matters here: a coin has to stay roughly coin-shaped, so the
   * size is the smaller of what the available WIDTH allows (25 columns is a narrow column) and
   * what the available HEIGHT allows. Deriving from the viewport height alone would blow the
   * 10-column prop tower out to three times its natural width.
   */
  fill?: boolean;
  /** A level-up every `notch` units. 1,000 for dollars, 10 for ROI percent. */
  notch?: number;
  /** The larger award tier. 5,000 for dollars, 50 for ROI percent. */
  bigNotch?: number;
  /** DEV ONLY. Passing it renders the ± buttons; production never passes it. */
  onNudge?: (delta: number) => void;
}> = ({
  target, unit, balance, peak = null, formatValue,
  coinPx = 8, coinsPerStack = COINS_PER_STACK, fill = false,
  notch = NOTCH, bigNotch = 5000, onNudge,
}) => {
  const fmt = formatValue ?? fmtMoney;
  const have = balance ?? 0;
  const unitsTotal = Math.max(1, Math.ceil(target / unit));
  const filled = balance == null ? 0 : Math.max(0, Math.min(unitsTotal, Math.floor(have / unit)));
  /** Never fewer than 4 rows, or a tiny target would render as one fat coin. */
  const ROWS = Math.max(4, Math.round(coinsPerStack));
  const stackCount = Math.max(1, Math.ceil(unitsTotal / ROWS));

  /**
   * Which coins just landed — held in STATE, not derived from a ref.
   *
   * ⚠️ A per-render ref diff does NOT work here, and it is a subtle one. The count-up
   * re-renders every frame, so on the very next frame the diff reports "no new coins",
   * `isFresh` goes false, React pulls the inline `animation` style off the coin, and the
   * drop is CANCELLED about 16ms in — looking like no animation at all. State keeps the
   * flag set for the life of the animation and then clears it.
   */
  const [freshRange, setFreshRange] = useState<{ from: number; count: number } | null>(null);
  const prevFilled = useRef<number | null>(null);
  useEffect(() => {
    if (balance == null) return;
    const prev = prevFilled.current;
    prevFilled.current = filled;
    if (prev == null || filled <= prev) return;
    const count = filled - prev;
    setFreshRange({ from: filled - count, count });
    // Long enough for the last coin's staggered drop plus its shine to finish.
    const t = window.setTimeout(() => setFreshRange(null), 1000 + count * 30);
    return () => window.clearTimeout(t);
  }, [balance, filled]);

  /**
   * The number rolls up to its new value instead of snapping. It is the cheapest piece of
   * game feel there is — a total that ticks upward makes a deposit feel like a SCORE,
   * where an instant swap just looks like a re-render.
   */
  const shown = useCountUp(balance);

  /** Progress into the CURRENT $100 — what the hero coin's ring shows. */
  const into = balance == null ? 0 : have % unit;
  const intoUnit = balance == null ? 0 : into / unit;
  const nextAt = balance == null ? unit : have + (unit - into);

  /** Sound is ON by default but mutable — a game that beeps and cannot be silenced gets closed. */
  const [soundOn, setSoundOn] = useState(() => {
    try { return localStorage.getItem(SOUND_KEY) !== 'off'; } catch { return true; }
  });
  const soundRef = useRef(soundOn);
  useEffect(() => { soundRef.current = soundOn; }, [soundOn]);
  const toggleSound = () => setSoundOn((v) => {
    const next = !v;
    try { localStorage.setItem(SOUND_KEY, next ? 'on' : 'off'); } catch { /* private mode */ }
    return next;
  });

  /**
   * iOS will not let audio start without a gesture, and the FEED can move the balance with no
   * tap involved. So the context is woken on the first interaction ANYWHERE — not just on the
   * ± buttons — otherwise a real deposit off the feed would land silently forever.
   */
  useEffect(() => {
    const wake = () => { getAudio(); };
    window.addEventListener('pointerdown', wake, { once: true });
    return () => window.removeEventListener('pointerdown', wake);
  }, []);

  /**
   * $1,000 and $5,000 crossings. Compared against the PREVIOUS thresholds rather than computed
   * per render, so a single jump of several thousand fires ONCE with the biggest award it earned
   * instead of once per threshold it happened to pass through on the way.
   */
  const prevNotch = useRef<number | null>(null);
  const prevBig = useRef<number | null>(null);
  const [award, setAward] = useState<{ label: string; big: boolean; id: number } | null>(null);
  const [burst, setBurst] = useState<number | null>(null);

  useEffect(() => {
    if (balance == null) return;
    const lvl = Math.floor(have / notch);
    const bigLvl = Math.floor(have / bigNotch);
    const wasLvl = prevNotch.current;
    const wasBig = prevBig.current;
    prevNotch.current = lvl;
    prevBig.current = bigLvl;
    if (wasLvl == null || wasBig == null) return;   // the first paint is not an achievement
    const hitBig = bigLvl > wasBig;
    const hitLvl = lvl > wasLvl;
    if (!hitLvl && !hitBig) return;                 // a losing day gets no fanfare

    setAward(hitBig
      ? { label: `${fmt(bigLvl * bigNotch)} banked`, big: true, id: Date.now() }
      : { label: `${fmt(lvl * notch)} reached`, big: false, id: Date.now() });
    setBurst(Date.now());
    // Staggered just after the coin's clink, so it lands as "clink … ta-da!" rather than the
    // two sounds fighting in the same instant.
    const s = window.setTimeout(() => { if (soundRef.current) playChime('level'); }, 160);
    const t = window.setTimeout(() => { setAward(null); setBurst(null); }, hitBig ? 3400 : 2500);
    return () => { window.clearTimeout(s); window.clearTimeout(t); };
  }, [balance, have, notch, bigNotch]);

  /** One clink per deposit — a batch of five coins is ONE sound, not five overlapping ones. */
  useEffect(() => {
    if (!freshRange || !soundRef.current) return;
    playChime('coin');
  }, [freshRange]);

  /** The tower grid's own box, measured so `fill` can size coins to the page. */
  const guardRef = useRef<HTMLDivElement | null>(null);
  const recordRef = useRef<HTMLDivElement | null>(null);
  /**
   * Width AND height are both kept, not just the width. The coin size depends on the viewport
   * height too, and `setBoxW` with an unchanged width makes React bail out — so a pure height
   * change (rotating the iPad, a landscape resize) would leave the tower at its old scale.
   */
  const [box, setBox] = useState({ w: 0, h: 0, vh: 0 });

  useEffect(() => {
    if (!fill) return;
    const measure = () => setBox({
      w: guardRef.current?.clientWidth ?? 0,
      // The guard is a flex-1 box, so its own height IS the space the tower may use. Reading it
      // beats guessing a fraction of the viewport: the guess has to leave room for the readout,
      // the hero coin and the footer, and getting that wrong either clips the page or wastes it.
      h: guardRef.current?.clientHeight ?? 0,
      // ⚠️ AND the viewport, purely so the hero coin has a size that CANNOT take part in the
      // measurement above. See HERO_PX.
      vh: typeof window !== 'undefined' ? window.innerHeight : 0,
    });
    measure();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null;
    if (ro && guardRef.current) ro.observe(guardRef.current);
    window.addEventListener('resize', measure);
    window.addEventListener('orientationchange', measure);
    return () => {
      if (ro) ro.disconnect();
      window.removeEventListener('resize', measure);
      window.removeEventListener('orientationchange', measure);
    };
  }, [fill, stackCount, ROWS]);

  const gapFor = (px: number) => Math.max(2, Math.round(px * 0.18));
  const colGapFor = (px: number) => Math.max(3, Math.round(px * 0.35));

  /** Whichever way it is decided, COIN_PX is the single source of the tower's geometry. */
  /**
   * How tall a coin is when filling the page.
   *
   * The rule is FILL THE HEIGHT FIRST, then use whatever width is spare by growing the coin
   * SIDEWAYS, up to a 2:1 ceiling. Getting this the other way round is what left the page half
   * empty: capping the shape at 2:1 and taking the smaller of the two budgets made a tall screen
   * stop at whichever width the 25 columns allowed, so the tower sat low and small with hundreds
   * of pixels of nothing above it. A coin really is round, so somewhere near 1:1 is right — 2:1 is
   * only the limit at which a coin starts looking like a bar.
   */
  /** The gap grows with the coin, so a budget that guessed a fixed gap over-ran the box. */
  const GAP_RATIO = 0.18;

  const COIN_PX = (() => {
    if (!fill || box.w <= 0) return coinPx;
    const availH = box.h || (typeof window !== 'undefined' ? window.innerHeight * 0.6 : 540);
    const perColW = (box.w - (stackCount - 1) * colGapFor(24)) / stackCount;
    /*
     * Solve the height budget against the ACTUAL gap, not a stand-in. `ROWS * (px + gap(px))` is
     * the grid's real height, and gap is ~18% of px, so step down until it genuinely fits rather
     * than estimating — an estimate here let a tall tower spill out of the box it was measured
     * against, which then shifted that box on the next measurement.
     */
    let px = Math.floor(availH / (ROWS * (1 + GAP_RATIO)));
    while (px > 6 && ROWS * (px + gapFor(px)) > availH) px--;
    // Never taller than a column is wide: at 1:1 that would already overflow sideways.
    return Math.max(6, Math.min(96, Math.min(px, Math.floor(perColW))));
  })();

  /** Up to 2:1, as wide as the spare width allows — how a coin uses the room it is given. */
  const COIN_ASPECT = (() => {
    if (!fill || box.w <= 0) return 2;
    const perColW = (box.w - (stackCount - 1) * colGapFor(24)) / stackCount;
    return Math.max(1, Math.min(2, perColW / COIN_PX));
  })();
  const GAP_PX = gapFor(COIN_PX);
  const COL_GAP = colGapFor(COIN_PX);
  /**
   * The width the grid WANTS for those coins. Applied as a max-width so a tower whose height ran
   * out first sits centred at its natural size instead of stretching its coins sideways to fill.
   */
  const TOWER_W = stackCount * COIN_PX * COIN_ASPECT + (stackCount - 1) * COL_GAP;
  /**
   * The big coin at the top.
   *
   * ⚠️ IT MUST NOT BE DERIVED FROM `COIN_PX`, and that is not a style preference — deriving it
   * from the coin size is what made the whole prop tower shake. The chain is a closed loop:
   *
   *     COIN_PX → HERO_PX → the card's chrome is 3px taller → the guard is 3px shorter
   *     → COIN_PX recomputes one step smaller → HERO_PX shrinks back → … forever
   *
   * Measured before the fix: the layout flickered between exactly two states (px=18/guard=235
   * and px=19/guard=232), re-laying-out and re-rasterising every frame — which is what read as
   * "everything shakes violently and looks blurry". The personal tower hid it because its coin
   * size sat below the 56px floor, so HERO_PX never actually changed.
   *
   * So in fill mode it is sized from the VIEWPORT, which no coin or card can move. In card mode
   * a fixed multiple of the coin size is safe, because that coin size is a constant, not measured.
   */
  const HERO_PX = fill
    ? Math.max(64, Math.min(160, Math.round((box.vh || 900) * 0.095)))
    : Math.max(72, Math.min(110, Math.round(coinPx * 6.5)));
  /** A divider every notch's worth of coins — $1,000 for dollars, 10% of ROI. */
  const DIVIDER_ROW = Math.round(notch / unit);

  /**
   * The record line, positioned by MEASUREMENT rather than by arithmetic.
   *
   * Deriving the height from `row * (COIN_PX + GAP_PX)` looks like it should work
   * and does not: the faint divider above a notch row makes that child taller, and
   * empty cells render as bare spacers with no divider at all — so columns are not
   * all the same height and any computed offset drifts by a pixel or two. Reading
   * the actual rect off the record coin cannot drift, whatever the layout does.
   */
  const [recordY, setRecordY] = useState<number | null>(null);

  const peakUnits = peak == null || !Number.isFinite(peak)
    ? 0
    : Math.max(0, Math.min(unitsTotal, Math.floor(peak / unit)));
  /** Above the fill only — level with it, the rule is just a second top edge. */
  const showRecord = peakUnits > filled && peakUnits > 0;

  useLayoutEffect(() => {
    if (!showRecord) { setRecordY(null); return; }
    const measure = () => {
      const guard = guardRef.current;
      const coin = recordRef.current;
      if (!guard || !coin) { setRecordY(null); return; }
      const g = guard.getBoundingClientRect();
      const c = coin.getBoundingClientRect();
      setRecordY(Math.round(g.bottom - c.top));
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [showRecord, peakUnits, filled, unit, target, unitsTotal, COIN_PX, GAP_PX]);

  return (
    <div
      className={`relative rounded-xl border border-white/10 bg-white/[0.03] p-3${
        fill ? ' flex min-h-0 flex-1 flex-col' : ''
      }`}
    >
      <style>{COIN_STYLE}</style>

      {/* The $1,000 "level up" wash — a gold glow round the screen edges. FIXED and
          pointer-events-none so it covers the viewport without touching layout or stealing
          a click, and it is not clipped by the card because no ancestor has a transform. */}
      {burst != null && (
        <div
          aria-hidden
          className="pf-anim pointer-events-none fixed inset-0 z-[60]"
          style={{
            boxShadow: 'inset 0 0 140px 16px rgba(251,191,36,0.45)',
            animation: 'pfVignette 1200ms ease-out both',
          }}
        />
      )}

      {/* The award banner, centred over the tower. Keyed on the award id so a second award
          re-runs the animation instead of reusing a finished one. */}
      {award != null && (
        <div
          key={award.id}
          className="pf-anim pointer-events-none absolute left-1/2 top-2 z-20 whitespace-nowrap"
          style={{ animation: `pfBannerIn ${award.big ? 3200 : 2400}ms ease-out both` }}
        >
          <span className={`rounded-full px-3 py-1 text-[11px] font-black tracking-wide shadow-lg ${
            award.big ? 'bg-amber-400 text-amber-950' : 'border border-amber-400/40 bg-[#02090d] text-amber-200'
          }`}>
            {award.big ? '★ ' : '● '}{award.label}
          </span>
        </div>
      )}

      <div className="mb-2.5 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Coins className="h-4 w-4 text-amber-300" />
          <h3 className="text-sm font-bold text-amber-200">The Coin Tower</h3>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            onClick={toggleSound}
            title={soundOn ? 'Mute the coin sound' : 'Unmute the coin sound'}
            aria-label={soundOn ? 'Mute coin sound' : 'Unmute coin sound'}
            className="flex h-6 w-6 items-center justify-center rounded-md border border-white/15 text-white/50 transition-colors hover:bg-white/10 hover:text-white"
          >
            {soundOn ? <Volume2 className="h-3.5 w-3.5" /> : <VolumeX className="h-3.5 w-3.5" />}
          </button>
        {onNudge && (
          <>
            <button
              onClick={() => onNudge(-unit)}
              title={`Test only — simulate losing ${fmt(unit)}`}
              aria-label={`Simulate losing ${fmt(unit)}`}
              className="flex h-6 w-6 items-center justify-center rounded-md border border-white/15 text-sm font-bold text-white/60 transition-colors hover:bg-white/10 hover:text-white"
            >
              −
            </button>
            <button
              onClick={() => onNudge(unit)}
              title={`Test only — simulate depositing ${fmt(unit)}`}
              aria-label={`Simulate depositing ${fmt(unit)}`}
              className="flex h-6 w-6 items-center justify-center rounded-md border border-amber-400/40 bg-amber-400/10 text-sm font-bold text-amber-200 transition-colors hover:bg-amber-400/25"
            >
              +
            </button>
          </>
        )}
        </div>
      </div>

      {/* THE HERO COIN — the next $100, big enough to actually see, with a ring for how far
          into it he is. This is what fixes the size problem: 500 coins MUST be small, so the
          one that matters RIGHT NOW gets its own space and its own animation. */}
      {balance != null && (
        <div className="relative mb-3 flex items-center gap-3">
          <div className="relative shrink-0" style={{ height: HERO_PX, width: HERO_PX }}>
            <svg viewBox="0 0 44 44" className="h-full w-full -rotate-90">
              <circle cx="22" cy="22" r="19" fill="none" stroke="rgba(255,255,255,0.09)" strokeWidth="3" />
              <circle
                cx="22" cy="22" r="19" fill="none" stroke="url(#pfGoldRing)" strokeWidth="3"
                strokeLinecap="round"
                strokeDasharray={2 * Math.PI * 19}
                strokeDashoffset={2 * Math.PI * 19 * (1 - intoUnit)}
                className="transition-[stroke-dashoffset] duration-700 ease-out"
              />
              <defs>
                <linearGradient id="pfGoldRing" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0%" stopColor="#fde68a" />
                  <stop offset="100%" stopColor="#d97706" />
                </linearGradient>
              </defs>
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
              <span
                className="font-black text-amber-200"
                style={{ fontSize: Math.max(11, Math.round(HERO_PX * 0.2)) }}
              >
                {Math.round(intoUnit * 100)}%
              </span>
            </div>
            {/* Coins thrown outward when something lands. */}
            {burst != null && Array.from({ length: 6 }, (_, i) => {
              const ang = (i / 6) * Math.PI * 2 - Math.PI / 2;
              return (
                <div
                  key={`${burst}-${i}`}
                  className="pf-anim pointer-events-none absolute left-1/2 top-1/2 h-1.5 w-3 rounded-full"
                  style={{
                    background: 'radial-gradient(circle at 34% 26%, #fffbeb, #fcd34d 45%, #d97706)',
                    '--dx': `${Math.round(Math.cos(ang) * HERO_PX * 0.64)}px`,
                    '--dy': `${Math.round(Math.sin(ang) * HERO_PX * 0.64)}px`,
                    animation: `pfBurst 900ms cubic-bezier(.2,.8,.3,1) ${i * 24}ms both`,
                  } as React.CSSProperties}
                />
              );
            })}
          </div>
          <div className="min-w-0">
            <div className="text-xs font-bold text-amber-200">Next coin at {fmt(nextAt)}</div>
            <div className="text-[11px] text-white/45">
              {fmt(Math.max(0, unit - into))} to go · coin {(filled + 1).toLocaleString()} of {unitsTotal.toLocaleString()}
            </div>
          </div>
        </div>
      )}

      {/* One column per stack, each `ROWS` coins tall. A stack's bottom row is its first coin.
          When filling, the guard takes the leftover height and the grid sits at its bottom, so
          the tower grows upward into whatever room the page gives it. */}
      <div
        ref={guardRef}
        className={`relative${fill ? ' flex min-h-0 flex-1 items-end justify-center' : ''}`}
      >
      <div
        className="flex items-end"
        style={{
          height: ROWS * (COIN_PX + GAP_PX),
          gap: COL_GAP,
          ...(fill ? { width: '100%', maxWidth: TOWER_W } : null),
        }}
      >
        {Array.from({ length: stackCount }, (_, s) => (
          <div key={s} className="flex min-w-0 flex-1 flex-col justify-end" style={{ gap: GAP_PX }}>
            {Array.from({ length: ROWS }, (_, k) => {
              // Painted top-down, but a coin's index counts UP from the bottom.
              const row = ROWS - 1 - k;
              const idx = s * ROWS + row;
              if (idx >= unitsTotal) return <div key={k} style={{ height: COIN_PX }} />;
              const isFilled = idx < filled;
              const freshIdx = isFilled && freshRange
                && idx >= freshRange.from && idx < freshRange.from + freshRange.count
                ? idx - freshRange.from
                : -1;
              return (
                <div key={k}>
                  {/* A faint divider at each notch so a tall stack stays countable — but only
                      when it lands INSIDE the stack; a 10-row tower has no row 10 to mark. */}
                  {row === DIVIDER_ROW && DIVIDER_ROW < ROWS && (
                    <div
                      className="w-full bg-white/[0.13]"
                      style={{ height: 1, marginBottom: Math.max(1, Math.round(GAP_PX / 2)) }}
                    />
                  )}
                  {/*
                    The empty state is the thing that matters most here. It used to be a 4%
                    white fill — effectively invisible — so 483 empty cells made the tower look
                    broken instead of "waiting". Now an empty cell is a recessed SOCKET: darker
                    than the card, with an inset shadow and a faint gold rim, so it reads as a
                    slot built to hold a coin.
                    Filled cells are a coin FACE: radial highlight up-and-left, a dark rim to
                    catch the edge, and a bright top bevel. Inline styles, because the gradients
                    and double inset shadows are unreadable as Tailwind arbitrary values.
                  */}
                  <div
                    ref={idx === peakUnits - 1 ? recordRef : undefined}
                    data-coin-idx={idx}
                    title={`${fmt(idx * unit)} → ${fmt((idx + 1) * unit)}`}
                    /* `pf-anim` is what the prefers-reduced-motion rule switches off — an
                       inline `animation` alone would sail straight past it. */
                    className="pf-anim w-full rounded-full"
                    style={{
                      height: COIN_PX,
                      ...(isFilled ? {
                        background: 'radial-gradient(circle at 34% 26%, #fffbeb 0%, #fcd34d 42%, #d97706 100%)',
                        boxShadow: '0 0 6px -1px rgba(251,191,36,0.9), '
                                 + 'inset 0 0 0 1px rgba(146,64,14,0.55), '
                                 + 'inset 0 1px 0 rgba(255,255,255,0.65)',
                      } : {
                        background: 'rgba(255,255,255,0.035)',
                        boxShadow: 'inset 0 0 0 1px rgba(251,191,36,0.10), '
                                 + 'inset 0 1px 2px rgba(0,0,0,0.55)',
                      }),
                      ...(freshIdx >= 0 ? {
                        animation: `pfCoinDrop 560ms cubic-bezier(.22,1.2,.36,1) ${freshIdx * 26}ms both, `
                                 + `pfCoinShine 700ms ease-out ${freshIdx * 26}ms both`,
                      } : null),
                    }}
                  />
                </div>
              );
            })}
          </div>
        ))}

        {/* THE RECORD. A hairline gold rule at the highest fill ever reached, with the
            number on it, so the line explains itself without a legend. Pinned to the
            coin's measured top edge (see `recordY`) and it must not eat a click.

            `h-px` is load-bearing: the container is exactly the height of the rule, so
            `bottom: recordY` puts the RULE on the coin's top edge. Let the label size the
            box instead and the rule floats up by half the text height — measured 6px of
            drift before this was pinned. The label overflows the 1px box, centred on it. */}
        {showRecord && recordY != null && (
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 z-10 flex h-px items-center gap-1.5"
            style={{ bottom: recordY - 1 }}
          >
            <div className="h-px flex-1 bg-gradient-to-r from-transparent via-amber-300/70 to-amber-300/40" />
            <span className="whitespace-nowrap rounded px-1 text-[9px] font-black uppercase tracking-wider text-amber-300/80">
              Best {fmt(peak as number)}
            </span>
          </div>
        )}
      </div>
      </div>

      <div className="mt-2.5 flex items-center justify-between gap-2 text-[10px]">
        <span className={balance == null ? 'text-amber-300/70' : 'text-white/50'}>
          {balance == null
            ? 'waiting on account balance'
            : `${fmt(Math.round(shown))} of ${fmt(target)}`}
        </span>
        <span className="text-white/35">
          {filled.toLocaleString()}/{unitsTotal.toLocaleString()} coins · {stackCount} × {ROWS}
        </span>
      </div>
    </div>
  );
};
