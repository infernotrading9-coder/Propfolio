import React, { useState, useEffect, useMemo } from 'react';
import { Shield, AlertTriangle, Zap, Move } from 'lucide-react';

interface TradingModeData {
  evalCount: number;
  fundedCount: number;
  liveCount: number;
  cashOnHand: number;
  totalDebt: number;
}

interface RiskPosture {
  level: 'defensive' | 'balanced' | 'aggressive';
  label: string;
  color: string;
  icon: React.ReactNode;
  rules: string[];
  summary: string;
}

function calculatePosture(data: TradingModeData): RiskPosture {
  const { evalCount, cashOnHand, totalDebt } = data;
  const netWorth = cashOnHand - totalDebt;

  // How many evals can you afford to replace?
  // Average eval costs ~$85 (from history)
  const avgEvalCost = 85;
  const affordableResets = Math.max(0, Math.floor(cashOnHand / avgEvalCost));

  // Defensive: low cash, high debt, many evals — can't afford to lose
  if (netWorth < 0 && cashOnHand < 200 && evalCount >= 3) {
    return {
      level: 'defensive',
      label: 'Defensive',
      color: 'red',
      icon: <Shield className="w-5 h-5 text-red-400" />,
      summary: `You have ${evalCount} evals but $${cashOnHand.toFixed(0)} cash and $${totalDebt.toFixed(0)} debt. Capital preservation is the priority.`,
      rules: [
        `Trade ONE account at a time — you have ${evalCount} shots, don't waste them simultaneously`,
        'No copy trading — each eval is a separate opportunity',
        'Aim for consistent small payouts, not max — survive first, profit second',
        `You can afford to lose ${affordableResets} eval${affordableResets !== 1 ? 's' : ''} this session — don't risk more`,
        'If you lose 2 evals in one session, STOP. Come back tomorrow.',
        'Do not buy new evals until debt is under control',
      ],
    };
  }

  // Balanced: some cash, moderate debt, 2-4 evals
  if ((netWorth < 500 || totalDebt > 5000) && evalCount >= 2) {
    return {
      level: 'balanced',
      label: 'Balanced',
      color: 'amber',
      icon: <AlertTriangle className="w-5 h-5 text-amber-400" />,
      summary: `You have ${evalCount} evals, $${cashOnHand.toFixed(0)} cash, $${totalDebt.toFixed(0)} debt. Trade carefully but you have room to work.`,
      rules: [
        `Trade up to 2 accounts at a time — you have ${evalCount} evals to work with`,
        'Copy trading OK for 2-3 accounts — but monitor each separately',
        'Aim for consistent payouts - do not overextend trying to max out',
        `You can afford to lose ${affordableResets} eval${affordableResets !== 1 ? 's' : ''} this session`,
        'If you lose 3 evals in one session, STOP for the day',
      ],
    };
  }

  // Aggressive: plenty of cash, low debt, 1-2 evals — go for it
  return {
    level: 'aggressive',
    label: 'Aggressive',
    color: 'green',
    icon: <Zap className="w-5 h-5 text-green-400" />,
    summary: `You have ${evalCount} evals, $${cashOnHand.toFixed(0)} cash, $${totalDebt.toFixed(0)} debt. You can afford to take risks.`,
    rules: [
      `Copy trade all ${evalCount} account${evalCount !== 1 ? 's' : ''} — maximize your exposure`,
      'Aim to max out payouts — you have the capital to reset',
      `You can afford to lose ${affordableResets} eval${affordableResets !== 1 ? 's' : ''} — trade with confidence`,
      'If you lose all evals in one session, you can afford to reset',
    ],
  };
}

