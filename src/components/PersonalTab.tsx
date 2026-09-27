import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, Legend
} from 'recharts';
import { TrendingUp, TrendingDown, DollarSign, Target, Award, Activity, Zap, ShieldAlert, Scale } from 'lucide-react';

interface PersonalTrade {
  id: string;
  broker: string | null;
  instrument: string | null;
  direction: string | null;
  entryPrice: string | number | null;
  exitPrice: string | number | null;
  quantity: string | number | null;
  amount: string | number;
  result: string;
  fees: string | number | null;
  riskReward: string | number | null;
  marginCallFees: string | number | null;
  notes: string | null;
  tradeDate: string;
  externalId: string | null;
  createdAt: string;
}

interface PersonalStats {
  totalTrades: number;
  wins: number;
  losses: number;
  winRate: number;
  totalPnL: number;
  avgWin: number;
  avgLoss: number;
  bestTrade: number;
  worstTrade: number;
  avgFees: number;
  totalFees: number;
  avgRR: number;
  marginCallCount: number;
  totalMarginCallFees: number;
  byInstrument: { instrument: string; count: number; wins: number; losses: number; winRate: number; pnl: number }[];
  dailyPnL: { date: string; pnl: number; cumulative: number }[];
}

const fmtUSD = (n: number) => {
  const sign = n < 0 ? '-' : '';
  return `${sign}$${Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

const fmtDate = (d: string) => {
  const dt = new Date(d);
  return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};



export const PersonalTab: React.FC = () => {
  const [trades, setTrades] = useState<PersonalTrade[]>([]);
  const [stats, setStats] = useState<PersonalStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showNetPnL, setShowNetPnL] = useState(false);

  const getAuthHeaders = useCallback(() => {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    try {
      const raw = localStorage.getItem('user');
      if (raw) {
        const u = JSON.parse(raw);
        if (u?.id) headers['X-User-Id'] = String(u.id);
        if (u?.email) headers['X-User-Email'] = String(u.email);
        if (u?.name) headers['X-User-Name'] = String(u.name);
      }
    } catch {}
    return headers;
  }, []);

  const loadData = useCallback(async () => {
    try {
      const [tradesRes, statsRes] = await Promise.all([
        fetch('/.netlify/functions/db-personal-trades', { headers: getAuthHeaders() }),
        fetch('/.netlify/functions/db-personal-trades?action=stats', { headers: getAuthHeaders() }),
      ]);
      if (tradesRes.ok) {
        const data = await tradesRes.json();
        setTrades(data.trades || []);
      }
      if (statsRes.ok) {
        const data = await statsRes.json();
        setStats(data.stats || null);
      }
      if (!tradesRes.ok && !statsRes.ok) {
        setError('Failed to load personal trades');
      }
    } catch (e) {
      setError('Failed to load personal trades');
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [getAuthHeaders]);

  useEffect(() => { loadData(); }, [loadData]);

  const winLossData = useMemo(() => {
    if (!stats) return [];
    return [
      { name: 'Wins', value: stats.wins, color: '#10b981' },
      { name: 'Losses', value: stats.losses, color: '#ef4444' },
    ];
  }, [stats]);

  const instrumentChartData = useMemo(() => {
    if (!stats?.byInstrument) return [];
    return stats.byInstrument.slice(0, 8);
  }, [stats]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-white/50 text-lg">Loading personal trades…</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-red-400 text-lg">{error}</div>
      </div>
    );
  }

  if (!stats || stats.totalTrades === 0) {
    return (
      <div className="text-center py-16">
        <Activity className="w-16 h-16 mx-auto mb-4 text-white/20" />
        <h2 className="text-2xl font-bold text-white/80 mb-2">No Personal Trades Yet</h2>
        <p className="text-white/50 max-w-md mx-auto">
          Your NinjaTrader trades will appear here automatically once the bot starts logging them.
          Connect the bot to the NinjaTrader MCP to begin.
        </p>
      </div>
    );
  }

  const grossPnL = stats.totalPnL;
  const netPnL = stats.totalPnL - stats.totalFees;
  const displayPnL = showNetPnL ? netPnL : grossPnL;

  return (
    <div className="space-y-6">
      {/* P&L Toggle */}
      <div className="flex items-center justify-center gap-3 mb-2">
        <button
          onClick={() => setShowNetPnL(false)}
          className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
            !showNetPnL ? 'bg-white/15 text-white border border-white/30' : 'text-white/50 hover:text-white/70 border border-transparent'
          }`}
        >
          Gross P&L
        </button>
        <button
          onClick={() => setShowNetPnL(true)}
          className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
            showNetPnL ? 'bg-white/15 text-white border border-white/30' : 'text-white/50 hover:text-white/70 border border-transparent'
          }`}
        >
          Net P&L (after fees)
        </button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
        <StatCard
          icon={<DollarSign className="w-5 h-5" />}
          label={showNetPnL ? 'Net P&L' : 'Gross P&L'}
          value={fmtUSD(displayPnL)}
          color={displayPnL >= 0 ? 'text-emerald-400' : 'text-red-400'}
          subValue={showNetPnL ? `Gross: ${fmtUSD(grossPnL)} · Fees: ${fmtUSD(stats.totalFees)}` : `After fees: ${fmtUSD(netPnL)}`}
        />
        <StatCard
          icon={<Target className="w-5 h-5" />}
          label="Win Rate"
          value={`${stats.winRate.toFixed(1)}%`}
          color={stats.winRate >= 50 ? 'text-emerald-400' : 'text-amber-400'}
          subValue={`${stats.wins}W / ${stats.losses}L`}
        />
        <StatCard
          icon={<Award className="w-5 h-5" />}
          label="Total Wins"
          value={String(stats.wins)}
          color="text-emerald-400"
        />
        <StatCard
          icon={<Zap className="w-5 h-5" />}
          label="Total Losses"
          value={String(stats.losses)}
          color="text-red-400"
        />
        <StatCard
          icon={<TrendingUp className="w-5 h-5" />}
          label="Best Trade"
          value={fmtUSD(stats.bestTrade)}
          color="text-emerald-400"
        />
        <StatCard
          icon={<TrendingDown className="w-5 h-5" />}
          label="Worst Trade"
          value={fmtUSD(stats.worstTrade)}
          color="text-red-400"
        />
        <StatCard
          icon={<Activity className="w-5 h-5" />}
          label="Total Trades"
          value={String(stats.totalTrades)}
          color="text-white"
        />
        <StatCard
          icon={<DollarSign className="w-5 h-5" />}
          label="Total Fees"
          value={fmtUSD(stats.totalFees)}
          color="text-amber-400"
        />
        <StatCard
          icon={<Scale className="w-5 h-5" />}
          label="Avg R:R"
          value={stats.avgRR > 0 ? `${stats.avgRR.toFixed(2)}R` : '—'}
          color={stats.avgRR >= 1 ? 'text-emerald-400' : 'text-amber-400'}
          subValue={stats.avgRR > 0 ? `${stats.avgRR >= 1 ? 'Profitable' : 'Unprofitable'}` : undefined}
        />
        <StatCard
          icon={<ShieldAlert className="w-5 h-5" />}
          label="Margin Call Fees"
          value={fmtUSD(stats.totalMarginCallFees)}
          color={stats.totalMarginCallFees > 0 ? 'text-red-400' : 'text-emerald-400'}
          subValue={stats.marginCallCount > 0 ? `${stats.marginCallCount} liquidation${stats.marginCallCount > 1 ? 's' : ''}` : 'None'}
        />
      </div>

      {/* Equity Curve */}
      {stats.dailyPnL.length > 0 && (
        <div className="bg-white/5 rounded-xl border border-white/10 p-4 sm:p-6">
          <h3 className="text-lg font-semibold text-white/90 mb-4 flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-cyan-400" />
            Equity Curve
          </h3>
          <ResponsiveContainer width="100%" height={280}>
            <AreaChart data={stats.dailyPnL}>
              <defs>
                <linearGradient id="equityGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#22d3ee" stopOpacity={0.4} />
                  <stop offset="100%" stopColor="#22d3ee" stopOpacity={0.05} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis
                dataKey="date"
                stroke="rgba(255,255,255,0.4)"
                fontSize={11}
                tickFormatter={(v) => new Date(v).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              />
              <YAxis
                stroke="rgba(255,255,255,0.4)"
                fontSize={11}
                tickFormatter={(v) => `$${v.toLocaleString()}`}
              />
              <Tooltip
                contentStyle={{
                  background: 'rgba(2,4,8,0.95)',
                  border: '1px solid rgba(255,255,255,0.15)',
                  borderRadius: '8px',
                  color: '#fff',
                }}
                itemStyle={{ color: '#fff' }}
                labelStyle={{ color: '#fff' }}
                labelFormatter={(v) => fmtDate(v as string)}
                formatter={(v: number) => fmtUSD(v)}
              />
              <Area
                type="monotone"
                dataKey="cumulative"
                stroke="#22d3ee"
                strokeWidth={2}
                fill="url(#equityGradient)"
                name="Cumulative P&L"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Win/Loss Pie + Instrument Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
        {/* Win/Loss Pie */}
        <div className="bg-white/5 rounded-xl border border-white/10 p-4 sm:p-6">
          <h3 className="text-lg font-semibold text-white/90 mb-4">Win / Loss Distribution</h3>
          <ResponsiveContainer width="100%" height={240}>
            <PieChart>
              <Pie
                data={winLossData}
                cx="50%"
                cy="50%"
                innerRadius={55}
                outerRadius={85}
                paddingAngle={3}
                dataKey="value"
              >
                {winLossData.map((entry, i) => (
                  <Cell key={i} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{
                  background: 'rgba(2,4,8,0.95)',
                  border: '1px solid rgba(255,255,255,0.15)',
                  borderRadius: '8px',
                  color: '#fff',
                }}
                itemStyle={{ color: '#fff' }}
                labelStyle={{ color: '#fff' }}
                formatter={(value: number, name: string) => [`${value} trades`, name]}
              />
              <Legend wrapperStyle={{ color: 'rgba(255,255,255,0.7)' }} />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* Instrument P&L Bar Chart */}
        {instrumentChartData.length > 0 && (
          <div className="bg-white/5 rounded-xl border border-white/10 p-4 sm:p-6">
            <h3 className="text-lg font-semibold text-white/90 mb-4">P&L by Instrument</h3>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={instrumentChartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis
                  dataKey="instrument"
                  stroke="rgba(255,255,255,0.4)"
                  fontSize={11}
                />
                <YAxis
                  stroke="rgba(255,255,255,0.4)"
                  fontSize={11}
                  tickFormatter={(v) => `$${v.toLocaleString()}`}
                />
                <Tooltip
                  contentStyle={{
                    background: 'rgba(2,4,8,0.95)',
                    border: '1px solid rgba(255,255,255,0.15)',
                    borderRadius: '8px',
                    color: '#fff',
                  }}
                  itemStyle={{ color: '#fff' }}
                  labelStyle={{ color: '#fff' }}
                  formatter={(v: number) => fmtUSD(v)}
                />
                <Bar dataKey="pnl" name="P&L" radius={[4, 4, 0, 0]}>
                  {instrumentChartData.map((_, i) => (
                    <Cell key={i} fill={instrumentChartData[i].pnl >= 0 ? '#10b981' : '#ef4444'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* Instrument Stats Table */}
      {stats.byInstrument.length > 0 && (
        <div className="bg-white/5 rounded-xl border border-white/10 p-4 sm:p-6">
          <h3 className="text-lg font-semibold text-white/90 mb-4">Instrument Breakdown</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-white/50 border-b border-white/10">
                  <th className="text-left py-2 px-3 font-medium">Instrument</th>
                  <th className="text-right py-2 px-3 font-medium">Trades</th>
                  <th className="text-right py-2 px-3 font-medium">Wins</th>
                  <th className="text-right py-2 px-3 font-medium">Losses</th>
                  <th className="text-right py-2 px-3 font-medium">Win Rate</th>
                  <th className="text-right py-2 px-3 font-medium">P&L</th>
                </tr>
              </thead>
              <tbody>
                {stats.byInstrument.map((row) => (
                  <tr key={row.instrument} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                    <td className="py-2 px-3 font-mono text-white/90">{row.instrument}</td>
                    <td className="text-right py-2 px-3 text-white/70">{row.count}</td>
                    <td className="text-right py-2 px-3 text-emerald-400">{row.wins}</td>
                    <td className="text-right py-2 px-3 text-red-400">{row.losses}</td>
                    <td className="text-right py-2 px-3 text-white/70">{row.winRate.toFixed(1)}%</td>
                    <td className={`text-right py-2 px-3 font-medium ${row.pnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                      {fmtUSD(row.pnl)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Trades Table */}
      <div className="bg-white/5 rounded-xl border border-white/10 p-4 sm:p-6">
        <h3 className="text-lg font-semibold text-white/90 mb-4">Trade History</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-white/50 border-b border-white/10">
                <th className="text-left py-2 px-3 font-medium">Date</th>
                <th className="text-left py-2 px-3 font-medium">Instrument</th>
                <th className="text-left py-2 px-3 font-medium">Direction</th>
                <th className="text-right py-2 px-3 font-medium hidden sm:table-cell">Entry</th>
                <th className="text-right py-2 px-3 font-medium hidden sm:table-cell">Exit</th>
                <th className="text-right py-2 px-3 font-medium">P&L</th>
                <th className="text-left py-2 px-3 font-medium hidden sm:table-cell">Notes</th>
              </tr>
            </thead>
            <tbody>
              {trades.map((t) => {
                const pnl = parseFloat(String(t.amount)) || 0;
                const signedPnL = pnl < 0 ? pnl : (t.result === 'loss' ? -Math.abs(pnl) : Math.abs(pnl));
                return (
                  <tr key={t.id} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                    <td className="py-2 px-3 text-white/70 whitespace-nowrap">{fmtDate(t.tradeDate)}</td>
                    <td className="py-2 px-3 font-mono text-white/90">{t.instrument || '—'}</td>
                    <td className="py-2 px-3">
                      <span className={`text-xs px-2 py-0.5 rounded ${
                        t.direction === 'long' ? 'bg-emerald-500/20 text-emerald-400' :
                        t.direction === 'short' ? 'bg-red-500/20 text-red-400' :
                        'text-white/40'
                      }`}>
                        {t.direction || '—'}
                      </span>
                    </td>
                    <td className="text-right py-2 px-3 text-white/60 font-mono hidden sm:table-cell">
                      {t.entryPrice ? parseFloat(String(t.entryPrice)).toFixed(2) : '—'}
                    </td>
                    <td className="text-right py-2 px-3 text-white/60 font-mono hidden sm:table-cell">
                      {t.exitPrice ? parseFloat(String(t.exitPrice)).toFixed(2) : '—'}
                    </td>
                    <td className={`text-right py-2 px-3 font-medium ${signedPnL >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                      {fmtUSD(signedPnL)}
                    </td>
                    <td className="py-2 px-3 text-white/40 text-xs max-w-48 truncate hidden sm:table-cell">
                      {t.notes || ''}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

const StatCard: React.FC<{
  icon: React.ReactNode;
  label: string;
  value: string;
  color: string;
  subValue?: string;
}> = ({ icon, label, value, color, subValue }) => (
  <div className="bg-white/5 rounded-xl border border-white/10 p-4 flex flex-col gap-1">
    <div className="flex items-center gap-2 text-white/50 text-xs">
      {icon}
      {label}
    </div>
    <div className={`text-xl font-bold ${color}`}>{value}</div>
    {subValue && <div className="text-xs text-white/40">{subValue}</div>}
  </div>
);
