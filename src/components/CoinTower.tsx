import React, { useState, useEffect, useRef } from 'react';
import { Coins, Volume2, VolumeX } from 'lucide-react';

/**
 * The Coin Tower — the climb to the target, as ONE column of coins that compacts into titanium.
 *
 * ═══ ONE TOWER, TITANIUM INGOTS (Nov 28 2026) ═══
 * Daniel: *"we just have one tower right no nothing side to side anymore … simple goal is 10 coins
 * and then when i hit 10 coins some cool animation comes out and the coin turns bigger and changes
 * color maybe purple titanium … and then the other gold coins start to stack on top of those so
 * every metallic wide coin is a thousand … same thing for when i go under it removes the big coin
 * and gives me back smaller coins."*
 *
 * So the stack, read from the ground up, is:
 *
 *     [ ingot · ingot · ingot … ] [ gold · gold · gold … ] [ empty sockets ]
 *       $1,000 each, oldest first    the milestone running      what is left of it
 *
 * Ten gold coins ($100 each, on both sides) forge into ONE wide purple-titanium ingot worth
 * $1,000, and the next coin starts a fresh ten on top of it. Dropping back below a milestone
 * splits the ingot into its ten coins again.
 *
 * WHY ONE COMPACTING COLUMN BEATS A SKYLINE OF TOWERS: a milestone should leave a mark you can
 * see, not another identical column. Read from the bottom, this is the history of the account in
 * $1,000 units, and the ten-slot frame above it is the only thing you are actually working on.
 *
 * ⚠️ TWO THINGS HERE ARE LOAD-BEARING, AND BOTH ARE BUG FIXES:
 *  1. NOTHING in the measured box may be sized FROM the measurement. `fill` sizes the coins to the
 *     box; if the hero coin (or the shaft, or the frame) changed height when the coins changed
 *     size, the observer would see its own output and oscillate forever ("shakes violently and
 *     looks blurry").
 *  2. A tap must never reach `setPointerCapture` (see Dashboard's arcade FABs). N/A here — no
 *     pointer handling in this component — but never add any without reading that comment.
 */

/** Money formatter. GoalsTab has its own one-liner; duplicating it beats coupling two
 *  components through a shared module for a single expression. */
const fmtMoney = (n: number): string =>
  '$' + n.toLocaleString('en-US', { maximumFractionDigits: 0 });

/** ── the shape of the stack ────────────────────────────────────────────────────
 *  All in units of ONE GOLD COIN HEIGHT, so the geometry below is a single scale factor. */
/** How tall a titanium ingot stands, in coin heights. Taller than one coin but far shorter than
 *  the ten it replaces — that compaction is the whole point of a milestone. */
const INGOT_H = 1.9;
/** An ingot is this many times WIDER than a gold coin. Daniel called it a "wide coin"; this is
 *  what makes it read as a forged ingot rather than just a bigger dot. */
const INGOT_W_F = 2.9;
/**
 * The widest a gold coin may get (width ÷ height).
 *
 * ⚠️ THIS IS THE ONE KNOB THAT CONTROLS HOW BIG THE TOWER FEELS, and it was wrong first time out.
 * The height solve alone fixes the coin's HEIGHT, and every coin height that fits the box came out
 * as a narrow sliver on a phone — Daniel, on his iPad: *"Make them way wider both the gold and
 * bigger ones on mobile at least ... they are really small."* A single column has no towers beside
 * it to take up the width, so the width has to be spent HERE. At 1.6 the coins were discs and the
 * tower was a 190px stick on an iPad; at 2.4 the same column is ~320px of solid metal.
 *
 * (Daniel's own earlier note — "2:1 is where a coin starts looking like a bar" — is why this is
 * 2.4 and not 4: the point is a chunky coin, not a fence plank.)
 */
const GOLD_ASPECT = 2.4;
/** A card tower may take this much of the viewport height before it stops growing. */
const CARD_MAX_VH = 0.45;
/** Gap between stacked pieces, as a fraction of a coin height. */
const GAP_F = 0.15;

/**
 * ═══ THE TIERS: base ten, all the way down ═══
 *
 * Daniel, on the single column shrinking as it grows: *"they shrink as more are stacked against
 * each other … i guess we will need more towers or is there a different design?"*
 *
 * Not more towers — 50 towers is 50 slivers, the same problem five times further out. The fix is
 * that **every ten of one thing forges into one of the next thing up**, so the stack can never
 * hold more than a handful of pieces per level however much money exists:
 *
 *     10 coins  → 1 INGOT   ($1,000)    gold disc     · 2.4 : 1
 *     10 ingots → 1 BAR     ($10,000)   platinum bar  · ~4 : 1
 *
 * Because the ratio is TEN at every step, the digits of the coin count ARE the stack — 347 coins is
 * 3 bars + 4 ingots + 7 coins — and because a bar occupies about the same slice of height as the
 * ten ingots it replaces, **the tower looks the same at every decade**: the coin height stays in
 * one band from $1,000 past $50,000 instead of slowly turning into a barcode. (Measured: at $50,000
 * the coin is 5px without tiers and 22px with them.)
 *
 * Widths are in units of a COIN HEIGHT, so the column's width is simply `widest · H`.
 * A third tier is one more entry in `tiers` — nothing else in the geometry has to change.
 */
const COIN_WF = GOLD_ASPECT;               // one coin: 2.4
const INGOT_WF = INGOT_W_F * GOLD_ASPECT;  // one ingot: 6.96 — a wide plate
const BAR_WF = 10.5;                       // one bar — ~4:1 against its own height
/** A bar's height in coin heights. TALL is the "big ingot" shape, on trial against the flat bar. */
const BAR_H = 2.6;
const BAR_H_TALL = 3.4;
/**
 * Card mode (the Personal tab's panel) has no height to fill, so this is its CEILING — the actual
 * coin is the smaller of this, what the width allows, and a cut of the viewport (see `geo`).
 */
