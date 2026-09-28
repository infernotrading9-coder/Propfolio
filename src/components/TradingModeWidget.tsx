import React, { useState, useEffect, useRef } from 'react';
import { Shield, AlertTriangle, Zap, ChevronDown, ChevronUp, RefreshCw } from 'lucide-react';

interface TradingModeState {
  score: number;
  mode: string;
  evalCount: number;
  fundedCount: number;
  liveCount: number;
  cashOnHand: number;
  totalDebt: number;
  maxEvalLoss: number;
  maxFundedLoss: number;
  maxLiveLoss: number;
  notes: string | null;
  rules: Record<string, string[]>;
}

const MODES = [
  { key: 'survival',   label: 'Survival',   color: '#dc2626', icon: Shield,       cushion: 3,   sort: 1 },
  { key: 'defensive',  label: 'Defensive',  color: '#ef4444', icon: Shield,       cushion: 7,   sort: 2 },
  { key: 'cautious',   label: 'Cautious',   color: '#f59e0b', icon: AlertTriangle, cushion: 10,  sort: 3 },
  { key: 'balanced',   label: 'Balanced',   color: '#22c55e', icon: Zap,           cushion: 15,  sort: 4 },
  { key: 'confident',  label: 'Confident',  color: '#06b6d4', icon: Zap,           cushion: 20,  sort: 5 },
  { key: 'aggressive', label: 'Aggressive', color: '#a855f7', icon: Zap,           cushion: 999, sort: 6 },
];

const MODE_META: Record<string, { label: string; color: string }> = Object.fromEntries(
  MODES.map(m => [m.key, { label: m.label, color: m.color }])
);

const TICK_ANGLES = [0, 15, 30, 45, 60, 75, 90, 105, 120, 135, 150, 165, 180];
function tickColor(deg: number): string {
  if (deg <= 30) return '#dc2626';
  if (deg <= 60) return '#ef4444';
  if (deg <= 90) return '#f59e0b';
  if (deg <= 120) return '#22c55e';
  if (deg <= 150) return '#06b6d4';
  return '#a855f7';
}

const DEFAULT_STATE: TradingModeState = {
  score: 5, mode: 'survival', evalCount: 0, fundedCount: 0, liveCount: 0,
  cashOnHand: 0, totalDebt: 0, maxEvalLoss: 2, maxFundedLoss: 1, maxLiveLoss: 0,
  notes: null, rules: {
    survival: [
      'One account at a time — no exceptions',
      'No copy trading — you are one loss from zero',
      'No new eval purchases — preserve every dollar',
      'If you lose your last eval, STOP. Come back when you have capital.',
    ],
    defensive: [
      'One account at a time',
      'No copy trading — not enough accounts to risk it',
      'Can buy 1-2 evals to replace losses only',
      'If you lose 2 evals in one session, STOP for the day',
    ],
    cautious: [
      '1-2 accounts at a time — all individual',
      'No copy trading until you have 5 funded accounts',
      'Can buy 2-3 evals to replace losses',
      'If you lose 3 evals in one session, STOP',
    ],
    balanced: [
      '2-3 accounts at a time — all individual (need 5 funded to start copy trading)',
      'You have a cushion but do not waste it',
      'Aim for consistent payouts, not max',
      'If you lose 3 evals in one session, STOP',
      'Last time you were here you splurged — trade carefully',
    ],
    confident: [
      '3-5 accounts — if 5+ funded: 3 individual + 2 copy traded',
      'Copy group max 2 — always more individual than copy',
      'Aim for consistent payouts across individual accounts',
      'You can absorb losses and keep going',
      'Do not splurge on evals just because you can',
    ],
    aggressive: [
      'Copy trade all accounts — 4+ individual + 3+ copy',
      'Always more individual than copy (4 individual + 3 copy at 7 accounts)',
      'Aim to max out payouts — you can afford to reset',
      'This is the goal — 20+ eval cushion',
      'Even here: do not go back to zero. Keep your floor.',
    ],
  },
};

