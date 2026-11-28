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
const playChime = (kind: 'coin' | 'ingot' | 'split') => {
  const ctx = getAudio();
  if (!ctx) return;
  const notes = kind === 'coin' ? [1568, 2093]
    : kind === 'ingot' ? [784, 1047, 1319, 1568, 2093]
    : [1319, 988, 784];
  const step = kind === 'coin' ? 0 : kind === 'split' ? 0.1 : 0.055;
  const tail = kind === 'coin' ? 0.22 : 0.5;
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
  /** 'ingot' = a forged $1,000, 'gold' = a filled coin, 'empty' = a slot still to earn. */
  kind: 'ingot' | 'gold' | 'empty';
  /** The coin index range this piece stands for, so the record rule can be placed on it. */
  from: number;
  to: number;
  /** Height in coin heights — the single number the whole layout is a multiple of. */
  units: number;
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

  // ── the numbers ───────────────────────────────────────────────────────────
  const PER = Math.max(2, Math.round(coinsPerTower));          // coins per ingot — 10
  const unitsTotal = Math.max(1, Math.ceil(target / unit));    // the whole climb, in coins
  const filled = balance == null
    ? 0
    : Math.max(0, Math.min(unitsTotal, Math.floor(have / unit)));
  const ingotsDone = Math.floor(filled / PER);
  const ingotsTotal = Math.max(1, Math.ceil(unitsTotal / PER));
  /** The slot the current milestone starts at, and how many slots it has (usually 10). */
  const mileStart = ingotsDone * PER;
  const frameSlots = Math.max(0, Math.min(PER, unitsTotal - mileStart));
  const goldInFrame = Math.max(0, filled - mileStart);

  /**
   * THE STACK, ground up: the ingots he has forged, then the milestone in progress (its filled
   * coins, then its empty sockets). Nothing is drawn that is not either banked or earnable.
   */
  const pieces: Piece[] = React.useMemo(() => {
    const out: Piece[] = [];
    for (let i = 0; i < ingotsDone; i++) {
      out.push({ kind: 'ingot', from: i * PER, to: Math.min(i * PER + PER - 1, unitsTotal - 1), units: INGOT_H });
    }
    for (let k = 0; k < frameSlots; k++) {
      const idx = mileStart + k;
      out.push({
        kind: k < goldInFrame ? 'gold' : 'empty',
        from: idx, to: idx, units: 1,
      });
    }
    return out;
  }, [ingotsDone, frameSlots, goldInFrame, mileStart, PER, unitsTotal]);

  /** Everything above the ground, in coin heights. */
  const totalUnits = pieces.reduce((a, p) => a + p.units, 0) || 1;

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
   * Then cap it by the width: the column is `INGOT_W_F` gold-coins wide, so at a coin aspect of
   * GOLD_ASPECT the widest it may stand is `INGOT_W_F · GOLD_ASPECT · h`.
   */
  const geo = React.useMemo(() => {
    const count = pieces.length;
    const gaps = Math.max(0, count - 1);
    const availW = (box.w || 0) - 8;                 // a little breathing room off the edges
    const widthCap = availW > 0 ? availW / (INGOT_W_F * GOLD_ASPECT) : Infinity;
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
    h = Math.max(2, Math.floor(h * 100) / 100);
    return { h, gap };
  }, [fill, box.w, box.h, pieces.length, totalUnits, coinPx]);

  const H = geo.h;                                   // one gold coin's height
  /** Both come straight out of the solve — never re-derived here, or the two disagree. */
  const GAP = geo.gap;
  const COL_W = Math.max(6, Math.round(INGOT_W_F * GOLD_ASPECT * H));   // the column's width
  const GOLD_W = Math.floor((COL_W / INGOT_W_F) * 10) / 10;
  const STACK_H = Math.floor(totalUnits * H + (pieces.length - 1) * GAP);

  // ── animation triggers, held in STATE ─────────────────────────────────────
  /**
   * ⚠️ HELD IN STATE, NOT DERIVED FROM A REF. A per-render ref diff does not work here and it is
   * subtle: the count-up re-renders every frame, so on the very next frame the diff reports "no
   * change", React pulls the inline `animation` style off the element, and the animation is
   * CANCELLED about 16ms in — looking like no animation at all. State keeps the flag set for the
   * life of the animation and then clears it.
   */
  const [freshRange, setFreshRange] = useState<{ from: number; count: number } | null>(null);
  /** The ingot index just forged, and whether an ingot was just SPLIT (he went back under). */
  const [justForged, setJustForged] = useState<number | null>(null);
  const [splitAt, setSplitAt] = useState<number | null>(null);
  const prevFilled = useRef<number | null>(null);
  const prevIngots = useRef<number | null>(null);

  const shown = useCountUp(balance);

  useEffect(() => {
    if (balance == null) return;
    const prevIng = prevIngots.current;
    prevIngots.current = ingotsDone;
    if (prevIng == null || ingotsDone === prevIng) return;   // first paint is not an arrival
    if (ingotsDone > prevIng) {
      setJustForged(ingotsDone - 1);
      const t = window.setTimeout(() => setJustForged(null), 1500);
      return () => window.clearTimeout(t);
    }
    /*
     * Going UNDER a milestone: the ingot breaks back into its ten coins.
     * ⚠️ A bare flag, not an index. The restored coins live in the NEW frame (`mileStart` is the
     * first of them), and an earlier version stored `mileStart + goldHeld` — the index AFTER the
     * last one — so no coin ever matched and the split played as a silent vanish.
     */
    setSplitAt(Date.now());
    const t = window.setTimeout(() => setSplitAt(null), 1200);
    return () => window.clearTimeout(t);
  }, [balance, ingotsDone, PER]);

  useEffect(() => {
    if (balance == null) return;
    const prev = prevFilled.current;
    prevFilled.current = filled;
    if (prev == null || filled <= prev) return;
    const count = filled - prev;
    setFreshRange({ from: filled - count, count });
    const t = window.setTimeout(() => setFreshRange(null), 900 + count * 40);
    return () => window.clearTimeout(t);
  }, [balance, filled]);

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
    // The FORGE figure is the bright one; it lands with the ingot, not with the banner.
    const s = window.setTimeout(() => {
      if (soundRef.current) playChime(hitLvl && !hitBig ? 'ingot' : 'ingot');
    }, 120);
    const t = window.setTimeout(() => { setAward(null); setBurst(null); }, hitBig ? 3200 : 2600);
    return () => { window.clearTimeout(s); window.clearTimeout(t); };
  }, [balance, have, notch, bigNotch, fmtMile]);

  /** One clink per deposit — a batch of five coins is ONE sound, not five overlapping ones. */
  useEffect(() => {
    if (!freshRange || !soundRef.current) return;
    // A batch that FORGED an ingot gets the forge sound instead; two chimes on top of each other
    // is just noise.
    if (justForged != null) return;
    playChime('coin');
  }, [freshRange, justForged]);

  /** The split gets its own figure — a descending one, so it is not mistaken for a win. */
  useEffect(() => {
    if (splitAt == null || !soundRef.current) return;
    playChime('split');
  }, [splitAt]);

  /** Which piece holds the record, by coin index — arithmetic, so it cannot drift. */
  const peakUnits = peak == null || !Number.isFinite(peak)
    ? 0
    : Math.max(0, Math.min(unitsTotal, Math.floor(peak / unit)));
  const recordAt = peakUnits > filled && peakUnits > 0 ? peakUnits - 1 : -1;

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
            {ingotsDone} / {ingotsTotal} ingots
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
          {pieces.map((p, i) => {
            const isIngot = p.kind === 'ingot';
            const isGold = p.kind === 'gold';
            const isFreshIngot = isIngot && justForged === i;
            const isEmpty = p.kind === 'empty';
            const isNext = isEmpty && p.from === filled;
            const freshIdx = isGold && freshRange
              && p.from >= freshRange.from && p.from < freshRange.from + freshRange.count
              ? p.from - freshRange.from
              : -1;
            // Going under: every coin of the new frame rises out of the ingot that broke.
            const risingIdx = isGold && splitAt != null ? Math.min(11, p.from - mileStart) : -1;
            const holdsRecord = !isEmpty && recordAt >= p.from && recordAt <= p.to;

            return (
              <div
                key={`${p.kind}-${p.from}`}
                data-piece={p.kind}
                data-coin={p.from}
                title={isIngot
                  ? `Ten coins forged · ${fmtMile(p.to * unit + unit)}`
                  : `${fmt(p.from * unit)} → ${fmt((p.from + 1) * unit)}`}
                className="pf-anim relative shrink-0"
                style={{
                  height: Math.max(1, Math.floor(p.units * H * 10) / 10),
                  width: isIngot ? '100%' : GOLD_W,
                  borderRadius: 999,
                  ...(isIngot ? {
                    background: INGOT_FILL,
                    boxShadow: INGOT_SHADOW,
                    ...(isFreshIngot
                      ? { animation: 'pfIngotForge 620ms cubic-bezier(.16,1,.3,1) both' }
                      : null),
                  } : isGold ? {
                    background: GOLD_FILL,
                    boxShadow: GOLD_SHADOW,
                    ...(freshIdx >= 0 ? {
                      animation: `pfCoinDrop 340ms cubic-bezier(.16,1,.3,1) ${Math.min(freshIdx, 12) * 34}ms both, `
                               + `pfCoinShine 520ms ease-out ${Math.min(freshIdx, 12) * 34}ms both`,
                    } : null),
                    ...(risingIdx >= 0 ? {
                      animation: `pfCoinRise 420ms cubic-bezier(.16,1,.3,1) ${Math.min(risingIdx, 11) * 42}ms both`,
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
                }}
              >
                {/* The iridescence, clipped to the ingot's own shape. */}
                {isIngot && (
                  <div
                    aria-hidden
                    className="pointer-events-none absolute inset-0 rounded-full"
                    style={{
                      background: INGOT_IRID,
                      opacity: 0.22,
                      mixBlendMode: 'overlay',
                      animation: 'pfIrid 16s linear infinite',
                    }}
                  />
                )}
                {/* The specular sweep across a just-forged ingot. */}
                {isFreshIngot && (
                  <div
                    aria-hidden
                    className="pointer-events-none absolute inset-0 overflow-hidden rounded-full"
                  >
                    <div
                      className="h-full w-1/3"
                      style={{
                        background: 'linear-gradient(90deg, rgba(255,255,255,0) 0%, rgba(255,255,255,0.95) 50%, rgba(255,255,255,0) 100%)',
                        animation: 'pfIngotShine 760ms cubic-bezier(.3,.7,.2,1) 90ms both',
                      }}
                    />
                  </div>
                )}
                {/* The ten coins falling INTO it — the merge gets a direction. */}
                {isFreshIngot && Array.from({ length: 7 }, (_, k) => (
                  <div
                    key={`m${k}`}
                    aria-hidden
                    className="pf-anim pointer-events-none absolute h-1.5 w-3 rounded-full"
                    style={{
                      left: `${8 + k * 13}%`,
                      top: -6,
                      background: GOLD_FILL,
                      animation: `pfMergeIn 480ms cubic-bezier(.3,.7,.2,1) ${k * 26}ms both`,
                    }}
                  />
                ))}
                {/* The ring when a milestone is forged. */}
                {isFreshIngot && (
                  <div
                    aria-hidden
                    className="pf-anim pointer-events-none absolute inset-0 rounded-full border-2 border-violet-300/80"
                    style={{ animation: 'pfIngotPulse 800ms cubic-bezier(.16,1,.3,1) both' }}
                  />
                )}
                {/*
                  THE RECORD. A gold hairline at the top edge of the piece that holds it — which is
                  exactly the boundary where the best fill ever reached, because the record is
                  always at a coin boundary and a piece ends at one. Anchored to `100%` rather than
                  computed from offsets, so no gap or rounding can drift it.
                  `h-px` is load-bearing: let the label size the box and the rule floats up.
                */}
                {holdsRecord && (
                  <div
                    aria-hidden
                    className="pointer-events-none absolute inset-x-0 z-10 flex h-px items-center gap-1.5"
                    style={{ bottom: '100%' }}
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

        {/* The break, when an ingot gave its coins back: a flare at the line it split along, which
            is the base of the frame that now sits where the ingot was. */}
        {splitAt != null && (
          <div
            aria-hidden
            className="pf-anim pointer-events-none absolute rounded-full border-2 border-violet-300/70"
            style={{
              left: '50%',
              // marginLeft, not -translate-x-1/2: the animation below owns `transform`.
              marginLeft: -(COL_W + 8) / 2,
              bottom: Math.round(ingotsDone * (INGOT_H * H + GAP)),
              width: COL_W + 8,
              height: Math.max(6, Math.round(INGOT_H * H)),
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

      <div className="mt-2.5 flex shrink-0 items-center justify-between gap-2 text-[10px]">
        <span className={balance == null ? 'text-amber-300/70' : 'text-white/50'}>
          {balance == null
            ? 'waiting on account balance'
            : `${fmt(Math.round(shown))} of ${fmt(target)}`}
        </span>
        <span className="text-white/35">
          {ingotsDone.toLocaleString()} of {ingotsTotal.toLocaleString()} ingots · {PER} × {fmt(unit)} = {fmt(PER * unit)}
        </span>
      </div>
    </div>
  );
};

export default CoinTower;