const CARD_COIN_PX = 44;

const COIN_STYLE = `
/* A coin dropping into its slot and settling. Short and snappy — "sharp and modern" means a fast
   ease-out with a small overshoot, not a bounce that draws attention to itself. */
@keyframes pfCoinDrop {
  0%   { transform: translateY(-14px) scale(0.7); opacity: 0; }
  58%  { transform: translateY(1.5px) scale(1.06); opacity: 1; }
  100% { transform: translateY(0) scale(1); opacity: 1; }
}
/* Light catching the metal as it lands. */
@keyframes pfCoinShine {
  0%   { filter: brightness(1); }
  26%  { filter: brightness(2.1) saturate(1.25); }
  100% { filter: brightness(1); }
}
/* THE FORGE. Ten coins slamming together into one ingot: it arrives small and blown-out, then
   overshoots and settles as the brightness comes back down to metal. */
@keyframes pfIngotForge {
  0%   { opacity: 0; transform: translateY(-6px) scaleX(0.5) scaleY(0.3); filter: brightness(3.2) saturate(0.35); }
  48%  { opacity: 1; transform: translateY(1px) scaleX(1.05) scaleY(1.1);  filter: brightness(2) saturate(1.35); }
  100% { opacity: 1; transform: none; filter: brightness(1) saturate(1); }
}
/* The specular band sweeping across a freshly forged ingot. One cheap highlight, no glow soup. */
@keyframes pfIngotShine {
  0%   { transform: translateX(-130%) skewX(-18deg); opacity: 0; }
  22%  { opacity: 0.9; }
  100% { transform: translateX(130%) skewX(-18deg); opacity: 0; }
}
/* One outward ring when a milestone is forged. */
@keyframes pfIngotPulse {
  0%   { opacity: 0.9; transform: scale(0.9); }
  100% { opacity: 0; transform: scale(1.3); }
}
/* The ten coins falling INTO the new ingot, so the merge has a direction. */
@keyframes pfMergeIn {
  0%   { opacity: 0.95; transform: translateY(-54px) scale(1); }
  70%  { opacity: 0.8; }
  100% { opacity: 0; transform: translateY(-4px) scale(0.35); }
}
/* THE SPLIT. Gone under a milestone: the coin is handed back upward, out of the ingot. */
@keyframes pfCoinRise {
  0%   { opacity: 0; transform: translateY(16px) scale(0.42); }
  58%  { opacity: 1; transform: translateY(-2px) scale(1.07); }
  100% { opacity: 1; transform: none; }
}
/* The slot that is NEXT, breathing so the eye lands on the thing to earn. */
@keyframes pfNextPulse {
  0%, 100% { opacity: 0.30; }
  50%      { opacity: 0.95; }
}
/* A wash over the whole screen at a milestone. */
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
/* Anodised titanium: a slow iridescent drift across the metal. */
@keyframes pfIrid {
  0%   { filter: hue-rotate(0deg); }
  100% { filter: hue-rotate(360deg); }
}
@media (prefers-reduced-motion: reduce) {
  .pf-anim { animation: none !important; }
}
`;

/** One gold coin — the real metal. */
const GOLD_FILL = 'radial-gradient(circle at 34% 26%, #fffbeb 0%, #fcd34d 42%, #d97706 100%)';
const GOLD_SHADOW =
  '0 0 6px -1px rgba(251,191,36,0.9), '
  + 'inset 0 0 0 1px rgba(146,64,14,0.55), '
  + 'inset 0 1px 0 rgba(255,255,255,0.65)';

/** One $1,000 ingot — anodised purple titanium. The conic layer over the radial is what sells it:
 *  real titanium is one grey-purple metal that throws a spectrum, not a flat violet blob. */
const INGOT_FILL = 'radial-gradient(ellipse at 32% 22%, #f5d0fe 0%, #c084fc 34%, #7c3aed 68%, #3b0764 100%)';
const INGOT_IRID =
  'conic-gradient(from 210deg, #a78bfa 0%, #22d3ee 18%, #f0abfc 36%, #facc15 52%, #a78bfa 74%, #c084fc 100%)';
const INGOT_SHADOW =
  '0 0 18px -2px rgba(168,85,247,0.65), '
  + 'inset 0 0 0 1px rgba(233,213,255,0.55), '
  + 'inset 0 3px 0 rgba(255,255,255,0.32), '
  + 'inset 0 -4px 8px rgba(46,16,101,0.75)';

/**
 * One $10,000 bar — PLATINUM. The vertical gradient is what makes a rectangle read as a polished
 * bar (bright top face, dark base) rather than a plain box, and the cool cyan/violet sheen is what
 * says "different metal" next to titanium's purple.
 */
const PLAT_FILL =
  'linear-gradient(180deg, #ffffff 0%, #eef2f8 20%, #c3cedd 48%, #7d8ca1 78%, #3b4757 100%)';
const PLAT_IRID =
  'conic-gradient(from 200deg, #cbd5e1 0%, #67e8f9 22%, #e2e8f0 44%, #a5b4fc 66%, #cbd5e1 100%)';
const PLAT_SHADOW =
  '0 0 22px -3px rgba(226,232,240,0.55), '
  + 'inset 0 0 0 1px rgba(255,255,255,0.72), '
  + 'inset 0 3px 0 rgba(255,255,255,0.55), '
  + 'inset 0 -5px 10px rgba(24,33,47,0.85)';

/** One rail segment per $1,000 — the same notch GoalsTab's money goals used. */
const NOTCH = 1000;

/** Counts up to `value` whenever it changes — a ~0.65s ease-out odometer. */
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

const SOUND_KEY = 'pf-coin-sound';

