import React from 'react';
import { Lock, Check, Flame } from 'lucide-react';

/**
 * PROGRESS LABS — four genuinely different progress mechanisms, built for real.
 *
 * Daniel, on the tier track: *"don't really see a difference … i want something different. Look up
 * gaming mechanisms for progress bars and give me something different."*
 *
 * He was looking at a row of small tiles and reading it as a legend, not as progress. Fair. So this
 * file builds the four idioms that games actually use for this, at full size, in a strip that sits
 * where he was looking — and DEV-gated so none of it reaches production until he picks one.
 *
 * The idioms, and where each comes from:
 *
 *   1. SEGMENTS — the STEPPED BAR (HP / stamina / ammo). Discretised into the unit you actually
 *      earn, so a block filling is the progress. The twist: the blocks are bracketed in TENS, so the
 *      bar itself shows the tier ladder — ten gold blocks are an ingot, ten of those are a bar.
 *
 *   2. LEVELS — the EXP BAR and the RANK BADGE (every RPG, every ranked ladder). Money becomes XP,
 *      $1,000 is a level, and the badge upgrades every ten levels: Bronze → Silver → Gold →
 *      Platinum → Diamond. Ranks are the mechanic that makes a number into an identity.
 *
 *   3. CHESTS — the REWARD TRACK (battle pass, 66% of top-grossing mobile games). Milestones as
 *      crates: opened, opening, or chained shut. The loot idiom, because a locked thing you can
 *      nearly reach is the whole engine of these systems.
 *
 *   4. SKYLINE — the MONUMENT / BUILDER (city builders, idle games' "prestige towns"). Each $1,000
 *      raises a building and lights its windows. It shows MASS instead of a ratio: you do not read
 *      a percentage, you look at how much city exists. Ends in a skyscraper at the goal.
 *
 * ⚠️ Nothing here invents progress. Every mechanism is a function of the same real balance, they all
 * read the same `notch` ($1,000) that the tower's ingot uses, and a locked chest or a dark building
 * is a promise about the future, never a claim about the present.
 */

export type LabKind = 'segments' | 'levels' | 'chests' | 'skyline';

export const LAB_ORDER: LabKind[] = ['segments', 'levels', 'chests', 'skyline'];
export const LAB_LABEL: Record<LabKind, string> = {
  segments: 'segments', levels: 'levels', chests: 'chests', skyline: 'city',
};
/** For the comparison sheet: the idiom each lab borrows, and from where. */
export const LAB_TITLE: Record<LabKind, string> = {
  segments: 'SEGMENTS — the stepped bar (health / stamina / ammo)',
  levels: 'LEVELS and RANK — the EXP bar (every RPG, every ranked ladder)',
  chests: 'CHESTS — the reward track (battle pass)',
  skyline: 'CITY — the monument (city builders)',
};

/** Ranks by level (a level is one `notch`). Five decades to the $50,000 goal. */
const RANKS = [
  { name: 'Bronze',   from: '#e0a370', via: '#b45309', to: '#5a2c0b' },
  { name: 'Silver',   from: '#f1f5f9', via: '#94a3b8', to: '#3f4a5a' },
  { name: 'Gold',     from: '#fde68a', via: '#f59e0b', to: '#7c2d12' },
  { name: 'Platinum', from: '#e9d5ff', via: '#c084fc', to: '#4c1d95' },
  { name: 'Diamond',  from: '#cffafe', via: '#22d3ee', to: '#0e7490' },
];

const GOLD = 'linear-gradient(180deg, #fffbeb 0%, #fcd34d 34%, #d97706 78%, #92400e 100%)';
const PLAT = 'linear-gradient(180deg, #ffffff 0%, #eef2f8 22%, #b8c4d4 60%, #64748b 100%)';

