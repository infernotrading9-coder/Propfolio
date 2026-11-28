import React from 'react';
import { Lock, Check, Flag } from 'lucide-react';

/**
 * THE TIER TRACK — the whole ladder, shown at once.
 *
 * Daniel: *"i dont see the bar"*. He was right, and it was a design mistake: the tower only draws
 * what he has EARNED, so the $10,000 tier did not exist anywhere on screen until he got there. No
 * game does that — a battle pass shows the locked tiers ahead (66% of top-grossing mobile games run
 * one), and the reason is that seeing the locked thing is the point.
 *
 * So this is the ladder as a reward track: every rung from the coin up to the goal, with the ones he
 * has reached lit in their real metal, the one he is climbing toward glowing with its progress, and
 * the rest as locked silhouettes carrying their price.
 *
 * WHY IT MATTERS BEYOND LOOKING NICE (this is the researched part):
 *   - goal-gradient effect (Hull 1932, Kivet et al. 2006): effort rises with PROXIMITY to a goal, so
 *     people are driven by how much is LEFT, not how far they have come;
 *   - endowed progress (Nunes & Drèze 2006): showing advancement already made increases persistence;
 *   - goal visualisation: a visible finish line increases effort toward it.
 * $50,000 from $17 is 0.03% — as one continuous bar that is a wall, not motivation. Four named rungs
 * he can actually finish is the same information, aimed at how people actually behave.
 *
 * ⚠️ IT INVENTS NOTHING. A locked tile is a promise ("this is what $10,000 looks like"), never a
 * claim — no artificial head start, no fake fill. The progress on the NEXT tile is real money.
 */

export interface Rung {
  /** The value this rung is reached at. */
  at: number;
  /** What this much money becomes — "ingot", "bar". */
  label: string;
  /** width ÷ height, so the tile draws the shape honestly (a bar is flat, a coin is not). */
  aspect: number;
  /** The metal, straight from the tower so the two can never disagree. */
  fill: string;
  shadow: string;
  radius: number;
}