/**
 * A tiny synthesized "clink" — no audio file, no library, ~30 lines.
 *
 * WHY WEB AUDIO AND NOT AN <audio> ELEMENT: iOS refuses to start playback without a user
 * gesture, and Daniel has already been bitten by `setTimeout`-scheduled audio being unreliable
 * there. Web Audio sidesteps both — the context is created/resumed inside a real tap, and
 * everything after that is scheduled on the AUDIO clock, not the JS timer queue.
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
 * Three figures, and the FORGE one is deliberately the brightest: a milestone should be
 * recognisable with your eyes closed.
 */
const playChime = (kind: 'coin' | 'ingot' | 'bar' | 'split') => {
  const ctx = getAudio();
  if (!ctx) return;
  const notes = kind === 'coin' ? [1568, 2093]
    // The bar is the biggest forge in the game so far, so it gets the longest run: a full octave up.
    : kind === 'bar' ? [523, 659, 784, 1047, 1319, 1568]
    : kind === 'ingot' ? [784, 1047, 1319, 1568, 2093]
    : [1319, 988, 784];
  const step = kind === 'coin' ? 0 : kind === 'split' ? 0.1 : 0.055;
  const tail = kind === 'coin' ? 0.22 : kind === 'bar' ? 0.62 : 0.5;
  const peakBase = kind === 'coin' ? 0.13 : 0.15;
  notes.forEach((freq, i) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.value = freq;
    const start = ctx.currentTime + i * step;
    const end = start + tail;
    const peak = peakBase / (1 + i * 0.35);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(peak, start + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, end);
    osc.connect(gain).connect(ctx.destination);
    osc.start(start);
    osc.stop(end + 0.02);
  });
};

/** One piece of the stack, resolved. */
interface Piece {
  /** A forged tier, or a live slot. 'empty' is a socket he has not earned yet. */
  kind: 'ingot' | 'bar' | 'gold' | 'empty';
  tier: 'ingot' | 'bar' | 'coin';
  /** The coin index range this piece stands for, so the record rule can be placed on it. */
  from: number;
  to: number;
  /** Height in coin heights — the single number the whole layout is a multiple of. */
  units: number;
  /** Width in coin heights. The column is as wide as its WIDEST piece. */
  wf: number;
  /** Position in the stack and the height below it — exact, so a flare can be placed on it. */
  idx: number;
  belowUnits: number;
}

/** A piece's identity, for diffing one stack against the last — the only thing that tells the
 *  component what just happened, and the reason it does not need to know which tier it happened on. */
const pieceKey = (p: Piece): string => `${p.kind}:${p.from}:${p.to}`;

/** One step of the ladder. `per` is in COINS. A third tier is one more entry here. */
interface TierDef { kind: 'bar' | 'ingot'; per: number; units: number; wf: number }

/** The ladder, biggest first. */
export const tierDefs = (per: number, barUnits: number): TierDef[] => ([
  { kind: 'bar', per: per * per, units: barUnits, wf: BAR_WF },
  { kind: 'ingot', per, units: INGOT_H, wf: INGOT_WF },
]);

/**
 * THE STACK, ground up: every forged piece from the biggest tier down, then the ingot in progress
 * (its filled coins, then its empty sockets). Nothing is drawn that is not banked or earnable.
 *
 * ⚠️ `filled - base`, NOT `filled`, when counting a tier — see the comment at the loop. That single
 * omission drew $50,000 as five bars AND fifty ingots.
 *
 * `belowUnits` and `idx` ride along so a piece's exact distance off the ground is known: the split
 * flare is placed with it, and it is exact because every piece below contributes its own height plus
 * exactly one gap.
 *
 * Pure and exported so `migration/scripts/test-tiers.mts` can pin it — the shrinking Daniel asked
 * about is a property of THIS function, and eyeballing a browser is how the double-count survived
 * the first pass.
 */
export function buildStack(
  filled: number,
  unitsTotal: number,
  per: number,
  barUnits: number,
): Piece[] {
  const tiers = tierDefs(per, barUnits);
  const ingotsDone = Math.floor(filled / per);
  const mileStart = ingotsDone * per;
  const frameSlots = Math.max(0, Math.min(per, unitsTotal - mileStart));
  const goldInFrame = Math.max(0, filled - mileStart);

  const out: Piece[] = [];
  let base = 0;      // the coin index this tier's run starts at
  let units = 0;     // the height below the next piece, in coin heights
  for (const t of tiers) {
    const n = Math.floor((filled - base) / t.per);
    for (let k = 0; k < n; k++) {
      out.push({
        kind: t.kind, tier: t.kind, wf: t.wf, units: t.units,
        from: base + k * t.per, to: base + (k + 1) * t.per - 1,
        idx: out.length, belowUnits: units,
      });
      units += t.units;
    }
    base += n * t.per;
  }
  for (let k = 0; k < frameSlots; k++) {
    const idx = mileStart + k;
    out.push({
      kind: k < goldInFrame ? 'gold' : 'empty',
      tier: 'coin', wf: COIN_WF, units: 1,
      from: idx, to: idx, idx: out.length, belowUnits: units,
    });
    units += 1;
  }
  return out;
}

