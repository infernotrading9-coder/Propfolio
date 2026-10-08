import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, Legend
} from 'recharts';
import { TrendingUp, TrendingDown, DollarSign, Target, Award, Activity, Zap, ShieldAlert, Scale, Wallet, BookOpen, Filter } from 'lucide-react';

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
  strategy: string | null;
  slType: string | null;
  tpMethod: string | null;
  tryCounter: number | null;
  stuckToSize: string | null;
  tradeDate: string;
  externalId: string | null;
  createdAt: string;
}

interface PersonalStats {
  balance: number | null;
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
  byInstrumentRaw: { instrument: string; count: number; wins: number; losses: number; winRate: number; pnl: number }[];
  dailyPnL: { date: string; pnl: number; cumulative: number }[];
  byStrategy: { strategy: string; count: number; wins: number; losses: number; winRate: number; pnl: number }[];
  bySlType: { slType: string; count: number; wins: number; losses: number; winRate: number; pnl: number }[];
  byTpMethod: { tpMethod: string; count: number; wins: number; losses: number; winRate: number; pnl: number }[];
  byTryCounter: { tryCounter: string; count: number; wins: number; losses: number; winRate: number; pnl: number }[];
  byStuckToSize: { stuckToSize: string; count: number; wins: number; losses: number; winRate: number; pnl: number }[];
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
  const [strategies, setStrategies] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showNetPnL, setShowNetPnL] = useState(false);
  const [showBalanceCurve, setShowBalanceCurve] = useState(false);
  const [showLumped, setShowLumped] = useState(true);

  // Strategy dropdown state
  const [strategyInput, setStrategyInput] = useState('');
  const [strategyDropdownOpen, setStrategyDropdownOpen] = useState<string | null>(null);
  const [filteredStrategies, setFilteredStrategies] = useState<string[]>([]);

  // Advanced strategy modal
  const [showStrategyModal, setShowStrategyModal] = useState(false);
  const [modalTrade, setModalTrade] = useState<PersonalTrade | null>(null);
  const [modalStrategy, setModalStrategy] = useState('');
  const [modalSlType, setModalSlType] = useState('');
  const [modalTpMethod, setModalTpMethod] = useState('');
  const [modalTryCounter, setModalTryCounter] = useState(0);
  const [modalStuckToSize, setModalStuckToSize] = useState('');

  const dropdownRef = useRef<HTMLDivElement>(null);
  const strategyInputRef = useRef<HTMLInputElement>(null);

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
      const [tradesRes, statsRes, stratRes] = await Promise.all([
        fetch('/.netlify/functions/db-personal-trades', { headers: getAuthHeaders() }),
        fetch('/.netlify/functions/db-personal-trades?action=stats', { headers: getAuthHeaders() }),
        fetch('/.netlify/functions/db-personal-trades', {
          method: 'POST',
          headers: getAuthHeaders(),
          body: JSON.stringify({ action: 'strategies' }),
        }),
      ]);
      if (tradesRes.ok) {
        const data = await tradesRes.json();
        setTrades(data.trades || []);
      }
      if (statsRes.ok) {
        const data = await statsRes.json();
        setStats(data.stats || null);
      }
      if (stratRes.ok) {
        const data = await stratRes.json();
        setStrategies(data.strategies || []);
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

  // Save trade metadata via API
  const saveTradeMeta = useCallback(async (tradeId: string, meta: {
    strategy?: string | null; slType?: string | null; tpMethod?: string | null; tryCounter?: number | null; stuckToSize?: string | null; notes?: string | null;
  }) => {
    // Build payload — only send non-undefined fields (null = clear the DB column)
    const body: any = { action: 'update-trade', id: tradeId };
    ['strategy','slType','tpMethod','stuckToSize','notes'].forEach(k => {
      if ((meta as any)[k] !== undefined) body[k] = (meta as any)[k];
    });
    if (meta.tryCounter !== undefined) body.tryCounter = meta.tryCounter;
    const res = await fetch('/.netlify/functions/db-personal-trades', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(body),
    });
    if (res.ok) {
      const data = await res.json();
      if (data?.trade) {
        setTrades(prev => prev.map(t => t.id === tradeId ? { ...t, ...data.trade } : t));
        // Reload stats to reflect updated data
        const statsRes = await fetch('/.netlify/functions/db-personal-trades?action=stats', { headers: getAuthHeaders() });
        if (statsRes.ok) {
          const statsData = await statsRes.json();
          setStats(statsData.stats || null);
        }
        // Reload strategies list
        const stratRes = await fetch('/.netlify/functions/db-personal-trades', {
          method: 'POST', headers: getAuthHeaders(),
          body: JSON.stringify({ action: 'strategies' }),
        });
        if (stratRes.ok) {
          const stratData = await stratRes.json();
          setStrategies(stratData.strategies || []);
        }
      }
    }
  }, [getAuthHeaders]);

  // Strategy dropdown logic
  const openStrategyDropdown = useCallback((trade: PersonalTrade) => {
    setStrategyDropdownOpen(trade.id);
    setStrategyInput(trade.strategy || '');
    setFilteredStrategies(strategies.filter(s => !trade.strategy || s !== trade.strategy));
  }, [strategies]);

  const closeStrategyDropdown = useCallback(() => {
    setStrategyDropdownOpen(null);
    setStrategyInput('');
    setFilteredStrategies([]);
  }, []);

  const selectStrategy = useCallback(async (tradeId: string, strategy: string) => {
    await saveTradeMeta(tradeId, { strategy });
    closeStrategyDropdown();
  }, [saveTradeMeta, closeStrategyDropdown]);

  const handleStrategyInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setStrategyInput(val);
    setFilteredStrategies(
      strategies.filter(s => s.toLowerCase().includes(val.toLowerCase()) && s !== val)
    );
  }, [strategies]);

  const handleStrategyInputKeyDown = useCallback(async (e: React.KeyboardEvent, tradeId: string) => {
    if (e.key === 'Enter' && strategyInput.trim()) {
      e.preventDefault();
      await selectStrategy(tradeId, strategyInput.trim());
    } else if (e.key === 'Escape') {
      closeStrategyDropdown();
    }
  }, [strategyInput, selectStrategy, closeStrategyDropdown]);

  // Open advanced strategy modal
  const openAdvancedModal = useCallback((trade: PersonalTrade) => {
    setModalTrade(trade);
    setModalStrategy(trade.strategy || '');
    setModalSlType(trade.slType || '');
    setModalTpMethod(trade.tpMethod || '');
    setModalTryCounter(trade.tryCounter || 0);
    setModalStuckToSize(trade.stuckToSize || '');
    setShowStrategyModal(true);
  }, []);

  const saveAdvancedModal = useCallback(async () => {
    if (!modalTrade) return;
    await saveTradeMeta(modalTrade.id, {
      strategy: modalStrategy || null,
      slType: modalSlType || null,
      tpMethod: modalTpMethod || null,
      tryCounter: modalTryCounter > 0 ? modalTryCounter : null,
      stuckToSize: modalStuckToSize || null,
    });
    setShowStrategyModal(false);
    setModalTrade(null);
  }, [modalTrade, modalStrategy, modalSlType, modalTpMethod, modalTryCounter, modalStuckToSize, saveTradeMeta]);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        closeStrategyDropdown();
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [closeStrategyDropdown]);

  const winLossData = useMemo(() => {
    if (!stats) return [];
    return [
      { name: 'Wins', value: stats.wins, color: '#10b981' },
      { name: 'Losses', value: stats.losses, color: '#ef4444' },
    ];
  }, [stats]);

  // Use lumped or raw instrument data based on toggle
  const instrumentChartData = useMemo(() => {
    if (!stats) return [];
    const source = showLumped ? stats.byInstrument : stats.byInstrumentRaw;
    return source.slice(0, 8);
  }, [stats, showLumped]);

  // Strategy chart data
  const strategyChartData = useMemo(() => {
    if (!stats?.byStrategy) return [];
    return stats.byStrategy.filter(s => s.count >= 1);
  }, [stats]);

  // Build equity curve data — MUST be before early returns (React hooks order)
  const equityData = useMemo(() => {
    if (!stats?.dailyPnL) return [];
    if (showBalanceCurve && stats.balance != null) {
      let cum = stats.balance;
      const reversed = [...stats.dailyPnL].reverse();
      const built: { date: string; pnl: number; cumulative: number }[] = [];
      for (const d of reversed) {
        built.push({ date: d.date, pnl: cum - (cum - d.pnl), cumulative: cum });
        cum -= d.pnl;
      }
      return built.reverse();
    }
    return stats.dailyPnL;
  }, [stats, showBalanceCurve]);

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

  if (!stats) {
    return (
      <div className="text-center py-16">
        <Activity className="w-16 h-16 mx-auto mb-4 text-white/20" />
        <h2 className="text-2xl font-bold text-white/80 mb-2">No Personal Data</h2>
        <p className="text-white/50 max-w-md mx-auto">Nothing to show yet.</p>
      </div>
    );
  }

  const grossPnL = stats.totalPnL;
  const netPnL = stats.totalPnL - stats.totalFees;
  const displayPnL = showNetPnL ? netPnL : grossPnL;
  const hasTrades = stats.totalTrades > 0;
  const balance = stats.balance ?? 0;

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
        <StatCard
          icon={<Wallet className="w-5 h-5" />}
          label="Balance"
          value={stats.balance != null ? fmtUSD(balance) : '—'}
          color={balance >= 0 ? 'text-cyan-400' : 'text-red-400'}
          subValue="NinjaTrader account"
        />
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

      {/* P&L Toggle */}
      <div className="flex items-center justify-center gap-2 mb-1">
        <button onClick={() => setShowNetPnL(false)}
          className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
            !showNetPnL ? 'bg-white/15 text-white border border-white/30' : 'text-white/50 hover:text-white/70 border border-transparent'
          }`}>Gross P&amp;L</button>
        <button onClick={() => setShowNetPnL(true)}
          className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
            showNetPnL ? 'bg-white/15 text-white border border-white/30' : 'text-white/50 hover:text-white/70 border border-transparent'
          }`}>Net P&amp;L</button>
      </div>

      {!hasTrades && (
        <div className="text-center py-12">
          <Activity className="w-14 h-14 mx-auto mb-3 text-white/20" />
          <h3 className="text-xl font-bold text-white/70 mb-1">No Personal Trades Yet</h3>
          <p className="text-white/45 max-w-md mx-auto text-sm">
            Your NinjaTrader trades will appear here automatically once the bot starts logging them.
          </p>
        </div>
      )}

      {/* Equity Curve */}
      {stats.dailyPnL.length > 0 && (
        <div className="bg-white/5 rounded-xl border border-white/10 p-4 sm:p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-white/90 flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-cyan-400" />
              {showBalanceCurve ? 'Balance Trend' : 'Cumulative P&L'}
            </h3>
            <div className="flex gap-1.5">
              <button onClick={() => setShowBalanceCurve(false)}
                className={`px-2.5 py-1 text-xs font-medium rounded-lg transition-colors ${
                  !showBalanceCurve ? 'bg-white/15 text-white border border-white/30' : 'text-white/50 hover:text-white/70 border border-transparent'
                }`}>P&L Curve</button>
              <button onClick={() => setShowBalanceCurve(true)}
                className={`px-2.5 py-1 text-xs font-medium rounded-lg transition-colors ${
                  showBalanceCurve ? 'bg-white/15 text-white border border-white/30' : 'text-white/50 hover:text-white/70 border border-transparent'
                }`}>Balance</button>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={280}>
            <AreaChart data={equityData}>
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
                name={showBalanceCurve ? 'Balance' : 'Cumulative P&L'}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Win/Loss Pie + Instrument Breakdown */}
      {hasTrades && (
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
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-white/90 flex items-center gap-2">
                <Filter className="w-4 h-4 text-white/50" />
                P&L by Instrument
              </h3>
              <div className="flex gap-1.5">
                <button onClick={() => setShowLumped(true)}
                  className={`px-2.5 py-1 text-xs font-medium rounded-lg transition-colors ${
                    showLumped ? 'bg-white/15 text-white border border-white/30' : 'text-white/50 hover:text-white/70 border border-transparent'
                  }`}>Lumped</button>
                <button onClick={() => setShowLumped(false)}
                  className={`px-2.5 py-1 text-xs font-medium rounded-lg transition-colors ${
                    !showLumped ? 'bg-white/15 text-white border border-white/30' : 'text-white/50 hover:text-white/70 border border-transparent'
                  }`}>By Contract</button>
              </div>
            </div>
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
      )}

      {/* Strategy Stats */}
      {hasTrades && strategyChartData.length > 0 && (
        <div className="bg-white/5 rounded-xl border border-white/10 p-4 sm:p-6">
          <h3 className="text-lg font-semibold text-white/90 mb-4 flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-purple-400" />
            Strategy Breakdown
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-white/50 border-b border-white/10">
                  <th className="text-left py-2 px-3 font-medium">Strategy</th>
                  <th className="text-right py-2 px-3 font-medium">Trades</th>
                  <th className="text-right py-2 px-3 font-medium">Wins</th>
                  <th className="text-right py-2 px-3 font-medium">Losses</th>
                  <th className="text-right py-2 px-3 font-medium">Win Rate</th>
                  <th className="text-right py-2 px-3 font-medium">P&L</th>
                </tr>
              </thead>
              <tbody>
                {strategyChartData.map((row) => (
                  <tr key={row.strategy} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                    <td className="py-2 px-3 font-mono text-white/90">{row.strategy}</td>
                    <td className="text-right py-2 px-3 text-white/70">{row.count}</td>
                    <td className="text-right py-2 px-3 text-emerald-400">{row.wins}</td>
                    <td className="text-right py-2 px-3 text-red-400">{row.losses}</td>
                    <td className={`text-right py-2 px-3 font-medium ${row.winRate >= 50 ? 'text-emerald-400' : 'text-amber-400'}`}>
                      {row.winRate.toFixed(1)}%
                    </td>
                    <td className={`text-right py-2 px-3 font-medium ${row.pnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                      {fmtUSD(row.pnl)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Checkbox breakdown */}
          {stats.bySlType.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-6">
            {stats.bySlType.length > 0 && (
              <BreakdownCard title="SL Type" data={stats.bySlType} keyField="slType" />
            )}
            {stats.byTpMethod.length > 0 && (
              <BreakdownCard title="TP Method" data={stats.byTpMethod} keyField="tpMethod" />
            )}
            {stats.byTryCounter.length > 0 && (
              <BreakdownCard title="Try Counter" data={stats.byTryCounter} keyField="tryCounter" />
            )}
            {stats.byStuckToSize.length > 0 && (
              <BreakdownCard title="Stuck to Size" data={stats.byStuckToSize} keyField="stuckToSize" />
            )}
          </div>
          )}
        </div>
      )}

      {/* Instrument Stats Table */}
      {instrumentChartData.length > 0 && (
        <div className="bg-white/5 rounded-xl border border-white/10 p-4 sm:p-6">
          <h3 className="text-lg font-semibold text-white/90 mb-4">Instrument Breakdown</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-white/50 border-b border-white/10">
                  <th className="text-left py-2 px-3 font-medium">{showLumped ? 'Instrument' : 'Contract'}</th>
                  <th className="text-right py-2 px-3 font-medium">Trades</th>
                  <th className="text-right py-2 px-3 font-medium">Wins</th>
                  <th className="text-right py-2 px-3 font-medium">Losses</th>
                  <th className="text-right py-2 px-3 font-medium">Win Rate</th>
                  <th className="text-right py-2 px-3 font-medium">P&L</th>
                </tr>
              </thead>
              <tbody>
                {(showLumped ? stats.byInstrument : stats.byInstrumentRaw).map((row) => (
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
      {hasTrades && (
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
                <th className="text-left py-2 px-3 font-medium">Strategy</th>
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
                    <td className="py-2 px-3 relative">
                      {strategyDropdownOpen === t.id ? (
                        <div ref={dropdownRef} className="relative z-20">
                          <input
                            ref={strategyInputRef}
                            type="text"
                            className="w-28 bg-white/10 border border-white/20 rounded px-2 py-1 text-xs text-white outline-none focus:border-purple-400"
                            placeholder="Type strategy..."
                            value={strategyInput}
                            onChange={handleStrategyInputChange}
                            onKeyDown={(e) => handleStrategyInputKeyDown(e, t.id)}
                            autoFocus
                          />
                          {filteredStrategies.length > 0 && (
                            <div className="absolute top-full left-0 mt-1 w-40 bg-[#020408] border border-white/15 rounded-lg shadow-xl overflow-hidden z-30">
                              {filteredStrategies.map((s) => (
                                <button
                                  key={s}
                                  className="block w-full text-left px-3 py-1.5 text-xs text-white/80 hover:bg-white/5 transition-colors"
                                  onClick={() => selectStrategy(t.id, s)}
                                >{s}</button>
                              ))}
                            </div>
                          )}
                        </div>
                      ) : (
                        <button
                          className="text-xs px-2 py-1 rounded bg-white/5 hover:bg-white/10 border border-white/10 transition-colors text-white/70 font-mono max-w-28 truncate"
                          onClick={() => openStrategyDropdown(t)}
                          onDoubleClick={() => openAdvancedModal(t)}
                          title="Click to edit · Double-click for advanced"
                        >
                          {t.strategy || '+ add'}
                        </button>
                      )}
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
      )}

      {/* Advanced Strategy Modal */}
      {showStrategyModal && modalTrade && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm" onClick={() => setShowStrategyModal(false)}>
          <div className="bg-[#020408] border border-white/15 rounded-2xl p-6 w-full max-w-md mx-4 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-white mb-4">
              Strategy — {modalTrade.instrument || 'Trade'} ({fmtDate(modalTrade.tradeDate)})
            </h3>

            {/* Strategy name input */}
            <div className="mb-4">
              <label className="block text-xs text-white/50 mb-1.5">Strategy Name</label>
              <input
                type="text"
                className="w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white text-sm outline-none focus:border-purple-400"
                value={modalStrategy}
                onChange={(e) => setModalStrategy(e.target.value)}
                placeholder="Name this trade's strategy..."
                list="strategy-options"
              />
              <datalist id="strategy-options">
                {strategies.map((s) => <option key={s} value={s} />)}
              </datalist>
            </div>

            {/* SL Type */}
            <div className="mb-4">
              <label className="block text-xs text-white/50 mb-2">What type of SL?</label>
              <div className="flex gap-2">
                {['', 'mental', 'hard'].map((opt) => (
                  <button
                    key={opt}
                    onClick={() => setModalSlType(opt)}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors flex-1 ${
                      modalSlType === opt
                        ? 'bg-purple-500/20 text-purple-300 border border-purple-400/40'
                        : 'bg-white/5 text-white/50 border border-white/10 hover:bg-white/10'
                    }`}
                  >{opt || '—'}</button>
                ))}
              </div>
            </div>

            {/* TP Method */}
            <div className="mb-4">
              <label className="block text-xs text-white/50 mb-2">How did you TP?</label>
              <div className="flex gap-2">
                {['', 'market', 'limit'].map((opt) => (
                  <button
                    key={opt}
                    onClick={() => setModalTpMethod(opt)}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors flex-1 ${
                      modalTpMethod === opt
                        ? 'bg-purple-500/20 text-purple-300 border border-purple-400/40'
                        : 'bg-white/5 text-white/50 border border-white/10 hover:bg-white/10'
                    }`}
                  >{opt || '—'}</button>
                ))}
              </div>
            </div>

            {/* Try Counter */}
            <div className="mb-4">
              <label className="block text-xs text-white/50 mb-2">Try counter (attempts before giving up)</label>
              <div className="flex gap-1.5">
                {[0, 1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    onClick={() => setModalTryCounter(n)}
                    className={`w-10 h-10 rounded-lg text-sm font-medium transition-colors ${
                      modalTryCounter === n
                        ? 'bg-purple-500/20 text-purple-300 border border-purple-400/40'
                        : 'bg-white/5 text-white/50 border border-white/10 hover:bg-white/10'
                    }`}
                  >{n || '—'}</button>
                ))}
              </div>
            </div>

            {/* Stuck to Size */}
            <div className="mb-6">
              <label className="block text-xs text-white/50 mb-2">Stuck to size?</label>
              <div className="flex gap-2">
                {['', 'yes', 'no'].map((opt) => (
                  <button
                    key={opt}
                    onClick={() => setModalStuckToSize(opt)}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors flex-1 ${
                      modalStuckToSize === opt
                        ? 'bg-purple-500/20 text-purple-300 border border-purple-400/40'
                        : 'bg-white/5 text-white/50 border border-white/10 hover:bg-white/10'
                    }`}
                  >{opt || '—'}</button>
                ))}
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-3">
              <button
                onClick={() => setShowStrategyModal(false)}
                className="flex-1 px-4 py-2.5 rounded-lg border border-white/20 text-white/60 hover:text-white/80 transition-colors text-sm"
              >Cancel</button>
              <button
                onClick={saveAdvancedModal}
                className="flex-1 px-4 py-2.5 rounded-lg bg-purple-500 text-white hover:bg-purple-400 transition-colors text-sm font-medium"
              >Save</button>
            </div>
          </div>
        </div>
      )}
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

const BreakdownCard: React.FC<{
  title: string;
  data: { [key: string]: any }[];
  keyField: string;
}> = ({ title, data, keyField }) => (
  <div className="bg-white/5 rounded-lg border border-white/10 p-3">
    <h4 className="text-xs font-semibold text-white/60 mb-2 uppercase tracking-wider">{title}</h4>
    <div className="space-y-1.5">
      {data.map((row) => (
        <div key={row[keyField]} className="flex items-center justify-between text-xs">
          <span className="text-white/70 font-mono">{row[keyField]}</span>
          <div className="flex items-center gap-2">
            <span className="text-white/50">{row.count}t · {row.winRate.toFixed(0)}%</span>
            <span className={row.pnl >= 0 ? 'text-emerald-400' : 'text-red-400'}>
              {fmtUSD(row.pnl)}
            </span>
          </div>
        </div>
      ))}
    </div>
  </div>
);