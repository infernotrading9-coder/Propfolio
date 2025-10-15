import React, { useMemo } from 'react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import { NeonCard } from './NeonCard';
import { Challenge } from '../types';
import { Calendar, BarChart3 } from 'lucide-react';

function getWeekNumber(date: Date): string {
  const year = date.getFullYear();
  const startOfYear = new Date(year, 0, 1);
  const days = Math.floor((date.getTime() - startOfYear.getTime()) / (24 * 60 * 60 * 1000));
  const weekNumber = Math.ceil((days + startOfYear.getDay() + 1) / 7);
  return `${year}-W${weekNumber.toString().padStart(2, '0')}`;
}

function getMonthKey(date: string): string {
  return date.slice(0, 7); // YYYY-MM
}

function monthsBetween(startYm: string, endYm: string): string[] {
  const [sy, sm] = startYm.split('-').map(Number);
  const [ey, em] = endYm.split('-').map(Number);
  const result: string[] = [];
  let y = sy, m = sm;
  
  while (y < ey || (y === ey && m <= em)) {
    result.push(`${y.toString().padStart(4,'0')}-${m.toString().padStart(2,'0')}`);
    m += 1;
    if (m > 12) { m = 1; y += 1; }
  }
  return result;
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

export const PnLChart: React.FC<{ challenges: Challenge[] }> = ({ challenges }) => {
  const [viewMode, setViewMode] = React.useState<'monthly' | 'weekly'>('monthly');

  const { data, hasData, dateRange, totalPnL } = useMemo(() => {
    if (challenges.length === 0) {
      return { data: [], hasData: false, dateRange: '', totalPnL: 0 };
    }

    // Get total payouts for each challenge
    const getTotalPayouts = (challenge: Challenge): number => {
      if (Array.isArray(challenge.payouts)) {
        return challenge.payouts.reduce((sum, p) => sum + p.amount, 0);
      }
      return typeof challenge.payouts === 'number' ? challenge.payouts : 0;
    };

    if (viewMode === 'monthly') {
      // Calculate monthly PnL based on challenge start dates and payout dates
      const firstChallenge = challenges.reduce((min, c) => (c.startDate < min.startDate ? c : min), challenges[0]);
      const firstMonth = getMonthKey(firstChallenge.startDate);
      const now = new Date();
      const currentMonth = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
      const months = monthsBetween(firstMonth, currentMonth);

      const pnlByMonth: Record<string, { costs: number; payouts: number; pnl: number }> = {};

      // Initialize all months with zero values
      months.forEach(month => {
        pnlByMonth[month] = { costs: 0, payouts: 0, pnl: 0 };
      });

      // Add challenge costs based on start date
      challenges.forEach(challenge => {
        const challengeMonth = getMonthKey(challenge.startDate);
        if (pnlByMonth[challengeMonth]) {
          pnlByMonth[challengeMonth].costs += challenge.cost;
        }
      });

      // Add payouts based on payout dates
      challenges.forEach(challenge => {
        if (Array.isArray(challenge.payouts)) {
          challenge.payouts.forEach(payout => {
            const payoutMonth = getMonthKey(payout.date);
            if (pnlByMonth[payoutMonth]) {
              pnlByMonth[payoutMonth].payouts += payout.amount;
            }
          });
        }
      });

      // Calculate PnL for each month
      Object.keys(pnlByMonth).forEach(month => {
        const data = pnlByMonth[month];
        data.pnl = data.payouts - data.costs;
      });

      const rows = months.map(month => {
        const [year, monthNum] = month.split('-');
        const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        const monthName = monthNames[parseInt(monthNum) - 1];
        const displayName = monthName + " '" + year.slice(-2);
        
        return {
          period: month,
          amount: pnlByMonth[month].pnl,
          costs: pnlByMonth[month].costs,
          payouts: pnlByMonth[month].payouts,
          displayPeriod: displayName
        };
      });

      const totalPnL = Object.values(pnlByMonth).reduce((sum, data) => sum + data.pnl, 0);
      const hasData = challenges.some(c => c.cost > 0 || getTotalPayouts(c) > 0);

      return { 
        data: rows, 
        hasData, 
        dateRange: `${firstMonth} → ${currentMonth}`,
        totalPnL 
      };

    } else {
      // Weekly view - similar logic but with weeks
      const firstChallenge = challenges.reduce((min, c) => (c.startDate < min.startDate ? c : min), challenges[0]);
      const firstWeek = getWeekNumber(new Date(firstChallenge.startDate));
      const currentWeek = getWeekNumber(new Date());
      const weeks = weeksBetween(firstWeek, currentWeek).slice(-12); // Last 12 weeks

      const pnlByWeek: Record<string, { costs: number; payouts: number; pnl: number }> = {};

      // Initialize all weeks with zero values
      weeks.forEach(week => {
        pnlByWeek[week] = { costs: 0, payouts: 0, pnl: 0 };
      });

      // Add challenge costs based on start date
      challenges.forEach(challenge => {
        const challengeWeek = getWeekNumber(new Date(challenge.startDate));
        if (pnlByWeek[challengeWeek]) {
          pnlByWeek[challengeWeek].costs += challenge.cost;
        }
      });

      // Add payouts based on payout dates
      challenges.forEach(challenge => {
        if (Array.isArray(challenge.payouts)) {
          challenge.payouts.forEach(payout => {
            const payoutWeek = getWeekNumber(new Date(payout.date));
            if (pnlByWeek[payoutWeek]) {
              pnlByWeek[payoutWeek].payouts += payout.amount;
            }
          });
        }
      });

      // Calculate PnL for each week
      Object.keys(pnlByWeek).forEach(week => {
        const data = pnlByWeek[week];
        data.pnl = data.payouts - data.costs;
      });

      const rows = weeks.map(week => {
        const weekNumber = week.replace(/^\d{4}-W/, '');
        return {
          period: week,
          amount: pnlByWeek[week].pnl,
          costs: pnlByWeek[week].costs,
          payouts: pnlByWeek[week].payouts,
          displayPeriod: `Week ${weekNumber}`
        };
      });

      const totalPnL = Object.values(pnlByWeek).reduce((sum, data) => sum + data.pnl, 0);
      const hasData = challenges.some(c => c.cost > 0 || getTotalPayouts(c) > 0);

      return { 
        data: rows, 
        hasData, 
        dateRange: 'Last 12 weeks',
        totalPnL 
      };
    }
  }, [challenges, viewMode]);

  return (
    <NeonCard glow="purple" className="p-4 relative">
      <style>{`
        /* Completely disable the gray active state overlay */
        .recharts-active-bar,
        .recharts-bar .recharts-active-bar,
        g.recharts-active-bar,
        .recharts-bar-background-rectangle {
          display: none !important;
        }
        
        /* Target any gray rectangles */
        rect[fill="#f5f5f5"],
        rect[fill="rgba(0,0,0,0.1)"],
        rect[fill="#e5e5e5"],
        rect[fill="#ccc"],
        rect[fill="#cccccc"],
        rect[fill="gray"],
        rect[fill="grey"],
        rect[fill="#808080"] {
          fill: transparent !important;
          opacity: 0 !important;
        }
        
        /* Disable hover animations */
        .recharts-bar-rectangle {
          transition: none !important;
        }
        
        /* Override any background colors on hover */
        .recharts-bar-rectangles:hover {
          background: transparent !important;
        }
        
        /* Keep tooltip working */
        .recharts-tooltip-wrapper {
          pointer-events: auto !important;
        }
      `}</style>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-4">
          <h3 className="text-lg font-semibold text-white drop-shadow-neon">
            {viewMode === 'monthly' ? 'Monthly' : 'Weekly'} PnL
          </h3>
          <div className="text-right">
            <div className="text-sm text-white/70">Total PnL</div>
            <div className={`text-lg font-bold drop-shadow-neon ${
              totalPnL >= 0 ? 'text-lime-300 drop-shadow-neon-lime' : 'text-red-400'
            }`}>
              {totalPnL >= 0 ? '+' : ''}${totalPnL.toLocaleString(undefined, { maximumFractionDigits: 2 })}
            </div>
          </div>
        </div>
        
        <div className="flex items-center gap-3">
          {/* Toggle Buttons */}
          <div className="flex gap-1">
            <button
              onClick={() => setViewMode('monthly')}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-all duration-200 ${
                viewMode === 'monthly'
                  ? 'bg-purple-500/20 border border-purple-400/50 text-purple-200'
                  : 'bg-white/5 border border-white/10 text-white/70 hover:text-white hover:border-white/20'
              }`}
            >
              <Calendar className="w-4 h-4" />
              Monthly
            </button>
            <button
              onClick={() => setViewMode('weekly')}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-all duration-200 ${
                viewMode === 'weekly'
                  ? 'bg-purple-500/20 border border-purple-400/50 text-purple-200'
                  : 'bg-white/5 border border-white/10 text-white/70 hover:text-white hover:border-white/20'
              }`}
            >
              <BarChart3 className="w-4 h-4" />
              Weekly
            </button>
          </div>
          <div className="text-xs text-white/60">{dateRange}</div>
        </div>
      </div>
      
      <div className="h-64" style={{
        '--recharts-active-bar-fill': 'transparent',
        '--recharts-active-bar-stroke': 'transparent'
      } as React.CSSProperties}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart 
            data={data}
            style={{
              cursor: 'default'
            }}
            onMouseMove={() => {}}
            onMouseLeave={() => {}}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
            <XAxis 
              dataKey="displayPeriod" 
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
                color: 'white',
                borderRadius: '8px'
              }} 
              formatter={(value: any, _name: string, props: any) => {
                const { costs, payouts } = props.payload;
                return [
                  <div key="tooltip" className="space-y-1">
                    <div className="text-lime-300">
                      Payouts: ${payouts.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                    </div>
                    <div className="text-red-300">
                      Costs: ${costs.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                    </div>
                    <div className={`font-bold ${Number(value) >= 0 ? 'text-lime-200' : 'text-red-200'}`}>
                      PnL: {Number(value) >= 0 ? '+' : ''}${Number(value).toLocaleString(undefined, { maximumFractionDigits: 2 })}
                    </div>
                  </div>
                ];
              }}
              labelFormatter={(label: string) => label}
            />
            <Bar 
              dataKey="amount" 
              fill="#22d3ee"
              radius={[4, 4, 0, 0]}
              background={{ fill: 'transparent', fillOpacity: 0 }}
              isAnimationActive={false}
              shape={(props: any) => {
                const { fill, ...rest } = props;
                const barColor = props.payload.amount >= 0 ? '#22d3ee' : '#ef4444';
                return (
                  <rect 
                    {...rest} 
                    fill={barColor}
                    style={{
                      cursor: 'default'
                    }}
                  />
                );
              }}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
      
      {!hasData && (
        <div className="absolute inset-0 flex items-center justify-center bg-[#050810]/90 rounded-xl">
          <div className="text-center text-white/60">
            <div className="mb-2 text-lg">No PnL data yet</div>
            <div className="text-sm">Add challenges with costs and payouts to see your PnL!</div>
          </div>
        </div>
      )}
    </NeonCard>
  );
};