export const TierTrack: React.FC<{
  /** One coin — the bottom rung, $100. */
  unit: number;
  /** The goal, the top rung. */
  target: number;
  /** Where he actually is. */
  value: number;
  format: (n: number) => string;
  /** The rungs above the coin, ascending: $1,000 ingot, $10,000 bar. */
  rungs: Rung[];
  /** The metal a LOCKED rung is drawn as — silhouette grey, not a metal he has not earned. */
  compact?: boolean;
}> = ({ unit, target, value, format, rungs, compact = false }) => {
  type Step = {
    kind: 'coin' | 'goal' | 'rung';
    at: number;
    label: string;
    aspect: number;
    fill: string;
    shadow: string;
    radius: number;
  };

  const steps: Step[] = React.useMemo(() => {
    const up = [...rungs].sort((a, b) => a.at - b.at);
    return [
      {
        kind: 'coin' as const, at: unit, label: 'coin',
        aspect: 2.4, fill: 'radial-gradient(circle at 34% 26%, #fffbeb 0%, #fcd34d 42%, #d97706 100%)',
        shadow: '0 0 8px -2px rgba(251,191,36,0.8), inset 0 1px 0 rgba(255,255,255,0.6)', radius: 999,
      },
      ...up.map((r) => ({ kind: 'rung' as const, at: r.at, label: r.label, aspect: r.aspect, fill: r.fill, shadow: r.shadow, radius: r.radius })),
      // The goal is not a metal — it is the end of the ladder.
      { kind: 'goal' as const, at: target, label: 'goal', aspect: 1, fill: '', shadow: '', radius: 0 },
    ];
  }, [rungs, unit, target]);

  /*
   * The state of every rung, from ONE pass: `next` is the first rung above him, and everything past
   * that is locked. Deriving it rather than storing it means the track can never drift out of step
   * with the tower, which reads the same number.
   */
  const nextIdx = steps.findIndex((s) => value < s.at);

  const W = compact ? 34 : 52;

  return (
    // Capped and centred: four tiles stretched across a 1400px desktop reads as a table, not a
    // ladder. At 520px every rung keeps its shape and the rail between them stays visible.
    <div className="mx-auto w-full max-w-[520px]">
      <div className="flex items-stretch">
        {steps.map((s, i) => {
          const done = value >= s.at;
          const isNext = i === nextIdx;
          const locked = !done && !isNext;
          // Real progress toward the next rung, measured from the rung BELOW it.
          const from = i === 0 ? 0 : steps[i - 1].at;
          const prog = isNext
            ? Math.max(0, Math.min(1, (value - from) / Math.max(1, s.at - from)))
            : done ? 1 : 0;

          return (
            <React.Fragment key={`${s.kind}-${s.at}`}>
              {i > 0 && (
                <div className="flex shrink-0 items-center px-0.5" style={{ width: compact ? 10 : 20 }}>
                  <div className={`h-px w-full ${done ? 'bg-amber-300/70' : 'bg-white/12'}`} />
                </div>
              )}

              <div className="flex min-w-0 flex-1 flex-col items-center gap-0.5">
                {/*
                  A fixed-height slot for the object, so every tile's label sits on one line no
                  matter how tall its shape is — a coin and a bar must not stagger the row.
                */}
                <div
                  className={`relative flex w-full items-center justify-center ${compact ? 'h-7' : 'h-11'}`}
                >
                  {s.kind === 'goal' ? (
                    <Flag
                      className={locked ? 'text-white/25' : isNext ? 'text-amber-300' : 'text-amber-300'}
                      style={{ width: W * 0.55, height: W * 0.55 }}
                    />
                  ) : (
                    <div
                      style={{
                        width: W,
                        aspectRatio: `${s.aspect}`,
                        borderRadius: s.radius === 999 ? 999 : Math.max(1, Math.round(W / s.aspect * 0.16)),
                        background: locked ? 'rgba(255,255,255,0.06)' : s.fill,
                        boxShadow: locked
                          ? 'inset 0 0 0 1px rgba(255,255,255,0.16)'
                          : s.shadow,
                        // Locked is a silhouette: a shape he can read, not a metal he has not earned.
                        opacity: locked ? 1 : (isNext ? 0.92 : 1),
                        filter: locked ? 'grayscale(1) brightness(0.55)' : 'none',
                      }}
                    />
                  )}

                  {/* The state badge, floating on the tile's own corner. */}
                  <span className="absolute -right-0.5 -top-0.5">
                    {done && !isNext && (
                      <Check className="h-3 w-3 text-emerald-300" strokeWidth={3} />
                    )}
                    {locked && <Lock className="h-3 w-3 text-white/25" strokeWidth={3} />}
                  </span>
                </div>

                <div className={`font-black tabular-nums leading-none ${
                  locked ? 'text-white/30' : isNext ? 'text-amber-200' : 'text-amber-100'
                } ${compact ? 'text-[10px]' : 'text-[12px]'}`}>
                  {format(s.at)}
                </div>

                <div className={`truncate text-center uppercase leading-none tracking-wider ${
                  locked ? 'text-white/25' : isNext ? 'text-amber-300/80' : 'text-white/45'
                } ${compact ? 'text-[8px]' : 'text-[9px]'}`}>
                  {s.kind === 'goal'
                    ? (locked ? 'goal · locked' : isNext ? 'the goal' : 'goal reached')
                    : s.label}
                </div>

                {/* Real progress, and only on the rung he is actually on. */}
                <div className={`w-full overflow-hidden rounded-full bg-white/10 ${compact ? 'h-[3px]' : 'h-1'} ${
                  isNext ? 'opacity-100' : 'opacity-0'
                }`}>
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-amber-300 to-amber-500 transition-[width] duration-700 ease-out"
                    style={{ width: `${prog * 100}%` }}
                  />
                </div>
                {isNext && !compact && (
                  <div className="text-[9px] font-bold text-amber-300/70">
                    {Math.round(prog * 100)}% to it
                  </div>
                )}
              </div>
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
};

export default TierTrack;
