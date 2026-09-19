import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Shield, AlertTriangle, Zap, ChevronDown, ChevronUp, Plus, X } from 'lucide-react';

interface TradingModeData {
  evalCount: number;
  fundedCount: number;
  liveCount: number;
  cashOnHand: number;
  totalDebt: number;
}

interface ModeRule { id: string; text: string; }

function computeRiskScore(data: TradingModeData): number {
  const { evalCount, fundedCount, liveCount, cashOnHand, totalDebt } = data;
  const netWorth = cashOnHand - totalDebt;
  const totalAccounts = evalCount + fundedCount + liveCount;
  let score = 50;
  if (totalAccounts >= 5) score += 15;
  else if (totalAccounts >= 3) score += 5;
  else if (totalAccounts <= 1) score -= 20;
  if (cashOnHand > 500) score += 15;
  else if (cashOnHand > 200) score += 5;
  else if (cashOnHand < 50) score -= 20;
  if (totalDebt > 5000) score -= 15;
  else if (totalDebt > 2000) score -= 8;
  else if (totalDebt < 500) score += 10;
  if (netWorth < 0) score -= 10;
  else if (netWorth > 1000) score += 10;
  if (fundedCount > 0) score += 5;
  if (liveCount > 0) score += 10;
  return Math.max(0, Math.min(100, score));
}

function scoreToMode(score: number): 'defensive' | 'balanced' | 'aggressive' {
  if (score < 40) return 'defensive';
  if (score < 70) return 'balanced';
  return 'aggressive';
}

const MODE_META = {
  defensive: { label: 'Defensive', color: '#ef4444', icon: Shield },
  balanced: { label: 'Balanced', color: '#f59e0b', icon: AlertTriangle },
  aggressive: { label: 'Aggressive', color: '#22c55e', icon: Zap },
};

const DEFAULT_RULES: Record<string, ModeRule[]> = {
  defensive: [
    { id: 'd1', text: 'Trade ONE account at a time' },
    { id: 'd2', text: 'No copy trading' },
    { id: 'd3', text: 'Aim for consistent small payouts, not max' },
    { id: 'd4', text: 'If you lose 2 evals in one session, STOP' },
    { id: 'd5', text: 'Do not buy new evals until debt is under control' },
  ],
  balanced: [
    { id: 'b1', text: 'Trade up to 2 accounts at a time' },
    { id: 'b2', text: 'Copy trading OK for 2-3 accounts' },
    { id: 'b3', text: 'Aim for consistent payouts' },
    { id: 'b4', text: 'If you lose 3 evals in one session, STOP for the day' },
  ],
  aggressive: [
    { id: 'a1', text: 'Copy trade all accounts' },
    { id: 'a2', text: 'Aim to max out payouts' },
    { id: 'a3', text: 'Trade with confidence - you can afford to reset' },
  ],
};

