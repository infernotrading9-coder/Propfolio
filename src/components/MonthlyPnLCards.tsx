import React from 'react';
import { Challenge } from '../types';
import { ArrowUpRight, ArrowDownRight } from 'lucide-react';

function getMonthKey(date: string): string {
  return date.slice(0, 7); // YYYY-MM
}

function getMonthName(monthKey: string): { short: string; year: string } {
  const [year, monthNumStr] = monthKey.split('-');
  const monthNum = parseInt(monthNumStr, 10);
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return { short: monthNames[monthNum - 1], year };
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

export const MonthlyPnLCards: React.FC<{ challenges: Challenge[] }> = ({ challenges }) => {
  const [count, setCount] = React.useState<6|12|'all'>(12);
  const [sort, setSort] = React.useState<'chronological'|'amount-desc'|'amount-asc'>('chronological');

  const data = React.useMemo(() => {
    if (!challenges || challenges.length === 0) return [] as Array<{ ym: string; pnl: number; cost: number; payouts: number }>;

    const valid = challenges.filter(c => c && c.startDate);
    if (valid.length === 0) return [] as Array<{ ym: string; pnl: number; cost: number; payouts: number }>;

    const firstMonth = valid.reduce((min, c) => (c.startDate < min.startDate ? c : min), valid[0]).startDate.slice(0,7);
    const now = new Date();
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
    const months = monthsBetween(firstMonth, currentMonth);

    const byMonth: Record<string, { cost: number; payouts: number; pnl: number }> = {};
    months.forEach(m => byMonth[m] = { cost: 0, payouts: 0, pnl: 0 });

    // Costs by challenge start month
    valid.forEach(c => {
      const m = getMonthKey(c.startDate);
      if (byMonth[m]) byMonth[m].cost += c.cost || 0;
    });

    // Payouts by payout date
    valid.forEach(c => {
      if (Array.isArray(c.payouts)) {
        c.payouts.forEach(p => {
          const m = getMonthKey(p.date);
          if (byMonth[m]) byMonth[m].payouts += p.amount;
        });
      }
    });

    Object.keys(byMonth).forEach(m => { byMonth[m].pnl = byMonth[m].payouts - byMonth[m].cost; });

    let rows = months.map(m => ({ ym: m, pnl: byMonth[m].pnl, cost: byMonth[m].cost, payouts: byMonth[m].payouts }));

    if (sort === 'amount-desc') rows = rows.sort((a,b)=> b.pnl - a.pnl);
    if (sort === 'amount-asc') rows = rows.sort((a,b)=> a.pnl - b.pnl);

    if (sort === 'chronological') rows = rows; // already chronological

    const visible = count === 'all' ? rows : rows.slice(-count);
    return visible;
  }, [challenges, count, sort]);

  const maxAbs = React.useMemo(() => {
    if (data.length === 0) return 0;
    return Math.max(...data.map(d => Math.abs(d.pnl)), 1);
  }, [data]);

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs text-white/60">
          <span className="hidden sm:inline">Monthly Performance</span>
          <span className="inline sm:hidden">Monthly PnL</span>
          <span className="opacity-40">•</span>
          <span>{data.length} months</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="inline-flex bg-white/5 border border-white/10 rounded-md p-1 text-xs">
            <button onClick={()=>setCount(6)} className={`px-2 py-1 rounded ${count===6 ? 'bg-white/10 text-white' : 'text-white/70 hover:text-white'}`}>6</button>
            <button onClick={()=>setCount(12)} className={`px-2 py-1 rounded ${count===12 ? 'bg-white/10 text-white' : 'text-white/70 hover:text-white'}`}>12</button>
            <button onClick={()=>setCount('all')} className={`px-2 py-1 rounded ${count==='all' ? 'bg-white/10 text-white' : 'text-white/70 hover:text-white'}`}>All</button>
          </div>
          <div className="inline-flex bg-white/5 border border-white/10 rounded-md p-1 text-xs">
            <button onClick={()=>setSort('chronological')} className={`px-2 py-1 rounded ${sort==='chronological' ? 'bg-white/10 text-white' : 'text-white/70 hover:text-white'}`}>Chrono</button>
            <button onClick={()=>setSort('amount-desc')} className={`px-2 py-1 rounded ${sort==='amount-desc' ? 'bg-white/10 text-white' : 'text-white/70 hover:text-white'}`}>Top</button>
            <button onClick={()=>setSort('amount-asc')} className={`px-2 py-1 rounded ${sort==='amount-asc' ? 'bg-white/10 text-white' : 'text-white/70 hover:text-white'}`}>Worst</button>
          </div>
        </div>
      </div>

      {/* Grid of month cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3">
        {data.map((row) => {
          const { short, year } = getMonthName(row.ym);
          const positive = row.pnl >= 0;
          const pct = Math.min(100, Math.round((Math.abs(row.pnl)/maxAbs)*100));
          return (
            <div key={row.ym} className="rounded-lg bg-gradient-to-br from-white/5 to-white/0 border border-white/10 p-3 hover:border-white/20 transition-colors">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <div className="text-xs text-white/50">{year}</div>
                  <div className="text-base font-semibold text-white">{short}</div>
                </div>
                <div className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium border ${positive ? 'text-emerald-300 border-emerald-400/40 bg-emerald-500/10' : 'text-rose-300 border-rose-400/40 bg-rose-500/10'}`}>
                  {positive ? <ArrowUpRight className="w-3 h-3"/> : <ArrowDownRight className="w-3 h-3"/>}
                  {positive ? 'Profit' : 'Loss'}
                </div>
              </div>

              {/* Bar indicator */}
              <div className="h-2 w-full rounded bg-white/5 overflow-hidden mb-2">
                <div className={`${positive ? 'bg-gradient-to-r from-emerald-400 to-lime-400' : 'bg-gradient-to-r from-rose-400 to-orange-400'}`} style={{ width: `${pct}%`, height: '100%' }} />
              </div>

              <div className="flex items-baseline justify-between">
                <div className={`text-lg font-bold ${positive ? 'text-emerald-300' : 'text-rose-300'}`}>
                  {positive ? '+' : ''}${row.pnl.toLocaleString(undefined,{maximumFractionDigits:2})}
                </div>
                <div className="text-right">
                  <div className="text-[10px] text-white/50">Payouts</div>
                  <div className="text-xs text-white/80">${row.payouts.toLocaleString()}</div>
                </div>
              </div>
              <div className="mt-1 flex items-center justify-between">
                <div className="text-[10px] text-white/50">Cost</div>
                <div className="text-xs text-white/60">${row.cost.toLocaleString()}</div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