export const CoinTower: React.FC<{
  /** The goal value. Coins = target / unit, ingots = coins / coinsPerTower. */
  target: number;
  unit: number;
  balance: number | null;
  /** The all-time high, marked on whichever piece holds it. Null = no record yet. */
  peak?: number | null;
  /** How to print one coin's value. */
  formatValue?: (n: number) => string;
  /** How to print a whole milestone — the ingot's label. */
  formatMilestone?: (n: number) => string;
  coinPx?: number;
  coinsPerTower?: number;
  /** Size everything to the page instead of to a fixed coin size (Game Mode). */
  fill?: boolean;
  /** A milestone's worth of value, for the level-up award. */
  notch?: number;
  bigNotch?: number;
  /** DEV ONLY. Passing it renders the ± buttons; production never passes it. */
  onNudge?: (delta: number) => void;
}> = ({
  target, unit, balance, peak = null, formatValue, formatMilestone,
  coinPx = CARD_COIN_PX, coinsPerTower = 10, fill = false,
  notch = NOTCH, bigNotch = 5000, onNudge,
}) => {
  const fmt = formatValue ?? fmtMoney;
  const fmtMile = formatMilestone ?? fmtMoney;
  const have = balance ?? 0;

  /**
   * DEV ONLY, and structurally so: this flips the $10,000 tier between the flat BAR and the taller
   * "big ingot" shape so Daniel can look at both and pick. Nothing in production can set it.
   */
  const [barTall, setBarTall] = useState(false);

  // ── the numbers ───────────────────────────────────────────────────────────
  const PER = Math.max(2, Math.round(coinsPerTower));          // coins per ingot — 10
  const unitsTotal = Math.max(1, Math.ceil(target / unit));    // the whole climb, in coins
  const filled = balance == null
    ? 0
    : Math.max(0, Math.min(unitsTotal, Math.floor(have / unit)));
  const ingotsDone = Math.floor(filled / PER);
  const ingotsTotal = Math.max(1, Math.ceil(unitsTotal / PER));
  const barsDone = Math.floor(filled / (PER * PER));
  const barsTotal = Math.max(1, Math.ceil(unitsTotal / (PER * PER)));
  /** Which coin inside the current ingot he is on — the frame's filled sockets (see `buildStack`). */
  const goldInFrame = Math.max(0, filled - ingotsDone * PER);

  /** The ladder for this render — the one thing the shape trial changes is the bar's height. */
  const barUnits = barTall ? BAR_H_TALL : BAR_H;
  const pieces: Piece[] = React.useMemo(
    () => buildStack(filled, unitsTotal, PER, barUnits),
    [filled, unitsTotal, PER, barUnits],
  );

  /** Everything above the ground, in coin heights. */
  const totalUnits = pieces.reduce((a, p) => a + p.units, 0) || 1;
  /** The column is as wide as its widest piece — once a bar exists, the bars set the width. */
  const widestWf = React.useMemo(
    () => pieces.reduce((m, p) => Math.max(m, p.wf), COIN_WF),
    [pieces],
  );

  // ── geometry ──────────────────────────────────────────────────────────────
  const guardRef = useRef<HTMLDivElement | null>(null);
  const [box, setBox] = useState({ w: 0, h: 0, vh: 0 });

  useEffect(() => {
    // Measured in BOTH modes: fill needs the height, card mode needs the width to cap the coins.
    // ⚠️ Only publish a CHANGE. A fresh object with identical numbers still re-renders React, and
    // a re-render triggered by the very observer that is watching the element is how a resize loop
    // starts. Bailing out on equal values closes that door permanently.
    const measure = () => {
      const w = guardRef.current?.clientWidth ?? 0;
      const h = guardRef.current?.clientHeight ?? 0;
      const vh = typeof window !== 'undefined' ? window.innerHeight : 0;
      setBox((prev) => (prev.w === w && prev.h === h && prev.vh === vh ? prev : { w, h, vh }));
    };
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
  }, [fill]);

  /**
   * THE ONE SCALE FACTOR. Solve the coin height so the WHOLE stack fits the box exactly — gaps
   * included, because guessing the gap (as an earlier version did) is how a tall tower spilled out
   * of the box it was measured against.
   *
   *    total height = totalUnits·h + (count − 1)·GAP_F·h
   *
   * Then cap it by the width: the column is as wide as its widest piece (`widestWf` coin heights),
   * so the tallest it may stand is `availW / widestWf`.
   */
  const geo = React.useMemo(() => {
    const count = pieces.length;
    const gaps = Math.max(0, count - 1);
    const availW = (box.w || 0) - 8;                 // a little breathing room off the edges
    const widthCap = availW > 0 ? availW / widestWf : Infinity;
    /** The gap the layout will actually use, for a coin height of `h`. */
    const gapOf = (h: number) => Math.max(0, Math.floor(GAP_F * h));
    if (!fill) {
      /*
       * CARD MODE has no height to fill — the card grows with its content — so the coin is sized
       * from the WIDTH (up to `coinPx`), then limited to a fraction of the viewport so the widget
       * cannot swallow the tab it sits on. A fixed 24px coin made the whole tower a ~100px sliver
       * on a phone, which is exactly the complaint above.
       */
      const vh = box.vh || (typeof window !== 'undefined' ? window.innerHeight : 900);
      const byViewport = (vh * CARD_MAX_VH) / Math.max(1, totalUnits + GAP_F * gaps);
      const h = Math.max(16, Math.min(coinPx || CARD_COIN_PX, widthCap, byViewport));
      return { h, gap: gapOf(h) };
    }
    const availH = box.h
      || (typeof window !== 'undefined' ? window.innerHeight * 0.55 : 460);
    /*
     * TWO STEPS, because the gap is an INTEGER and the height is not. A gap-inclusive estimate
     * assumes a fractional gap; once the gap is floored, its remainder is height that would simply
     * go unused (at 50 ingots that was ~34px — 8% of the box). So: estimate, floor the gap, then
     * re-solve for the height THAT gap leaves. The result fills the box exactly, and because the
     * floored gap is never bigger than the fractional one it can only ever come in under budget.
     */
    const h0 = availH / (totalUnits + GAP_F * gaps);
    const gap = gapOf(Math.min(h0, widthCap));
    let h = Math.min((availH - gap * gaps) / totalUnits, widthCap);
    /*
     * ⚠️ THE FLOOR MUST NOT PUSH THE STACK OUT OF THE BOX. `max(2, …)` is a readability guard, and
     * when the box is too short for the piece count it silently wins over the solve — 108 units at
     * a 204px box solved to 1.89, got floored to 2, and came out 216px tall (106% of its box).
     * The floor is 1 now and `STACK_H` is clamped below, so the degenerate case clips rather than
     * overlapping whatever sits under the tower.
     */
    h = Math.max(1, Math.floor(h * 100) / 100);
    return { h, gap };
  }, [fill, box.w, box.h, pieces.length, totalUnits, coinPx, widestWf]);

  const H = geo.h;                                   // one gold coin's height
  /** Both come straight out of the solve — never re-derived here, or the two disagree. */
  const GAP = geo.gap;
  const COL_W = Math.max(6, Math.round(widestWf * H));                  // the column's width
  /** A piece's width, as a percentage of the column — so nothing needs its own pixel maths. */
  const wfPct = (wf: number) => `${(wf / widestWf) * 100}%`;
  const STACK_H = Math.min(
    Math.floor(totalUnits * H + (pieces.length - 1) * GAP),
    fill && box.h > 0 ? Math.floor(box.h) : Infinity,
  );

  // ── animation triggers, held in STATE ─────────────────────────────────────
  /**
   * ⚠️ HELD IN STATE, NOT DERIVED FROM A REF. A per-render ref diff does not work here and it is
   * subtle: the count-up re-renders every frame, so on the very next frame the diff reports "no
   * change", React pulls the inline `animation` style off the element, and the animation is
   * CANCELLED about 16ms in — looking like no animation at all. State keeps the flag set for the
   * life of the animation and then clears it.
   */
  const [freshRange, setFreshRange] = useState<{ from: number; count: number } | null>(null);
  /** The piece just forged (an ingot or a bar) by identity, and the pieces a split handed back. */
  const [forgedKey, setForgedKey] = useState<string | null>(null);
  const [restoredKeys, setRestoredKeys] = useState<Set<string> | null>(null);
  const prevFilled = useRef<number | null>(null);
  const prevKeys = useRef<string[] | null>(null);

  const shown = useCountUp(balance);

  /**
   * ONE diff, two directions. The stack's own identity is what says what just happened, so this
   * works for every tier without knowing which one it is:
   *
   *   UP   → the coins that landed, and any TIER piece that appeared — that appearance is a forge
   *   DOWN → the pieces the stack got back — that is a split, whatever broke gave them back
   *
   * ⚠️ Reading the verdict off the piece list is what fixed the split, which keyed off a coin index
   * no piece could ever match and so played as a silent vanish. It also means a BAR splitting into
   * ten ingots animates those ten INGOTS, not ten coins — the old version could only ever animate
   * coins, because it assumed the only thing that breaks is an ingot.
   */
  useEffect(() => {
    if (balance == null) return;
    const keys = pieces.map(pieceKey);
    const prev = prevKeys.current;
    const prevF = prevFilled.current;
    prevKeys.current = keys;
    prevFilled.current = filled;
    if (prev == null || prevF == null) return;      // the first paint is not an arrival

    const had = new Set(prev);
    const timers: number[] = [];
    if (filled > prevF) {
      setFreshRange({ from: prevF, count: filled - prevF });
      timers.push(window.setTimeout(() => setFreshRange(null), 900 + (filled - prevF) * 40));
      const forge = pieces.find((pc) => pc.tier !== 'coin' && !had.has(pieceKey(pc)));
      if (forge) {
        setForgedKey(pieceKey(forge));
        timers.push(window.setTimeout(() => setForgedKey(null), 1700));
      }
    } else if (filled < prevF) {
      // An empty socket coming back is a re-arrangement, not something he lost — only real pieces.
      const back = new Set(keys.filter((k) => !had.has(k) && !k.startsWith('empty:')));
      if (back.size) {
        setRestoredKeys(back);
        timers.push(window.setTimeout(() => setRestoredKeys(null), 1300));
      }
    }
    return () => timers.forEach(window.clearTimeout);
  }, [balance, pieces, filled]);

  /**
   * The big coin at the top of the page — the NEXT COIN, with a ring for how far the whole
   * MILESTONE has come along.
   *
   * ⚠️ IN FILL MODE IT MUST NOT BE DERIVED FROM `H`. That is not a style preference: the chain
   * H → HERO_PX → the card is taller → the measured box is shorter → H is a closed loop, and it
   * made the whole tower flicker between two layouts every frame. The viewport cannot be moved by
   * any coin, so it is safe.
   */
  const HERO_PX = fill
    ? Math.max(64, Math.min(150, Math.round((box.vh || 900) * 0.095)))
    : Math.max(72, Math.min(104, Math.round(coinPx * 5)));

  /** Progress into the milestone he is currently forging — the ring's job. */
  const intoIngot = balance == null ? 0 : Math.min(1, goldInFrame / PER);
  /** Progress into the coin he is currently earning. */
  const into = balance == null ? 0 : have % unit;
  const nextAt = balance == null ? unit : have + (unit - into);
  const toGo = Math.max(0, unit - into);

  // ── sound ─────────────────────────────────────────────────────────────────
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
   * iOS will not let audio start without a gesture, and the FEED can move the balance with no tap
   * involved. So the context is woken on the first interaction ANYWHERE.
   */
  useEffect(() => {
    const wake = () => { getAudio(); };
    window.addEventListener('pointerdown', wake, { once: true });
    return () => window.removeEventListener('pointerdown', wake);
  }, []);

  /** Milestone crossings, compared against the previous thresholds so a jump fires ONCE. */
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
      ? { label: `${fmtMile(bigLvl * bigNotch)} banked`, big: true, id: Date.now() }
      : { label: `${fmtMile(lvl * notch)} forged`, big: false, id: Date.now() });
    setBurst(Date.now());
    // The FORGE figure is the bright one; it lands with the piece, not with the banner — and the
    // bar gets the longest run of notes, because it is the rarest thing in the game.
    const s = window.setTimeout(() => {
      if (soundRef.current) playChime(hitBig ? 'bar' : 'ingot');
    }, 120);
    const t = window.setTimeout(() => { setAward(null); setBurst(null); }, hitBig ? 3200 : 2600);
    return () => { window.clearTimeout(s); window.clearTimeout(t); };
  }, [balance, have, notch, bigNotch, fmtMile]);

  /** One clink per deposit — a batch of five coins is ONE sound, not five overlapping ones. */
  useEffect(() => {
    if (!freshRange || !soundRef.current) return;
    // A batch that FORGED a piece gets the forge sound instead; two chimes on top of each other is
    // just noise.
    if (forgedKey != null) return;
    playChime('coin');
  }, [freshRange, forgedKey]);

  /** The split gets its own figure — a descending one, so it is not mistaken for a win. */
  useEffect(() => {
    if (restoredKeys == null || !soundRef.current) return;
    playChime('split');
  }, [restoredKeys]);

  /** Which piece holds the record, by coin index — arithmetic, so it cannot drift. */
  const peakUnits = peak == null || !Number.isFinite(peak)
    ? 0
    : Math.max(0, Math.min(unitsTotal, Math.floor(peak / unit)));
  const recordAt = peakUnits > filled && peakUnits > 0 ? peakUnits - 1 : -1;

  /**
   * The pieces a split handed back, in stack order. The flare sits at the base of the LOWEST of
   * them, and that position is exact because every piece carries the height below it and its own
   * index (one gap per piece below).
   */
  const restored = restoredKeys ? pieces.filter((p) => restoredKeys.has(pieceKey(p))) : [];
  const restoreOrder = new Map(restored.map((p, i) => [pieceKey(p), i]));
  const flare = restored[0] ?? null;

  /** The biggest thing he actually holds is what names the count: "2 / 5 bars", else ingots. */
  const tierChip = barsDone > 0
    ? `${barsDone.toLocaleString()} / ${barsTotal.toLocaleString()} bars`
    : `${ingotsDone.toLocaleString()} / ${ingotsTotal.toLocaleString()} ingots`;

  return (
    <div
      className={`relative rounded-xl border border-white/10 bg-white/[0.03] p-3${
        fill ? ' flex min-h-0 flex-1 flex-col' : ''
      }`}
    >
      <style>{COIN_STYLE}</style>

      {/* The milestone wash — a purple glow round the screen edges, because the metal is purple.
          FIXED and pointer-events-none so it covers the viewport without touching layout or
          stealing a click. */}
      {burst != null && (
        <div
          aria-hidden
          className="pf-anim pointer-events-none fixed inset-0 z-[60]"
          style={{
            boxShadow: 'inset 0 0 150px 18px rgba(168,85,247,0.45)',
            animation: 'pfVignette 1300ms ease-out both',
          }}
        />
      )}

      {/* The award banner. Keyed on the award id so a second award re-runs the animation. */}
      {award != null && (
        <div
          key={award.id}
          className="pf-anim pointer-events-none absolute left-1/2 top-2 z-20 whitespace-nowrap"
          style={{ animation: `pfBannerIn ${award.big ? 3200 : 2600}ms ease-out both` }}
        >
          <span className={`rounded-full px-3 py-1 text-[11px] font-black tracking-wide shadow-lg ${
            award.big
              ? 'bg-gradient-to-r from-fuchsia-300 via-violet-300 to-cyan-200 text-violet-950'
              : 'border border-violet-400/40 bg-[#09040f] text-violet-200'
          }`}>
            {award.big ? '★ ' : '◆ '}{award.label}
          </span>
        </div>
      )}

      <div className="mb-2.5 flex shrink-0 items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Coins className="h-4 w-4 text-amber-300" />
          <h3 className="text-sm font-bold text-amber-200">The Coin Tower</h3>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="mr-1 hidden text-[10px] uppercase tracking-wider text-white/30 sm:inline">
            {tierChip}
          </span>
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

      {/* THE HERO COIN — the next one, big enough to actually see. Its ring tracks the MILESTONE
          (the ingot being forged), because the ten slots below already count the coins one by one;
          the ring would be a second, slower copy of the same information. */}
      {balance != null && (
        <div className="relative mb-3 flex shrink-0 items-center gap-3">
          <div className="relative shrink-0" style={{ height: HERO_PX, width: HERO_PX }}>
            <svg viewBox="0 0 44 44" className="h-full w-full -rotate-90">
              <circle cx="22" cy="22" r="19" fill="none" stroke="rgba(255,255,255,0.09)" strokeWidth="3" />
              <circle
                cx="22" cy="22" r="19" fill="none" stroke="url(#pfGoldRing)" strokeWidth="3"
                strokeLinecap="round"
                strokeDasharray={2 * Math.PI * 19}
                strokeDashoffset={2 * Math.PI * 19 * (1 - intoIngot)}
                className="transition-[stroke-dashoffset] duration-700 ease-out"
              />
              <defs>
                <linearGradient id="pfGoldRing" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0%" stopColor="#fde68a" />
                  <stop offset="100%" stopColor="#a855f7" />
                </linearGradient>
              </defs>
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
              <span
                className="font-black text-amber-200"
                style={{ fontSize: Math.max(11, Math.round(HERO_PX * 0.19)) }}
              >
                {Math.round(intoIngot * 100)}%
              </span>
            </div>
            {burst != null && Array.from({ length: 6 }, (_, i) => {
              const ang = (i / 6) * Math.PI * 2 - Math.PI / 2;
              return (
                <div
                  key={`${burst}-${i}`}
                  className="pf-anim pointer-events-none absolute left-1/2 top-1/2 h-1.5 w-3 rounded-full"
                  style={{
                    background: 'radial-gradient(circle at 34% 26%, #f5d0fe, #c084fc 45%, #7c3aed)',
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
              {fmt(toGo)} to go · {goldInFrame} of {PER} coins to your {fmtMile((ingotsDone + 1) * PER * unit)} ingot
            </div>
          </div>
        </div>
      )}

      {/*
        THE COLUMN. A single stack, ground up: ingots, then the milestone in flight. Nothing here
        animates a SIZE — only transform, opacity and filter — because a changing size would feed
        the very measurement the coin height comes from.
      */}
      <div
        ref={guardRef}
        className={`relative${fill ? ' flex min-h-0 flex-1 items-end justify-center' : ' flex justify-center'}`}
      >
        <div
          className="relative flex flex-col-reverse items-center overflow-hidden rounded-xl border border-white/[0.06] bg-white/[0.015]"
          style={{
            width: COL_W,
            height: STACK_H,
            gap: GAP,
          }}
        >
          {pieces.map((p) => {
            const isBar = p.kind === 'bar';
            const isIngot = p.kind === 'ingot';
            const isTier = p.tier !== 'coin';
            const isGold = p.kind === 'gold';
            const isEmpty = p.kind === 'empty';
            const key = pieceKey(p);
            const isForged = forgedKey === key;
            const restoredIdx = restoreOrder.get(key) ?? -1;
            const isNext = isEmpty && p.from === filled;
            const freshIdx = isGold && freshRange
              && p.from >= freshRange.from && p.from < freshRange.from + freshRange.count
              ? p.from - freshRange.from
              : -1;
            const holdsRecord = !isEmpty && recordAt >= p.from && recordAt <= p.to;
            const px = Math.max(1, Math.floor(p.units * H * 10) / 10);
            /*
             * THE BAR IS A RECTANGLE. Its corners are what make it read as a forged bar rather than
             * just a bigger disc — the same trick as the gradient, and the reason the ladder is
             * legible without reading a number: disc, wide plate, flat bar.
             */
            const radius = isBar && !barTall ? Math.max(3, Math.round(px * 0.16)) : 999;
            /*
             * THE RECORD sits at the exact boundary, which for a single coin is its top edge. A
             * forged piece holds a whole run of coins, so snapping the rule to its top would
             * overstate the high-water mark by up to the piece itself ($999 on an ingot); marking
             * it proportionally up the piece is the honest place, and reads as a fine line across
             * the metal.
             */
            const span = p.to - p.from + 1;
            const recordFrac = span <= 1 ? 1 : Math.min(1, Math.max(0, (peakUnits - p.from) / span));

            return (
              <div
                key={key}
                data-piece={p.kind}
                data-tier={p.tier}
                data-coin={p.from}
                title={isBar ? `Ten ingots forged · ${fmtMile(p.to * unit + unit)}`
                  : isIngot ? `Ten coins forged · ${fmtMile(p.to * unit + unit)}`
                  : `${fmt(p.from * unit)} → ${fmt((p.from + 1) * unit)}`}
                className="pf-anim relative shrink-0"
                style={{
                  height: px,
                  width: wfPct(p.wf),
                  borderRadius: radius,
                  ...(isBar ? {
                    background: PLAT_FILL,
                    boxShadow: PLAT_SHADOW,
                    ...(isForged
                      ? { animation: 'pfIngotForge 760ms cubic-bezier(.16,1,.3,1) both' }
                      : null),
                  } : isIngot ? {
                    background: INGOT_FILL,
                    boxShadow: INGOT_SHADOW,
                    ...(isForged
                      ? { animation: 'pfIngotForge 620ms cubic-bezier(.16,1,.3,1) both' }
                      : null),
                  } : isGold ? {
                    background: GOLD_FILL,
                    boxShadow: GOLD_SHADOW,
                    ...(freshIdx >= 0 ? {
                      animation: `pfCoinDrop 340ms cubic-bezier(.16,1,.3,1) ${Math.min(freshIdx, 12) * 34}ms both, `
                               + `pfCoinShine 520ms ease-out ${Math.min(freshIdx, 12) * 34}ms both`,
                    } : null),
                    // A split hands back real pieces — coins out of an ingot, or INGOTS out of a
                    // bar — and every one of them rises out of the line it broke along.
                    ...(restoredIdx >= 0 ? {
                      animation: `pfCoinRise 420ms cubic-bezier(.16,1,.3,1) ${Math.min(restoredIdx, 11) * 42}ms both`,
                    } : null),
                  } : {
                    // Empty sockets stay quiet, but not invisible: his whole tower is empty at $17
                    // (17 dollars is not yet a $100 coin), and a tower you cannot SEE reads as
                    // "there is no tower here".
                    background: 'rgba(255,255,255,0.055)',
                    boxShadow: 'inset 0 0 0 1px rgba(251,191,36,0.22), inset 0 1px 2px rgba(0,0,0,0.5)',
                    ...(isNext ? {
                      boxShadow: 'inset 0 0 0 1px rgba(251,191,36,0.8)',
                      animation: 'pfNextPulse 1.9s ease-in-out infinite',
                    } : null),
                  }),
                  // A restored forged piece (a bar breaking into ingots) rises too, on the same clock.
                  ...(isTier && restoredIdx >= 0 ? {
                    animation: `pfCoinRise 420ms cubic-bezier(.16,1,.3,1) ${Math.min(restoredIdx, 11) * 42}ms both`,
                  } : null),
                }}
              >
                {/* The iridescence, clipped to the piece's own shape. */}
                {isTier && (
                  <div
                    aria-hidden
                    className="pointer-events-none absolute inset-0"
                    style={{
                      background: isBar ? PLAT_IRID : INGOT_IRID,
                      opacity: isBar ? 0.16 : 0.22,
                      borderRadius: radius,
                      mixBlendMode: 'overlay',
                      animation: 'pfIrid 16s linear infinite',
                    }}
                  />
                )}
                {/* The specular sweep across a just-forged piece. */}
                {isForged && (
                  <div
                    aria-hidden
                    className="pointer-events-none absolute inset-0 overflow-hidden"
                    style={{ borderRadius: radius }}
                  >
                    <div
                      className="h-full w-1/3"
                      style={{
                        background: 'linear-gradient(90deg, rgba(255,255,255,0) 0%, rgba(255,255,255,0.95) 50%, rgba(255,255,255,0) 100%)',
                        animation: `pfIngotShine ${isBar ? 900 : 760}ms cubic-bezier(.3,.7,.2,1) 90ms both`,
                      }}
                    />
                  </div>
                )}
                {/* The pieces that merged INTO it, falling — so the merge has a direction. They take
                    the colour of the tier BELOW: ten gold coins into an ingot, ten ingots into a bar. */}
                {isForged && Array.from({ length: isBar ? 9 : 7 }, (_, k) => (
                  <div
                    key={`m${k}`}
                    aria-hidden
                    className="pf-anim pointer-events-none absolute h-1.5 w-3 rounded-full"
                    style={{
                      left: `${6 + k * (88 / (isBar ? 9 : 7))}%`,
                      top: -6,
                      background: isBar ? INGOT_FILL : GOLD_FILL,
                      animation: `pfMergeIn 480ms cubic-bezier(.3,.7,.2,1) ${k * 26}ms both`,
                    }}
                  />
                ))}
                {/* The ring when a piece is forged. */}
                {isForged && (
                  <div
                    aria-hidden
                    className="pf-anim pointer-events-none absolute inset-0 border-2 border-violet-300/80"
                    style={{ borderRadius: radius, animation: 'pfIngotPulse 800ms cubic-bezier(.16,1,.3,1) both' }}
                  />
                )}
                {/*
                  THE RECORD, placed off the piece's own geometry rather than a running offset, so no
                  gap or rounding can drift it. `h-px` is load-bearing: let the label size the box
                  and the rule floats up by half the text height.
                */}
                {holdsRecord && (
                  <div
                    aria-hidden
                    className="pointer-events-none absolute inset-x-0 z-10 flex h-px items-center gap-1.5"
                    style={{ bottom: `${recordFrac * 100}%` }}
                  >
                    <div className="h-px flex-1 bg-gradient-to-r from-transparent via-amber-300/80 to-amber-300/50" />
                    <span className="whitespace-nowrap rounded px-1 text-[9px] font-black uppercase tracking-wider text-amber-300/90">
                      Best
                    </span>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* THE BREAK: a flare at the line it split along — the base of the lowest piece that came
            back, sized to that piece. Exact, because the piece carries the height below it. */}
        {flare != null && (
          <div
            aria-hidden
            className="pf-anim pointer-events-none absolute rounded-full border-2 border-violet-300/70"
            style={{
              left: '50%',
              // marginLeft, not -translate-x-1/2: the animation below owns `transform`.
              marginLeft: -(COL_W + 8) / 2,
              bottom: Math.round(flare.belowUnits * H + flare.idx * GAP),
              width: COL_W + 8,
              height: Math.max(6, Math.round(flare.units * H)),
              animation: 'pfIngotPulse 700ms cubic-bezier(.16,1,.3,1) both',
            }}
          />
        )}

        {/* The record, stated once, over the column. */}
        {recordAt >= 0 && (
          <div className="pointer-events-none absolute left-1/2 top-0 -translate-x-1/2 whitespace-nowrap rounded px-1 text-[9px] font-black uppercase tracking-wider text-amber-300">
            ★ Best {fmt(peak as number)}
          </div>
        )}
      </div>

      <div className="mt-2.5 flex shrink-0 flex-col gap-1 text-[10px]">
        <div className="flex items-center justify-between gap-2">
          <span className={balance == null ? 'text-amber-300/70' : 'text-white/50'}>
            {balance == null
              ? 'waiting on account balance'
              : `${fmt(Math.round(shown))} of ${fmt(target)}`}
          </span>
          <span className="font-bold text-white/40">{tierChip}</span>
        </div>
        {/* The ladder, stated once, because the whole point of a tier is that ten of one become one
            of the next — a rule you should not have to work out from the picture. */}
        <span className="text-white/25">
          {PER} coins = 1 ingot ({fmt(PER * unit)}) · {PER} ingots = 1 bar ({fmt(PER * PER * unit)})
        </span>
      </div>

      {/*
        DEV ONLY — jump the balance to any decade, and toggle which shape the $10,000 tier wears so
        Daniel can look at both on his own device and pick. Gated on `import.meta.env.DEV` AND
        `onNudge` (production passes neither), so this compiles away to `void 0` in the bundle.
      */}
      {import.meta.env.DEV && onNudge && (
        <div className="mt-2 flex shrink-0 flex-wrap items-center gap-1 rounded-md border border-dashed border-rose-400/40 px-2 py-1.5 text-[10px] text-rose-200/80">
          <span className="mr-0.5 font-black uppercase tracking-wider text-rose-300/90">Dev</span>
          {[0, 1000, 10000, 25000, 50000].map((v) => (
            <button
              key={v}
              onClick={() => onNudge(v - have)}
              title={`Jump to ${fmt(v)}`}
              className="rounded border border-rose-300/30 px-1.5 py-0.5 font-bold transition-colors hover:bg-rose-400/20"
            >
              {v === 0 ? 'reset' : `$${v / 1000}k`}
            </button>
          ))}
          <span className="mx-0.5 opacity-40">|</span>
          <button
            onClick={() => setBarTall((v) => !v)}
            title="Compare the two shapes for the $10,000 tier"
            className="rounded border border-rose-300/30 px-1.5 py-0.5 font-bold transition-colors hover:bg-rose-400/20"
          >
            $10k shape: <span className="text-rose-100">{barTall ? 'big ingot' : 'bar'}</span>
          </button>
        </div>
      )}
    </div>
  );
};

export default CoinTower;
