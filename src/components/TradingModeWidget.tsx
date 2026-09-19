import React, { useState, useEffect, useMemo } from 'react';
import { Shield, AlertTriangle, Zap, ChevronDown, ChevronUp, Plus, X } from 'lucide-react';

interface TradingModeData {
  evalCount: number;
  fundedCount: number;
  liveCount: number;
  cashOnHand: number;
  totalDebt: number;
}

interface ModeRule {
  id: string;
  text: string;
}

interface ModeConfig {
  level: 'defensive' | 'balanced' | 'aggressive';
  label: string;
  color: string;
  angle: number; // 0-180 on the arc
  icon: React.ReactNode;
  rules: ModeRule[];
}

function computeRiskScore(data: TradingModeData): number {
  // 0 = max defensive, 100 = max aggressive
  const { evalCount, fundedCount, liveCount, cashOnHand, totalDebt } = data;
  const netWorth = cashOnHand - totalDebt;
  const totalAccounts = evalCount + fundedCount + liveCount;
  
  // Start at 50 (balanced)
  let score = 50;
  
  // More accounts = more risk capacity (each is a shot)
  if (totalAccounts >= 5) score += 15;
  else if (totalAccounts >= 3) score += 5;
  else if (totalAccounts <= 1) score -= 20;
  
  // Cash position
  if (cashOnHand > 500) score += 15;
  else if (cashOnHand > 200) score += 5;
  else if (cashOnHand < 50) score -= 20;
  
  // Debt
  if (totalDebt > 5000) score -= 15;
  else if (totalDebt > 2000) score -= 8;
  else if (totalDebt < 500) score += 10;
  
  // Net worth
  if (netWorth < 0) score -= 10;
  else if (netWorth > 1000) score += 10;
  
  // Funded/live accounts add stability
  if (fundedCount > 0) score += 5;
  if (liveCount > 0) score += 10;
  
  return Math.max(0, Math.min(100, score));
}

function scoreToMode(score: number): 'defensive' | 'balanced' | 'aggressive' {
  if (score < 40) return 'defensive';
  if (score < 70) return 'balanced';
  return 'aggressive';
}

const DEFAULT_MODES: Record<string, ModeConfig> = {
  defensive: {
    level: 'defensive',
    label: 'Defensive',
    color: 'red',
    angle: 30,
    icon: <Shield className="w-4 h-4" />,
    rules: [
      { id: 'd1', text: 'Trade ONE account at a time' },
      { id: 'd2', text: 'No copy trading' },
      { id: 'd3', text: 'Aim for consistent small payouts, not max' },
      { id: 'd4', text: 'If you lose 2 evals in one session, STOP' },
      { id: 'd5', text: 'Do not buy new evals until debt is under control' },
    ],
  },
  balanced: {
    level: 'balanced',
    label: 'Balanced',
    color: 'amber',
    angle: 90,
    icon: <AlertTriangle className="w-4 h-4" />,
    rules: [
      { id: 'b1', text: 'Trade up to 2 accounts at a time' },
      { id: 'b2', text: 'Copy trading OK for 2-3 accounts' },
      { id: 'b3', text: 'Aim for consistent payouts' },
      { id: 'b4', text: 'If you lose 3 evals in one session, STOP for the day' },
    ],
  },
  aggressive: {
    level: 'aggressive',
    label: 'Aggressive',
    color: 'green',
    angle: 150,
    icon: <Zap className="w-4 h-4" />,
    rules: [
      { id: 'a1', text: 'Copy trade all accounts' },
      { id: 'a2', text: 'Aim to max out payouts' },
      { id: 'a3', text: 'Trade with confidence - you can afford to reset' },
    ],
  },
};