export const ProgressLabs: React.FC<{
  kind: LabKind;
  /** Where he is. May be negative on the prop side — clamped here, not by callers. */
  value: number;
  /** The goal. */
  target: number;
  /** One notch — $1,000. A block, a level, a building, a chest's step. */
  notch: number;
  format: (n: number) => string;
  compact?: boolean;
}> = ({ kind, value: rawValue, target, notch, format, compact = false }) => {
  const value = Math.max(0, rawValue);

  // ── 1. SEGMENTS — a stepped bar whose segments ARE the tiers ───────────────
  if (kind === 'segments') {
    const blocks = Math.max(1, Math.ceil(target / notch));
    const done = Math.floor(value / notch);
    const head = Math.min(blocks - 1, done);          // the block being earned
    const intoBlock = (value % notch) / notch;
    const groups = Math.ceil(blocks / 10);

    return (
      <div className="mx-auto w-full max-w-[620px]">
        <div className="mb-1 flex items-baseline justify-between text-[10px]">
          <span className="font-black uppercase tracking-wider text-amber-200">
            {done} of {blocks} blocks
          </span>
          <span className="text-white/40">
            {format(Math.max(0, target - value))} to go
          </span>
        </div>

        {/* The bar itself: one block per notch, bracketed in tens so the tiers are visible in it. */}
        <div className={`flex gap-[2px] ${compact ? 'h-5' : 'h-7'}`}>
          {Array.from({ length: blocks }, (_, i) => {
            const lit = i < done;
            const isHead = i === head;
            return (
              <div
                key={i}
                className="relative flex-1 overflow-hidden rounded-[3px]"
                style={{
                  background: lit ? GOLD : 'rgba(255,255,255,0.05)',
                  boxShadow: lit
                    ? 'inset 0 1px 0 rgba(255,255,255,0.7), inset 0 -2px 3px rgba(90,40,0,0.5)'
                    : 'inset 0 0 0 1px rgba(255,255,255,0.09)',
                  // every tenth block is a milestone — the block that completes an ingot
                  outline: (i + 1) % 10 === 0 ? '1px solid rgba(168,85,247,0.55)' : 'none',
                  outlineOffset: 1,
                }}
              >
                {/* the block being earned fills from the bottom, so progress is continuous AND chunky */}
                {isHead && !lit && (
                  <div
                    className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-amber-500/70 to-amber-300/40 transition-[height] duration-700 ease-out"
                    style={{ height: `${intoBlock * 100}%` }}
                  />
                )}
                {isHead && (
                  <div className="absolute inset-0 animate-pulse rounded-[3px] ring-1 ring-amber-200/80" />
                )}
              </div>
            );
          })}
        </div>

        {/* The brackets: a group of ten lit blocks IS an ingot, ten of those a bar. */}
        <div className="mt-1 flex gap-[2px]">
          {Array.from({ length: groups }, (_, g) => {
            const litBlocks = Math.max(0, Math.min(10, done - g * 10));
            return (
              <div key={g} className="flex-1 border-t border-white/10 pt-0.5 text-center">
                <span className={`text-[8px] font-black uppercase tracking-wider ${
                  litBlocks === 10 ? 'text-violet-200' : litBlocks > 0 ? 'text-white/45' : 'text-white/20'
                }`}>
                  {litBlocks === 10 ? `${format(notch * 10)} ✓` : `${litBlocks}/10`}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // ── 2. LEVELS — EXP bar and a rank badge ──────────────────────────────────
  if (kind === 'levels') {
    const level = Math.floor(value / notch);
    const into = (value % notch) / notch;
    const rankIdx = Math.min(RANKS.length - 1, Math.floor(level / 10));
    const rank = RANKS[rankIdx];
    const nextRank = RANKS[Math.min(RANKS.length - 1, rankIdx + 1)];
    const levelsToRank = (rankIdx + 1) * 10 - level;
    const toNext = notch - (value % notch);

    return (
      <div className="mx-auto flex w-full max-w-[620px] items-center gap-3">
        {/* THE BADGE — a metal emblem that upgrades every ten levels. */}
        <div className="relative shrink-0">
          <div
            className={`relative flex items-center justify-center ${compact ? 'h-12 w-12' : 'h-16 w-16'}`}
            style={{
              background: `linear-gradient(150deg, ${rank.from} 0%, ${rank.via} 52%, ${rank.to} 100%)`,
              clipPath: 'polygon(50% 0%, 93% 25%, 93% 75%, 50% 100%, 7% 75%, 7% 25%)',
              filter: 'drop-shadow(0 0 10px rgba(0,0,0,0.6))',
            }}
          >
            <div className="absolute inset-[3px] opacity-90"
              style={{
                background: `linear-gradient(150deg, ${rank.from} 0%, ${rank.via} 60%, ${rank.to} 100%)`,
                clipPath: 'polygon(50% 0%, 93% 25%, 93% 75%, 50% 100%, 7% 75%, 7% 25%)',
                filter: 'brightness(0.72)',
              }}
            />
            <span className="relative text-center leading-none">
              <span className="block text-[9px] font-black uppercase tracking-wider text-white/85">
                {rank.name}
              </span>
              <span className={`block font-black text-white ${compact ? 'text-base' : 'text-xl'}`}>
                {level}
              </span>
            </span>
          </div>
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between">
            <span className="text-sm font-black uppercase tracking-wider text-amber-100">
              Level {level}
            </span>
            <span className="text-[10px] text-white/40">
              {levelsToRank > 0
                ? `${levelsToRank} level${levelsToRank === 1 ? '' : 's'} to ${nextRank.name}`
                : `${rank.name} is maxed`}
            </span>
          </div>

          {/* The EXP bar: one level is one notch, so every $1,000 is a level-up. */}
          <div className={`mt-1 w-full overflow-hidden rounded-full bg-black/50 ${compact ? 'h-3.5' : 'h-5'} ring-1 ring-white/10`}>
            <div
              className="h-full rounded-full transition-[width] duration-700 ease-out"
              style={{ width: `${into * 100}%`, background: GOLD }}
            />
          </div>

          <div className="mt-1 flex items-baseline justify-between text-[10px]">
            <span className="text-amber-200/80">
              {format(Math.round(into * notch))} / {format(notch)} to Level {level + 1}
            </span>
            <span className="text-white/40">next level in {format(Math.max(0, toNext))}</span>
          </div>
        </div>
      </div>
    );
  }

  // ── 3. CHESTS — the reward track ──────────────────────────────────────────
  if (kind === 'chests') {
    const steps = Math.max(1, Math.ceil(target / (notch * 10)));   // one chest per $10,000
    const stepsDone = Math.floor(value / (notch * 10));

    return (
      <div className="mx-auto w-full max-w-[620px]">
        <div className="mb-1.5 flex items-baseline justify-between text-[10px]">
          <span className="font-black uppercase tracking-wider text-amber-200">
            {stepsDone} of {steps} vaults opened
          </span>
          <span className="text-white/40">{format(Math.max(0, target - value))} to go</span>
        </div>
        <div className="flex items-end gap-2">
          {Array.from({ length: steps }, (_, i) => {
            const at = (i + 1) * notch * 10;
            const opened = value >= at;
            const isNext = !opened && i === stepsDone;
            const from = i * notch * 10;
            const prog = isNext ? Math.max(0, Math.min(1, (value - from) / (notch * 10))) : 0;
            return (
              <div key={i} className="flex min-w-0 flex-1 flex-col items-center gap-1">
                {/* THE CHEST — a box with a lid; the lid tilts open when it is earned. */}
                <div className={`relative ${compact ? 'h-8 w-9' : 'h-11 w-12'}`}>
                  <div
                    className="absolute inset-x-0 bottom-0 rounded-[3px] rounded-b-[5px]"
                    style={{
                      height: '62%',
                      background: opened ? PLAT : 'rgba(255,255,255,0.07)',
                      boxShadow: opened
                        ? 'inset 0 1px 0 rgba(255,255,255,0.8), 0 0 12px -2px rgba(226,232,240,0.5)'
                        : 'inset 0 0 0 1px rgba(255,255,255,0.16)',
                    }}
                  />
                  <div
                    className="absolute inset-x-0 origin-bottom-left rounded-[3px] transition-transform duration-500"
                    style={{
                      height: '42%',
                      top: 0,
                      background: opened ? PLAT : 'rgba(255,255,255,0.10)',
                      boxShadow: opened
                        ? 'inset 0 1px 0 rgba(255,255,255,0.85)'
                        : 'inset 0 0 0 1px rgba(255,255,255,0.2)',
                      transform: opened ? 'rotate(-38deg) translateY(-3px)' : 'none',
                    }}
                  />
                  {/* the keyhole / lock, only while it is shut */}
                  {!opened && (
                    <div className="absolute left-1/2 top-[52%] h-1.5 w-1.5 -translate-x-1/2 rounded-full bg-black/70 ring-1 ring-white/25" />
                  )}
                  {isNext && (
                    <div className="pointer-events-none absolute -inset-1 animate-pulse rounded-lg ring-1 ring-amber-300/50" />
                  )}
                  {!opened && !isNext && (
                    <Lock className="absolute -right-1 -top-1 h-3 w-3 text-white/30" strokeWidth={3} />
                  )}
                  {opened && (
                    <Check className="absolute -right-1 -top-1 h-3 w-3 text-emerald-300" strokeWidth={3} />
                  )}
                </div>
                <span className={`text-[9px] font-black tabular-nums ${
                  opened ? 'text-amber-100' : isNext ? 'text-amber-300' : 'text-white/25'
                }`}>
                  {format(at)}
                </span>
                {/* a real progress bar on the vault being opened */}
                <div className={`h-1 w-full overflow-hidden rounded-full bg-white/10 ${isNext ? '' : 'opacity-0'}`}>
                  <div className="h-full rounded-full bg-gradient-to-r from-amber-300 to-amber-500"
                    style={{ width: `${prog * 100}%` }} />
                </div>
                {isNext && (
                  <span className="text-[8px] font-bold text-amber-300/70">{Math.round(prog * 100)}%</span>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // ── 4. SKYLINE — the monument, built one building at a time ───────────────
  const buildings = Math.max(1, Math.ceil(target / notch));   // one building per $1,000
  const built = Math.floor(value / notch);

  return (
    <div className="mx-auto w-full max-w-[760px]">
      <div className="mb-1 flex items-baseline justify-between text-[10px]">
        <span className="font-black uppercase tracking-wider text-amber-200">
          {built} of {buildings} buildings raised
        </span>
        <span className="text-white/40">the last one is the skyscraper</span>
      </div>

      {/* The city. Deterministic heights so the skyline looks planned and never reshuffles. */}
      <div
        className={`relative flex items-end gap-[2px] ${compact ? 'h-12' : 'h-20'}`}
        style={{ background: 'linear-gradient(180deg, transparent 0%, rgba(251,191,36,0.05) 100%)' }}
      >
        {Array.from({ length: buildings }, (_, i) => {
          const isGoal = i === buildings - 1;
          const up = i < built;
          // a repeatable "random" silhouette
          const hUnits = isGoal ? 100 : 26 + ((i * 37) % 13) * 4 + (i % 3) * 3;
          const w = 100 / buildings;
          return (
            <div
              key={i}
              className="relative h-full"
              style={{ width: `${w}%`, minWidth: 3 }}
              title={`${format((i + 1) * notch)}`}
            >
              <div
                className="absolute bottom-0 w-full rounded-t-[2px] transition-[height] duration-700 ease-out"
                style={{
                  height: `${hUnits}%`,
                  background: up
                    ? isGoal
                      ? 'linear-gradient(180deg, #ffffff 0%, #e2e8f0 30%, #94a3b8 70%, #334155 100%)'
                      : 'linear-gradient(180deg, #fcd34d 0%, #b45309 60%, #4a2508 100%)'
                    : 'transparent',
                  boxShadow: up
                    ? isGoal
                      ? '0 0 14px -2px rgba(226,232,240,0.6), inset 0 1px 0 rgba(255,255,255,0.8)'
                      : '0 0 10px -3px rgba(251,191,36,0.55), inset 0 1px 0 rgba(255,255,255,0.5)'
                    : 'inset 0 0 0 1px rgba(255,255,255,0.09)',
                }}
              >
                {/* lit windows — a building with its lights on is a building that exists */}
                {up && (
                  <div
                    className="absolute inset-x-[18%] top-[14%] bottom-[10%] opacity-70"
                    style={{
                      backgroundImage:
                        'radial-gradient(circle at 50% 50%, rgba(255,251,235,0.95) 0.5px, transparent 1px)',
                      backgroundSize: '3px 4px',
                    }}
                  />
                )}
              </div>
              {isGoal && (
                <div className="absolute bottom-full left-1/2 h-2 w-px -translate-x-1/2 bg-amber-200/70" />
              )}
            </div>
          );
        })}
      </div>
      <div className="h-px w-full bg-gradient-to-r from-transparent via-white/25 to-transparent" />

      {/* The one number that matters, stated the goal-gradient way: what is LEFT. */}
      <div className="mt-1 flex items-center justify-center gap-2 text-[10px]">
        <Flame className="h-3 w-3 text-amber-300" />
        <span className="font-black uppercase tracking-wider text-amber-200">
          {format(Math.max(0, target - value))} to the skyscraper
        </span>
      </div>
    </div>
  );
};

export default ProgressLabs;