export const TradingModeWidget: React.FC<{ data: TradingModeData }> = ({ data }) => {
  const posture = useMemo(() => calculatePosture(data), [data]);
  const [position, setPosition] = useState({ x: 20, y: 100 });
  const [dragging, setDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

  const handleMouseDown = (e: React.MouseEvent) => {
    setDragging(true);
    setDragStart({ x: e.clientX - position.x, y: e.clientY - position.y });
  };

  useEffect(() => {
    if (!dragging) return;
    const handleMove = (e: MouseEvent) => {
      setPosition({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y });
    };
    const handleUp = () => setDragging(false);
    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
    };
  }, [dragging, dragStart]);

  const bgColor = posture.color === 'red' ? 'bg-red-500/5' : posture.color === 'amber' ? 'bg-amber-500/5' : 'bg-green-500/5';
  const textColor = posture.color === 'red' ? 'text-red-300' : posture.color === 'amber' ? 'text-amber-300' : 'text-green-300';
  const borderColor = posture.color === 'red' ? 'border-red-400/50' : posture.color === 'amber' ? 'border-amber-400/50' : 'border-green-400/50';

  return (
    <div
      className="fixed z-40 select-none"
      style={{ left: `${position.x}px`, top: `${position.y}px`, cursor: dragging ? 'grabbing' : 'grab' }}
      onMouseDown={handleMouseDown}
    >
      <div
        className={`w-72 rounded-xl border-2 ${borderColor} ${bgColor} backdrop-blur-md shadow-2xl overflow-hidden`}
        style={{ pointerEvents: 'auto' }}
      >
        {/* Holographic shimmer */}
        <div
          className="absolute inset-0 opacity-20 pointer-events-none"
          style={{
            background: `conic-gradient(from 0deg at 50% 50%, transparent 0deg, rgba(34, 211, 238, 0.15) 60deg, rgba(168, 85, 247, 0.15) 120deg, rgba(236, 72, 153, 0.15) 180deg, rgba(34, 211, 238, 0.15) 240deg, rgba(168, 85, 247, 0.15) 300deg, transparent 360deg)`,
            filter: 'blur(2px)',
          }}
        />

        {/* Drag handle */}
        <div className={`flex items-center justify-between px-3 py-2 border-b ${borderColor} border-opacity-30`}>
          <div className="flex items-center gap-2">
            <Move className="w-3 h-3 text-white/30" />
            <span className="text-xs font-bold text-white/60 tracking-wider uppercase">Trading Mode</span>
          </div>
          <div className={`flex items-center gap-1 px-2 py-0.5 rounded-full ${bgColor} ${borderColor} border`}>
            {posture.icon}
            <span className={`text-xs font-bold ${textColor}`}>{posture.label}</span>
          </div>
        </div>

        {/* Summary */}
        <div className="px-3 py-2">
          <p className="text-xs text-white/60 leading-relaxed">{posture.summary}</p>
        </div>

        {/* Rules */}
        <div className="px-3 pb-3 space-y-1.5">
          {posture.rules.map((rule, i) => (
            <div key={i} className="flex items-start gap-1.5">
              <span className={`text-xs ${textColor} mt-0.5`}>•</span>
              <span className="text-xs text-white/70 leading-snug">{rule}</span>
            </div>
          ))}
        </div>

        {/* Stats bar */}
        <div className={`px-3 py-2 border-t ${borderColor} border-opacity-30 grid grid-cols-3 gap-2 text-center`}>
          <div>
            <div className="text-[10px] text-white/40 uppercase">Evals</div>
            <div className={`text-sm font-bold ${textColor}`}>{data.evalCount}</div>
          </div>
          <div>
            <div className="text-[10px] text-white/40 uppercase">Cash</div>
            <div className={`text-sm font-bold ${data.cashOnHand >= 0 ? 'text-lime-400' : 'text-red-400'}`}>${data.cashOnHand.toFixed(0)}</div>
          </div>
          <div>
            <div className="text-[10px] text-white/40 uppercase">Debt</div>
            <div className="text-sm font-bold text-red-400">${data.totalDebt.toFixed(0)}</div>
          </div>
        </div>
      </div>
    </div>
  );
};