export const TradingModeWidget: React.FC<{ data: TradingModeData }> = ({ data }) => {
  const riskScore = useMemo(() => computeRiskScore(data), [data]);
  const currentMode = scoreToMode(riskScore);
  
  const [modes, setModes] = useState<Record<string, ModeConfig>>(DEFAULT_MODES);
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [newRuleText, setNewRuleText] = useState('');
  const [activeMode, setActiveMode] = useState<string>(currentMode);
  const [position, setPosition] = useState({ x: 20, y: 100 });
  const [dragging, setDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

  useEffect(() => { setActiveMode(currentMode); }, [currentMode]);

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
    setModes(prev => ({
      ...prev,
      [mode]: {
        ...prev[mode],
        rules: [...prev[mode].rules, { id: `${mode[0]}${Date.now()}`, text: text.trim() }],
      },
    }));
    setNewRuleText('');
  };

  const removeRule = (mode: string, ruleId: string) => {
    setModes(prev => ({
      ...prev,
      [mode]: {
        ...prev[mode],
        rules: prev[mode].rules.filter(r => r.id !== ruleId),
      },
    }));
  };

  // Needle angle: map 0-100 to 0-180 degrees
  const needleAngle = (riskScore / 100) * 180;
  
  const colorHex = currentMode === 'defensive' ? '#ef4444' : currentMode === 'balanced' ? '#f59e0b' : '#22c55e';
  const colorText = currentMode === 'defensive' ? 'text-red-400' : currentMode === 'balanced' ? 'text-amber-400' : 'text-green-400';
  const colorBorder = currentMode === 'defensive' ? 'border-red-400/50' : currentMode === 'balanced' ? 'border-amber-400/50' : 'border-green-400/50';
  const colorBg = currentMode === 'defensive' ? 'bg-red-500/5' : currentMode === 'balanced' ? 'bg-amber-500/5' : 'bg-green-500/5';

  // Pulse animation speed based on urgency
  const pulseDuration = currentMode === 'defensive' ? '1.5s' : currentMode === 'balanced' ? '2.5s' : '3.5s';

  return (
    <div
      className="fixed z-40 select-none"
      style={{ left: `${position.x}px`, top: `${position.y}px`, cursor: dragging ? 'grabbing' : 'grab' }}
      onMouseDown={handleMouseDown}
    >
      <div
        className={`rounded-xl border-2 ${colorBorder} ${colorBg} backdrop-blur-md shadow-2xl overflow-hidden transition-all duration-300`}
        style={{ pointerEvents: 'auto', width: expanded ? '320px' : '180px' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Holographic shimmer */}
        <div
          className="absolute inset-0 opacity-15 pointer-events-none"
          style={{
            background: `conic-gradient(from 0deg at 50% 50%, transparent 0deg, rgba(34, 211, 238, 0.2) 60deg, rgba(168, 85, 247, 0.2) 120deg, rgba(236, 72, 153, 0.2) 180deg, rgba(34, 211, 238, 0.2) 240deg, rgba(168, 85, 247, 0.2) 300deg, transparent 360deg)`,
            filter: 'blur(2px)',
          }}
        />

        {/* Gauge — SVG semicircular arc */}
        <div className="relative pt-3 pb-1 flex flex-col items-center">
          <svg width={expanded ? 320 : 180} height={expanded ? 100 : 90} viewBox="0 0 200 100" className="overflow-visible">
            {/* Arc background zones */}
            <path d="M 10 90 A 90 90 0 0 1 190 90" fill="none" stroke="#ef4444" strokeWidth="8" strokeOpacity="0.3" />
            <path d="M 70 90 A 50 50 0 0 1 130 90" fill="none" stroke="#f59e0b" strokeWidth="8" strokeOpacity="0.3" />
            <path d="M 130 90 A 30 30 0 0 1 190 90" fill="none" stroke="#22c55e" strokeWidth="8" strokeOpacity="0.3" />
            
            {/* Colored zones with better positioning */}
            <path d="M 10 90 A 90 90 0 0 1 70 90" fill="none" stroke="#ef4444" strokeWidth="10" strokeOpacity="0.6" strokeLinecap="round" />
            <path d="M 65 90 A 55 55 0 0 1 135 90" fill="none" stroke="#f59e0b" strokeWidth="10" strokeOpacity="0.5" strokeLinecap="round" />
            <path d="M 130 90 A 30 30 0 0 1 190 90" fill="none" stroke="#22c55e" strokeWidth="10" strokeOpacity="0.6" strokeLinecap="round" />

            {/* Active zone glow */}
            <circle cx="100" cy="90" r="3" fill={colorHex} className="animate-pulse" style={{ animationDuration: pulseDuration }} />
            
            {/* Needle */}
            <g
              style={{
                transform: `rotate(${needleAngle - 90}deg)`,
                transformOrigin: '100px 90px',
                transition: 'transform 0.8s cubic-bezier(0.34, 1.56, 0.64, 1)',
              }}
            >
              <line x1="100" y1="90" x2="100" y2="20" stroke={colorHex} strokeWidth="3" strokeLinecap="round" style={{ filter: `drop-shadow(0 0 4px ${colorHex})` }} />
              <circle cx="100" cy="90" r="5" fill={colorHex} style={{ filter: `drop-shadow(0 0 6px ${colorHex})` }} />
            </g>

            {/* Tick marks */}
            {[0, 45, 90, 135, 180].map((deg) => {
              const rad = (deg - 90) * Math.PI / 180;
              const x1 = 100 + Math.cos(rad) * 88;
              const y1 = 90 + Math.sin(rad) * 88;
              const x2 = 100 + Math.cos(rad) * 78;
              const y2 = 90 + Math.sin(rad) * 78;
              return <line key={deg} x1={x1} y1={y1} x2={x2} y2={y2} stroke="rgba(255,255,255,0.2)" strokeWidth="1" />;
            })}
          </svg>

          {/* Mode label */}
          <div className="flex items-center gap-1.5 -mt-2">
            {modes[currentMode].icon}
            <span className={`text-sm font-bold ${colorText} tracking-wide`}>{modes[currentMode].label}</span>
            <span className="text-[10px] text-white/30">({riskScore}/100)</span>
          </div>

          {/* Expand/collapse toggle */}
          <button
            onClick={() => setExpanded(!expanded)}
            className="mt-1 text-white/40 hover:text-white/70 transition-colors"
            style={{ pointerEvents: 'auto' }}
          >
            {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </div>

        {/* Stats bar — always visible */}
        <div className={`px-3 py-2 border-t border-white/10 grid grid-cols-3 gap-2 text-center`}>
          <div>
            <div className="text-[9px] text-white/40 uppercase">Evals</div>
            <div className={`text-xs font-bold ${colorText}`}>{data.evalCount}</div>
          </div>
          <div>
            <div className="text-[9px] text-white/40 uppercase">Cash</div>
            <div className={`text-xs font-bold ${data.cashOnHand >= 0 ? 'text-lime-400' : 'text-red-400'}`}>${data.cashOnHand.toFixed(0)}</div>
          </div>
          <div>
            <div className="text-[9px] text-white/40 uppercase">Debt</div>
            <div className="text-xs font-bold text-red-400">${data.totalDebt.toFixed(0)}</div>
          </div>
        </div>

        {/* Expanded content — bullet points */}
        {expanded && (
          <div className="px-3 py-2 space-y-2" style={{ animation: 'slideUp 0.3s ease-out' }}>
            <style>{`@keyframes slideUp { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }`}</style>
            
            {/* Mode selector tabs */}
            <div className="flex gap-1 pb-1">
              {Object.values(modes).map((m) => (
                <button
                  key={m.level}
                  onClick={() => setActiveMode(m.level)}
                  style={{ pointerEvents: 'auto' }}
                  className={`flex-1 px-2 py-1 rounded-lg text-xs font-medium transition-all ${
                    activeMode === m.level
                      ? m.color === 'red' ? 'bg-red-500/20 text-red-300 border border-red-400/40'
                      : m.color === 'amber' ? 'bg-amber-500/20 text-amber-300 border border-amber-400/40'
                      : 'bg-green-500/20 text-green-300 border border-green-400/40'
                      : 'bg-white/5 text-white/40 border border-white/10'
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>

            {/* Rules for the selected mode */}
            <div className="space-y-1.5">
              {modes[activeMode].rules.map((rule, i) => (
                <div
                  key={rule.id}
                  className="flex items-start gap-1.5 group"
                  style={{ animation: `slideUp 0.2s ease-out ${i * 0.05}s both` }}
                >
                  <span className={`text-xs mt-0.5 ${colorText}`}>•</span>
                  <span className="text-xs text-white/70 leading-snug flex-1">{rule.text}</span>
                  {editing && (
                    <button
                      onClick={() => removeRule(activeMode, rule.id)}
                      style={{ pointerEvents: 'auto' }}
                      className="text-red-400/0 group-hover:text-red-400 hover:text-red-300 transition-colors"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>
              ))}
            </div>

            {/* Add rule input */}
            {editing && (
              <div className="flex gap-1" style={{ animation: 'slideUp 0.2s ease-out' }}>
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
              className={`w-full text-xs py-1 rounded-lg transition-all ${
                editing ? 'bg-red-500/20 text-red-300 border border-red-400/30' : 'bg-white/5 text-white/40 border border-white/10 hover:text-white/60'
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