export const TradingModeWidget: React.FC<{ data: TradingModeData }> = ({ data }) => {
  const riskScore = useMemo(() => computeRiskScore(data), [data]);
  const currentMode = scoreToMode(riskScore);
  const meta = MODE_META[currentMode];

  const [rules, setRules] = useState(DEFAULT_RULES);
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [newRuleText, setNewRuleText] = useState('');
  const [activeMode, setActiveMode] = useState(currentMode);
  const [position, setPosition] = useState({ x: 20, y: 80 });
  const [dragging, setDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [animNeedle, setAnimNeedle] = useState(0);
  const [mounted, setMounted] = useState(false);
  const prevScore = useRef(0);

  useEffect(() => { setActiveMode(currentMode); }, [currentMode]);

  // Animate needle on mount and when score changes
  useEffect(() => {
    setMounted(true);
    const target = (riskScore / 100) * 180;
    // Start from 0 on first mount, animate to target
    if (prevScore.current === 0 && !mounted) {
      setAnimNeedle(0);
      requestAnimationFrame(() => {
        setTimeout(() => setAnimNeedle(target), 50);
      });
    } else {
      setAnimNeedle(target);
    }
    prevScore.current = riskScore;
  }, [riskScore, mounted]);

  const handleMouseDown = (e: React.MouseEvent) => {
    if (editing) return;
    setDragging(true);
    setDragStart({ x: e.clientX - position.x, y: e.clientY - position.y });
  };

  useEffect(() => {
    if (!dragging) return;
    const handleMove = (e: MouseEvent) => {
      setPosition({ x: Math.max(0, e.clientX - dragStart.x), y: Math.max(0, e.clientY - dragStart.y) });
    };
    const handleUp = () => setDragging(false);
    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
    };
  }, [dragging, dragStart]);

  const addRule = (mode: string, text: string) => {
    if (!text.trim()) return;
    setRules(prev => ({ ...prev, [mode]: [...prev[mode], { id: `${mode[0]}${Date.now()}`, text: text.trim() }] }));
    setNewRuleText('');
  };

  const removeRule = (mode: string, ruleId: string) => {
    setRules(prev => ({ ...prev, [mode]: prev[mode].filter(r => r.id !== ruleId) }));
  };

  const needleAngle = animNeedle;
  const colorHex = meta.color;
  const colorText = currentMode === 'defensive' ? 'text-red-400' : currentMode === 'balanced' ? 'text-amber-400' : 'text-green-400';
  const colorBorder = currentMode === 'defensive' ? 'border-red-400/50' : currentMode === 'balanced' ? 'border-amber-400/50' : 'border-green-400/50';
  const colorBg = currentMode === 'defensive' ? 'bg-red-500/5' : currentMode === 'balanced' ? 'bg-amber-500/5' : 'bg-green-500/5';

  // Stats

  return (
    <div
      className="fixed z-40 select-none"
      style={{ left: `${position.x}px`, top: `${position.y}px`, cursor: dragging ? 'grabbing' : 'grab' }}
      onMouseDown={handleMouseDown}
    >
      <style>{`
        @keyframes gaugePulse {
          0%, 100% { opacity: 0.4; filter: blur(8px); }
          50% { opacity: 0.8; filter: blur(12px); }
        }
        @keyframes needleSweep {
          0% { transform: rotate(-90deg); }
          100% { transform: rotate(${needleAngle - 90}deg); }
        }
        @keyframes slideUpFade {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes arcGlow {
          0%, 100% { opacity: 0.5; }
          50% { opacity: 0.9; }
        }
        @keyframes float0 { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-3px)} }
        @keyframes float1 { 0%,100%{transform:translateY(-2px)} 50%{transform:translateY(2px)} }
        @keyframes float2 { 0%,100%{transform:translateY(1px)} 50%{transform:translateY(-2px)} }
      `}</style>

      <div
        className={`rounded-2xl border-2 ${colorBorder} ${colorBg} backdrop-blur-xl shadow-2xl overflow-hidden transition-all duration-500 ease-out`}
        style={{
          pointerEvents: 'auto',
          width: expanded ? '340px' : '200px',
          boxShadow: `0 0 30px ${colorHex}22, 0 0 60px ${colorHex}11`,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Holographic shimmer */}
        <div
          className="absolute inset-0 opacity-20 pointer-events-none"
          style={{
            background: `conic-gradient(from 0deg at 50% 50%, transparent 0deg, ${colorHex}33 60deg, ${colorHex}22 120deg, ${colorHex}33 180deg, ${colorHex}22 240deg, ${colorHex}33 300deg, transparent 360deg)`,
            filter: 'blur(3px)',
          }}
        />

        {/* Gauge SVG */}
        <div className="relative flex flex-col items-center pt-4 pb-2">
          <div className="relative" style={{ width: expanded ? 320 : 200, height: 105 }}>
            {/* Glow behind gauge */}
            <div
              className="absolute top-0 left-1/2 -translate-x-1/2 rounded-full pointer-events-none"
              style={{
                width: 120,
                height: 60,
                background: colorHex,
                animation: `gaugePulse ${currentMode === 'defensive' ? '1.2s' : currentMode === 'balanced' ? '2s' : '3s'} ease-in-out infinite`,
              }}
            />

            <svg width={expanded ? 320 : 200} height="105" viewBox="0 0 200 105" className="relative overflow-visible">
              {/* Arc zones */}
              <path d="M 15 95 A 85 85 0 0 1 65 95" fill="none" stroke="#ef4444" strokeWidth="12" strokeOpacity="0.5" strokeLinecap="round" style={{ animation: 'arcGlow 2s ease-in-out infinite' }} />
              <path d="M 60 95 A 60 60 0 0 1 140 95" fill="none" stroke="#f59e0b" strokeWidth="12" strokeOpacity="0.4" strokeLinecap="round" style={{ animation: 'arcGlow 2.5s ease-in-out infinite 0.3s' }} />
              <path d="M 135 95 A 35 35 0 0 1 185 95" fill="none" stroke="#22c55e" strokeWidth="12" strokeOpacity="0.5" strokeLinecap="round" style={{ animation: 'arcGlow 3s ease-in-out infinite 0.6s' }} />

              {/* Active zone highlight */}
              {currentMode === 'defensive' && <path d="M 15 95 A 85 85 0 0 1 65 95" fill="none" stroke="#ef4444" strokeWidth="14" strokeOpacity="0.8" strokeLinecap="round" style={{ filter: `drop-shadow(0 0 8px #ef4444)` }} />}
              {currentMode === 'balanced' && <path d="M 60 95 A 60 60 0 0 1 140 95" fill="none" stroke="#f59e0b" strokeWidth="14" strokeOpacity="0.8" strokeLinecap="round" style={{ filter: `drop-shadow(0 0 8px #f59e0b)` }} />}
              {currentMode === 'aggressive' && <path d="M 135 95 A 35 35 0 0 1 185 95" fill="none" stroke="#22c55e" strokeWidth="14" strokeOpacity="0.8" strokeLinecap="round" style={{ filter: `drop-shadow(0 0 8px #22c55e)` }} />}

              {/* Tick marks */}
              {[0, 22.5, 45, 67.5, 90, 112.5, 135, 157.5, 180].map((deg) => {
                const rad = (deg - 90) * Math.PI / 180;
                const x1 = 100 + Math.cos(rad) * 82;
                const y1 = 95 + Math.sin(rad) * 82;
                const x2 = 100 + Math.cos(rad) * 72;
                const y2 = 95 + Math.sin(rad) * 72;
                return <line key={deg} x1={x1} y1={y1} x2={x2} y2={y2} stroke="rgba(255,255,255,0.15)" strokeWidth="1" />;
              })}

              {/* Needle */}
              <g
                style={{
                  transform: `rotate(${needleAngle - 90}deg)`,
                  transformOrigin: '100px 95px',
                  transition: 'transform 1s cubic-bezier(0.34, 1.56, 0.64, 1)',
                }}
              >
                <line x1="100" y1="95" x2="100" y2="18" stroke={colorHex} strokeWidth="3" strokeLinecap="round" style={{ filter: `drop-shadow(0 0 6px ${colorHex})` }} />
                <circle cx="100" cy="95" r="6" fill={colorHex} style={{ filter: `drop-shadow(0 0 8px ${colorHex})` }} />
                <circle cx="100" cy="95" r="3" fill="white" opacity="0.6" />
              </g>

              {/* Floating particles */}
              <circle cx="40" cy="30" r="2" fill={colorHex} opacity="0.4" style={{ animation: 'float0 3s ease-in-out infinite' }} />
              <circle cx="160" cy="25" r="1.5" fill={colorHex} opacity="0.3" style={{ animation: 'float1 2.5s ease-in-out infinite' }} />
              <circle cx="100" cy="15" r="1" fill={colorHex} opacity="0.5" style={{ animation: 'float2 2s ease-in-out infinite' }} />
            </svg>
          </div>

          {/* Mode label */}
          <div className="flex items-center gap-2 -mt-3">
            <meta.icon className={`w-4 h-4 ${colorText}`} />
            <span className={`text-base font-bold ${colorText} tracking-wide`}>{meta.label}</span>
            <span className="text-[10px] text-white/30">({riskScore}/100)</span>
          </div>

          {/* Expand toggle */}
          <button
            onClick={() => setExpanded(!expanded)}
            style={{ pointerEvents: 'auto' }}
            className="mt-1 text-white/40 hover:text-white/80 transition-colors"
          >
            {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </div>

        {/* Stats bar — 5 columns: evals, funded, live, cash, debt */}
        <div className="px-3 py-2 border-t border-white/10 grid grid-cols-5 gap-1 text-center">
          <div>
            <div className="text-[8px] text-white/40 uppercase tracking-wider">Eval</div>
            <div className={`text-xs font-bold ${colorText}`}>{data.evalCount}</div>
          </div>
          <div>
            <div className="text-[8px] text-white/40 uppercase tracking-wider">Fund</div>
            <div className="text-xs font-bold text-cyan-400">{data.fundedCount}</div>
          </div>
          <div>
            <div className="text-[8px] text-white/40 uppercase tracking-wider">Live</div>
            <div className="text-xs font-bold text-lime-400">{data.liveCount}</div>
          </div>
          <div>
            <div className="text-[8px] text-white/40 uppercase tracking-wider">Cash</div>
            <div className={`text-xs font-bold ${data.cashOnHand >= 0 ? 'text-lime-400' : 'text-red-400'}`}>${data.cashOnHand.toFixed(0)}</div>
          </div>
          <div>
            <div className="text-[8px] text-white/40 uppercase tracking-wider">Debt</div>
            <div className="text-xs font-bold text-red-400">${data.totalDebt.toFixed(0)}</div>
          </div>
        </div>

        {/* Expanded content */}
        {expanded && (
          <div className="px-3 py-2 space-y-2" style={{ animation: 'slideUpFade 0.3s ease-out' }}>
            {/* Mode tabs */}
            <div className="flex gap-1 pb-1">
              {Object.entries(MODE_META).map(([key, m]) => (
                <button
                  key={key}
                  onClick={() => setActiveMode(key as 'defensive' | 'balanced' | 'aggressive')}
                  style={{ pointerEvents: 'auto' }}
                  className={`flex-1 px-2 py-1 rounded-lg text-xs font-medium transition-all duration-200 ${
                    activeMode === key
                      ? key === 'defensive' ? 'bg-red-500/20 text-red-300 border border-red-400/40 shadow-[0_0_12px_rgba(239,68,68,0.3)]'
                      : key === 'balanced' ? 'bg-amber-500/20 text-amber-300 border border-amber-400/40 shadow-[0_0_12px_rgba(245,158,11,0.3)]'
                      : 'bg-green-500/20 text-green-300 border border-green-400/40 shadow-[0_0_12px_rgba(34,197,94,0.3)]'
                      : 'bg-white/5 text-white/40 border border-white/10 hover:bg-white/10'
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>

            {/* Rules */}
            <div className="space-y-1.5">
              {rules[activeMode]?.map((rule, i) => (
                <div
                  key={rule.id}
                  className="flex items-start gap-1.5 group"
                  style={{ animation: `slideUpFade 0.2s ease-out ${i * 0.06}s both` }}
                >
                  <span className={`text-xs mt-0.5 ${colorText}`}>•</span>
                  <span className="text-xs text-white/70 leading-snug flex-1">{rule.text}</span>
                  {editing && (
                    <button
                      onClick={() => removeRule(activeMode, rule.id)}
                      style={{ pointerEvents: 'auto' }}
                      className="text-red-400/60 hover:text-red-300 transition-colors"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>
              ))}
            </div>

            {/* Add rule */}
            {editing && (
              <div className="flex gap-1" style={{ animation: 'slideUpFade 0.2s ease-out' }}>
                <input
                  type="text"
                  value={newRuleText}
                  onChange={(e) => setNewRuleText(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') addRule(activeMode, newRuleText); }}
                  placeholder="Add rule..."
                  style={{ pointerEvents: 'auto' }}
                  className="flex-1 bg-gray-800 border border-white/10 rounded px-2 py-1 text-xs text-white placeholder-white/30"
                />
                <button
                  onClick={() => addRule(activeMode, newRuleText)}
                  style={{ pointerEvents: 'auto' }}
                  className="bg-cyan-500/20 text-cyan-300 border border-cyan-400/30 rounded px-2 py-1 text-xs"
                >
                  <Plus className="w-3 h-3" />
                </button>
              </div>
            )}

            {/* Edit toggle */}
            <button
              onClick={() => setEditing(!editing)}
              style={{ pointerEvents: 'auto' }}
              className={`w-full text-xs py-1.5 rounded-lg transition-all ${
                editing ? 'bg-red-500/20 text-red-300 border border-red-400/30' : 'bg-white/5 text-white/40 border border-white/10 hover:text-white/60 hover:bg-white/10'
              }`}
            >
              {editing ? 'Done' : '✎ Edit rules'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
