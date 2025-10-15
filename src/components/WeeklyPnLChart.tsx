import React, { useMemo } from 'react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import { NeonCard } from './NeonCard';
import { Challenge } from '../types';

function getWeekNumber(date: Date): string {
  const year = date.getFullYear();
  // ISO week calculation
  const startOfYear = new Date(year, 0, 1);
  const days = Math.floor((date.getTime() - startOfYear.getTime()) / (24 * 60 * 60 * 1000));
  const weekNumber = Math.ceil((days + startOfYear.getDay() + 1) / 7);
  return `${year}-W${weekNumber.toString().padStart(2, '0')}`;
}

function weeksBetween(startWeek: string, endWeek: string): string[] {
  const parseWeek = (week: string) => {
    const [year, weekStr] = week.split('-W');
    return { year: parseInt(year), week: parseInt(weekStr) };
  };

  const start = parseWeek(startWeek);
  const end = parseWeek(endWeek);
  const result: string[] = [];

  let currentYear = start.year;
  let currentWeek = start.week;

  while (currentYear < end.year || (currentYear === end.year && currentWeek <= end.week)) {
    result.push(`${currentYear}-W${currentWeek.toString().padStart(2, '0')}`);
    
    currentWeek++;
    if (currentWeek > 52) {
      currentWeek = 1;
      currentYear++;
    }
  }

  return result;
}

export const WeeklyPnLChart: React.FC<{ title?: string; challenges: Challenge[] }> = ({ 
  title = 'Weekly PnL', 
  challenges 
}) => {
  const { data, minWeek, maxWeek, hasData } = useMemo(() => {
    if (challenges.length === 0) {
      return { data: [], minWeek: undefined, maxWeek: undefined, hasData: false };
    }
    
    const firstChallenge = challenges.reduce((min, c) => (c.startDate < min.startDate ? c : min), challenges[0]);
    const firstWeek = getWeekNumber(new Date(firstChallenge.startDate));
    const currentWeek = getWeekNumber(new Date());
    const weeks = weeksBetween(firstWeek, currentWeek);

    const pnlByWeek: Record<string, number> = {};
    let totalEntries = 0;
    
    for (const c of challenges) {
      for (const [week, amt] of Object.entries(c.weeklyPnL || {})) {
        pnlByWeek[week] = (pnlByWeek[week] ?? 0) + amt;
        totalEntries++;
      }
    }

    const rows = weeks.slice(-12).map(week => ({ 
      week, 
      amount: pnlByWeek[week] ?? 0,
      displayWeek: week.replace(/^\d{4}-W/, 'W') // Show just "W42" instead of "2024-W42"
    }));

    return { data: rows, minWeek: firstWeek, maxWeek: currentWeek, hasData: totalEntries > 0 };
  }, [challenges]);

  return (
    <NeonCard glow="cyan" className="p-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-white drop-shadow-neon">{title}</h3>
        {minWeek && maxWeek && (
          <div className="text-xs text-white/60">Last 12 weeks</div>
        )}
      </div>
      
      {hasData ? (
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
              <XAxis 
                dataKey="displayWeek" 
                tick={{ fill: '#94a3b8' }} 
                tickLine={false} 
                axisLine={{ stroke: 'rgba(255,255,255,0.15)' }} 
              />
              <YAxis 
                tick={{ fill: '#94a3b8' }} 
                tickLine={false} 
                axisLine={{ stroke: 'rgba(255,255,255,0.15)' }} 
              />
              <Tooltip 
                contentStyle={{ 
                  background: '#0b0f17', 
                  border: '1px solid rgba(255,255,255,0.1)', 
                  color: 'white' 
                }} 
                formatter={(value: any) => [
                  `$${Number(value).toLocaleString(undefined, { maximumFractionDigits: 2 })}`,
                  'PnL'
                ]}
                labelFormatter={(label: string) => `Week ${label}`}
              />
              <Bar 
                dataKey="amount" 
                fill="#06b6d4" 
                radius={[4, 4, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="h-64 flex items-center justify-center">
          <div className="text-center text-white/60">
            <div className="mb-2 text-lg">No weekly PnL data yet</div>
            <div className="text-sm">Add weekly PnL data by editing your challenges</div>
          </div>
        </div>
      )}
    </NeonCard>
  );
};