export const TradingModeWidget: React.FC<{ apiBase: string; getAuthHeaders: () => Record<string, string> }> = ({ apiBase, getAuthHeaders }) => {
  const [state, setState] = useState<TradingModeState>(DEFAULT_STATE);
  const [expanded, setExpanded] = useState(false);
  const [activeMode, setActiveMode] = useState(state.mode);
  const [loading, setLoading] = useState(true);
  const [animNeedle, setAnimNeedle] = useState(0);

  const fetchState = async () => {
    try {
      const res = await fetch(`${apiBase}/db-accounts?action=get-trading-mode`, {
        headers: { ...getAuthHeaders() },
      });
      if (res.ok) {
        const data = await res.json();
        setState({
          score: data.score ?? 5,
          mode: data.mode ?? 'survival',
          evalCount: data.evalCount ?? 0,
          fundedCount: data.fundedCount ?? 0,
          liveCount: data.liveCount ?? 0,
          cashOnHand: parseFloat(data.cashOnHand ?? '0'),
          totalDebt: parseFloat(data.totalDebt ?? '0'),
          maxEvalLoss: data.maxEvalLoss ?? 2,
          maxFundedLoss: data.maxFundedLoss ?? 1,
          maxLiveLoss: data.maxLiveLoss ?? 0,
          notes: data.notes ?? null,
          rules: data.rules ?? DEFAULT_STATE.rules,
        });
      }
    } catch (e) {
      console.error('Failed to fetch trading mode state:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchState(); }, []);

  useEffect(() => {
    setAnimNeedle((state.score / 100) * 180);
  }, [state.score]);

  useEffect(() => { setActiveMode(state.mode); }, [state.mode]);

  const meta = MODE_META[state.mode] || MODE_META.survival;
  const needleAngle = animNeedle;
  const colorHex = meta.color;

  // Needle tip position on the arc — where the glow goes
  const needleRad = (needleAngle + 180) * Math.PI / 180;
  const needleTipX = 100 + Math.cos(needleRad) * 78;
  const needleTipY = 95 + Math.sin(needleRad) * 78;

  // Ripple fires when the score changes
  const [rippleKey, setRippleKey] = useState(0);
  const prevScoreRef = useRef(0);

  useEffect(() => {
    if (prevScoreRef.current !== state.score && prevScoreRef.current !== 0) {
      setRippleKey(k => k + 1);
    }
    prevScoreRef.current = state.score;
  }, [state.score]);

  // Fallback for Tailwind not generating dynamic classes — use inline styles
  const borderColor = colorHex + '80'; // 50% opacity
  const bgColor = colorHex + '0D'; // 5% opacity

  return (
    <div className="sticky top-0 z-40 w-full" style={{ backgroundColor: bgColor, borderBottom: `1px solid ${borderColor}`, backdropFilter: 'blur(12px)' }}>
      <style>{`
        @keyframes gaugePulse { 0%,100%{opacity:0.3;filter:blur(8px)} 50%{opacity:0.6;filter:blur(14px)} }
        @keyframes slideUpFade { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:translateY(0)} }
        @keyframes tickGlow { 0%,100%{opacity:0.5} 50%{opacity:1} }
        @keyframes tipPulse { 0%,100%{opacity:0.4} 50%{opacity:0.8} }
        @keyframes rippleExpand {
          0% { r: 4; opacity: 0.8; }
          50% { opacity: 0.4; }
          100% { r: 40; opacity: 0; }
        }
      `}</style>

      <div className="max-w-6xl mx-auto px-3 sm:px-4 py-1.5 flex items-center gap-3">
        {/* Compact gauge + mode */}
        <div className="flex items-center gap-2 shrink-0">
          <div className="relative" style={{ width: 96, height: 50, overflow: 'hidden' }}>
            <svg viewBox="0 0 200 105" className="relative w-full h-full" preserveAspectRatio="xMidYMid meet" style={{ overflow: 'hidden' }}>
              <defs>
                <radialGradient id="needleGlow">
                  <stop offset="0%" stopColor={colorHex} stopOpacity="0.8" />
                  <stop offset="40%" stopColor={colorHex} stopOpacity="0.4" />
                  <stop offset="100%" stopColor={colorHex} stopOpacity="0" />
                </radialGradient>
              </defs>

              {TICK_ANGLES.map((deg) => {
                const rad = (deg + 180) * Math.PI / 180;
                const isMajor = deg % 30 === 0;
                const inner = isMajor ? 70 : 74;
                const outer = isMajor ? 88 : 82;
                const x1 = 100 + Math.cos(rad) * inner;
                const y1 = 95 + Math.sin(rad) * inner;
                const x2 = 100 + Math.cos(rad) * outer;
                const y2 = 95 + Math.sin(rad) * outer;
                const tc = tickColor(deg);
                const distFromNeedle = Math.abs(deg - needleAngle);
                const isNearNeedle = distFromNeedle < 30;
                return <line key={deg} x1={x1} y1={y1} x2={x2} y2={y2} stroke={tc} strokeWidth={isMajor ? 4 : 2} strokeLinecap="round" style={{ filter: `drop-shadow(0 0 ${isNearNeedle ? 10 : isMajor ? 8 : 4}px ${tc})`, animation: `tickGlow ${isNearNeedle ? 0.8 : 1.5 + (deg / 180) * 2}s ease-in-out infinite ${deg * 0.01}s`, opacity: isNearNeedle ? 1 : 0.5 }} />;
              })}

              {rippleKey > 0 && (
                <g key={rippleKey} style={{ transformOrigin: '100px 95px' }}>
                  <circle cx={needleTipX} cy={needleTipY} r="4" fill="none" stroke={colorHex} strokeWidth="2" style={{ animation: 'rippleExpand 1.5s ease-out forwards' }} />
                  <circle cx={needleTipX} cy={needleTipY} r="4" fill="none" stroke={colorHex} strokeWidth="1" opacity="0.5" style={{ animation: 'rippleExpand 1.5s ease-out 0.2s forwards' }} />
                </g>
              )}

              <g style={{ transform: `rotate(${needleAngle - 90}deg)`, transformOrigin: '100px 95px', transition: 'transform 1.2s cubic-bezier(0.34, 1.56, 0.64, 1)' }}>
                <line x1="100" y1="95" x2="100" y2="18" stroke={colorHex} strokeWidth="3" strokeLinecap="round" style={{ filter: `drop-shadow(0 0 6px ${colorHex})` }} />
                <circle cx="100" cy="95" r="6" fill={colorHex} style={{ filter: `drop-shadow(0 0 8px ${colorHex})` }} />
                <circle cx="100" cy="95" r="3" fill="white" opacity="0.6" />
              </g>

              <circle cx={needleTipX} cy={needleTipY} r="14" fill="url(#needleGlow)" style={{ animation: `tipPulse ${state.mode === 'survival' ? '1s' : state.mode === 'defensive' ? '1.3s' : state.mode === 'cautious' ? '1.8s' : state.mode === 'balanced' ? '2.5s' : state.mode === 'confident' ? '3s' : '3.5s'} ease-in-out infinite` }} />
              <circle cx={needleTipX} cy={needleTipY} r="5" fill={colorHex} opacity="0.8" style={{ filter: `drop-shadow(0 0 12px ${colorHex})`, animation: `tipPulse ${state.mode === 'survival' ? '1s' : state.mode === 'defensive' ? '1.3s' : state.mode === 'cautious' ? '1.8s' : state.mode === 'balanced' ? '2.5s' : state.mode === 'confident' ? '3s' : '3.5s'} ease-in-out infinite` }} />
            </svg>
          </div>
          <div className="flex flex-col leading-tight">
            <span className="text-sm font-bold tracking-wide whitespace-nowrap" style={{ color: colorHex }}>{meta.label}</span>
            <span className="text-[10px] text-white/40">{state.score}/100</span>
          </div>
        </div>

        {/* Stats */}
        <div className="flex items-center gap-3 sm:gap-5 ml-auto text-center">
          <div><div className="text-[9px] text-white/40 uppercase tracking-wider">Eval</div><div className="text-sm font-bold" style={{ color: colorHex }}>{state.evalCount}</div></div>
          <div><div className="text-[9px] text-white/40 uppercase tracking-wider">Fund</div><div className="text-sm font-bold text-cyan-400">{state.fundedCount}</div></div>
          <div><div className="text-[9px] text-white/40 uppercase tracking-wider">Live</div><div className="text-sm font-bold text-lime-400">{state.liveCount}</div></div>
          <div><div className="text-[9px] text-white/40 uppercase tracking-wider">Cash</div><div className={`text-sm font-bold ${state.cashOnHand >= 0 ? 'text-lime-400' : 'text-red-400'}`}>${state.cashOnHand.toFixed(0)}</div></div>
          <div><div className="text-[9px] text-white/40 uppercase tracking-wider">Debt</div><div className="text-sm font-bold text-red-400">${state.totalDebt.toFixed(0)}</div></div>
        </div>

        {/* Expand toggle */}
        <button onClick={() => setExpanded(!expanded)} className="shrink-0 text-white/40 hover:text-white/80 transition-colors">
          {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>
      </div>

      {/* Expanded content */}
      {expanded && (
        <div className="max-w-6xl mx-auto px-3 sm:px-4 pb-3 space-y-2" style={{ animation: 'slideUpFade 0.4s ease-out' }}>
          <div className="text-[11px] text-white/50">
            Max loss/session: Evals <span style={{ color: colorHex }}>{state.maxEvalLoss}</span> · Funded <span className="text-cyan-400">{state.maxFundedLoss}</span> · Live <span className="text-lime-400">{state.maxLiveLoss}</span>
          </div>

          <div className="flex gap-1 pb-1 flex-wrap">
            {MODES.map((m) => (
              <button key={m.key} onClick={() => setActiveMode(m.key)} style={{ ...(activeMode === m.key ? { color: m.color, borderColor: m.color + '66', backgroundColor: m.color + '1A' } : {}) }} className={`px-2 py-1 rounded-lg text-xs font-medium transition-all duration-200 ${activeMode === m.key ? 'border' : 'bg-white/5 text-white/40 border border-white/10 hover:bg-white/10'}`}>
                <span style={activeMode === m.key ? { color: m.color } : {}}>{m.label}</span>
              </button>
            ))}
          </div>

          <div className="space-y-1.5">
            {(state.rules[activeMode] || []).map((rule, i) => (
              <div key={i} className="flex items-start gap-1.5" style={{ animation: `slideUpFade 0.4s ease-out ${i * 0.15}s both` }}>
                <span className="text-xs mt-0.5" style={{ color: colorHex }}>•</span>
                <span className="text-xs text-white/70 leading-snug flex-1">{rule}</span>
              </div>
            ))}
            {(!state.rules[activeMode] || state.rules[activeMode].length === 0) && (
              <div className="text-xs text-white/30 italic">No rules set — the bot will add them.</div>
            )}
          </div>

          {state.notes && (
            <div className="text-xs text-white/50 bg-white/5 rounded-lg px-2 py-1.5 border border-white/10">
              <span className="text-white/30">Notes: </span>{state.notes}
            </div>
          )}

          <button onClick={fetchState} className="text-xs py-1.5 px-3 rounded-lg bg-white/5 text-white/40 border border-white/10 hover:text-white/60 hover:bg-white/10 transition-all flex items-center justify-center gap-1">
            <RefreshCw className="w-3 h-3" /> Refresh from bot
          </button>
        </div>
      )}
    </div>
  );
};
