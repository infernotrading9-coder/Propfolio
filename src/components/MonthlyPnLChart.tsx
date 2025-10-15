import React, { useMemo, useState, useEffect } from 'react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import { NeonCard } from './NeonCard';
import { Challenge } from '../types';

function monthsBetween(startYm: string, endYm: string): string[] {
  const [sy, sm] = startYm.split('-').map(Number);
  const [ey, em] = endYm.split('-').map(Number);
  const result: string[] = [];
  let y = sy, m = sm;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    result.push(`${y.toString().padStart(4,'0')}-${m.toString().padStart(2,'0')}`);
    if (y === ey && m === em) break;
    m += 1;
    if (m > 12) { m = 1; y += 1; }
  }
  return result;
}

export const MonthlyPnLChart: React.FC<{ title?: string; challenges: Challenge[] }> = ({ title = 'Monthly PnL', challenges }) => {
  const [isMobile, setIsMobile] = useState(false);
  
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  const { data, minYm, maxYm } = useMemo(() => {
    if (challenges.length === 0) return { data: [], minYm: undefined as string | undefined, maxYm: undefined as string | undefined };
    const firstYm = challenges.reduce((min, c) => (c.startDate < min.startDate ? c : min), challenges[0]).startDate.slice(0,7);
    const now = new Date();
    const currentYm = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
    const months = monthsBetween(firstYm, currentYm);

    const pnlByYm: Record<string, number> = {};
    for (const c of challenges) {
      for (const [ym, amt] of Object.entries(c.monthlyPnL)) {
        pnlByYm[ym] = (pnlByYm[ym] ?? 0) + amt;
      }
    }

    let rows = months.map(ym => ({ ym, amount: pnlByYm[ym] ?? 0 }));
    
    // On mobile, show only last 6 months for performance
    if (isMobile) {
      rows = rows.slice(-6);
    }
    
    return { data: rows, minYm: firstYm, maxYm: currentYm };
  }, [challenges, isMobile]);

  // Mobile simplified version
  if (isMobile) {
    const total = data.reduce((sum, item) => sum + item.amount, 0);
    const positive = data.filter(item => item.amount > 0);
    const negative = data.filter(item => item.amount < 0);
    
    return (
      <NeonCard glow="purple" className="p-3">
        <div className="mb-3">
          <h3 className="text-base font-semibold text-white">{title}</h3>
          <div className="text-xs text-white/60">Last 6 months</div>
        </div>
        
        {/* Simple mobile stats */}
        <div className="space-y-2 mb-4">
          <div className="flex justify-between items-center p-2 bg-white/5 rounded">
            <span className="text-sm text-white/70">Total</span>
            <span className={`text-sm font-medium ${
              total >= 0 ? 'text-green-400' : 'text-red-400'
            }`}>
              {total >= 0 ? '+' : ''}${total.toLocaleString()}
            </span>
          </div>
          <div className="flex justify-between items-center p-2 bg-white/5 rounded">
            <span className="text-sm text-white/70">Positive Months</span>
            <span className="text-sm text-green-400">{positive.length}</span>
          </div>
          <div className="flex justify-between items-center p-2 bg-white/5 rounded">
            <span className="text-sm text-white/70">Negative Months</span>
            <span className="text-sm text-red-400">{negative.length}</span>
          </div>
        </div>
        
        {/* Simple bar visualization */}
        <div className="h-32">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
              <XAxis 
                dataKey="ym" 
                tick={{ fill: '#94a3b8', fontSize: 10 }} 
                tickLine={false} 
                axisLine={false}
                interval={0}
                angle={-45}
                textAnchor="end"
                height={60}
              />
              <YAxis hide />
              <Bar 
                dataKey="amount" 
                fill="#22d3ee" 
                radius={[2, 2, 0, 0]}
                strokeWidth={0}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </NeonCard>
    );
  }

  // Desktop full version
  return (
    <NeonCard glow="purple" className="p-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-white drop-shadow-neon">{title}</h3>
        {minYm && maxYm && (
          <div className="text-xs text-white/60">{minYm} → {maxYm}</div>
        )}
      </div>
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
            <XAxis dataKey="ym" tick={{ fill: '#94a3b8' }} tickLine={false} axisLine={{ stroke: 'rgba(255,255,255,0.15)' }} />
            <YAxis tick={{ fill: '#94a3b8' }} tickLine={false} axisLine={{ stroke: 'rgba(255,255,255,0.15)' }} />
            <Tooltip contentStyle={{ background: '#0b0f17', border: '1px solid rgba(255,255,255,0.1)', color: 'white' }} />
            <Bar dataKey="amount" fill="#22d3ee" radius={[6, 6, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </NeonCard>
  );
};
