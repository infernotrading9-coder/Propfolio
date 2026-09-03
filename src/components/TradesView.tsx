import React, { useState, useEffect, useCallback } from 'react';
import { TrendingUp, TrendingDown, Target, Activity, DollarSign, Percent, ArrowUpRight, ArrowDownRight, Trash2, Trophy, Brain, Shield, ShieldAlert } from 'lucide-react';

interface Trade {
  id: string;
  accountId: string;
  accountName?: string;
  accountFirm?: string;
  direction?: string | null;
  instrument?: string | null;
  entryPrice?: string | null;
  exitPrice?: string | null;
  amount: string;
  result: 'win' | 'loss';
  riskReward?: string | null;
  rulesFollowed?: boolean;
  rulesBroken?: string[] | null;
  behaviors?: string[] | null;
  notes?: string | null;
  tradeDate: string;
  createdAt: string;
}

interface BehaviorStat {
  behavior: string;
  count: number;
  wins: number;
  losses: number;
  winRate: number;
  totalPnL: number;
}

interface TradeStats {
  totalTrades: number;
  wins: number;
  losses: number;
  winRate: number;
  totalPnL: number;
  avgRR: number;
  avgWin: number;
  avgLoss: number;
  bestTrade: number;
  worstTrade: number;
  behaviorStats: BehaviorStat[];
  ruleCompliance: { rule: string; total: number; broken: number; complianceRate: number }[];
}

interface TradingAccount {
  id: string;
  name: string;
  firm: string;
  accountNumberLast4?: string | null;
  balance: string;
  drawdownUsed: string;
  highWaterMark: string;
  status: string;
  phase: string;
  rules?: string[] | null;
}

interface TradesViewProps {
  apiBase: string;
  getAuthHeaders: () => Record<string, string>;
}

const COMMON_BEHAVIORS = [
  'no-sl', 'sleepy', 'stoned', 'headache', 'revenge', 'fomo',
  'patient', 'disciplined', 'rushed', 'news', 'tilt', 'confident'
];

export const TradesView: React.FC<TradesViewProps> = ({ apiBase, getAuthHeaders }) => {
  const [trades, setTrades] = useState<Trade[]>([]);
  const [stats, setStats] = useState<TradeStats | null>(null);
  const [accounts, setAccounts] = useState<TradingAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [filterAccount, setFilterAccount] = useState<string>('all');

  const [formData, setFormData] = useState({
    accountId: '',
    direction: 'long',
    instrument: '',
    entryPrice: '',
    exitPrice: '',
    amount: '',
    result: 'win',
    riskReward: '',
    rulesFollowed: true,
    rulesBroken: [] as string[],
    behaviors: [] as string[],
    notes: '',
  });

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [tradesRes, statsRes, accountsRes] = await Promise.all([
        fetch(`${apiBase}/db-trades`, { headers: getAuthHeaders() }),
        fetch(`${apiBase}/db-trades?action=stats`, { headers: getAuthHeaders() }),
        fetch(`${apiBase}/db-accounts?all=true`, { headers: getAuthHeaders() }),
      ]);
      const tradesData = await tradesRes.json();
      const statsData = await statsRes.json();
      const accountsData = await accountsRes.json();

      if (tradesData.trades) {
        // Resolve names from ALL accounts (incl. lost/failed) so the log shows
        // the real account on every trade.
        const allAccounts = accountsData.accounts || [];
        const accountMap = new Map<string, any>(allAccounts.map((a: any) => [a.id, a]));
        setTrades(tradesData.trades.map((t: Trade) => ({
          ...t,
          accountName: accountMap.get(t.accountId)?.name,
          accountFirm: accountMap.get(t.accountId)?.firm,
        })));
      }
      if (statsData.stats) setStats(statsData.stats);
      if (accountsData.accounts) {
        // Form + filter dropdowns stay active-only — you don't log on a lost account.
        const activeAccounts = accountsData.accounts.filter((a: any) => a.status === 'active');
        setAccounts(activeAccounts);
      }
    } catch (e) {
      console.error('Failed to load trades data:', e);
    } finally {
      setLoading(false);
    }
  }, [apiBase, getAuthHeaders]);

  useEffect(() => { loadData(); }, [loadData]);

  const handleAddTrade = async () => {
    if (!formData.accountId || !formData.amount) return;
    try {
      // Route through the SAME cascade the bot uses.
      //
      // This used to POST without an `action`, hitting a legacy handler with
      // its own balance arithmetic, no transaction, no netting, no calendar
      // update and no undo entry. Logging a trade here vs. via Telegram
      // produced different numbers on the same account.
      const acct = accounts.find(a => a.id === formData.accountId);
      const signed = formData.result === 'loss'
        ? -Math.abs(parseFloat(formData.amount))
        : Math.abs(parseFloat(formData.amount));

      const res = await fetch(`${apiBase}/db-trades`, {
        method: 'POST',
        headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'log-trade',
          accountRef: acct?.accountNumberLast4 || acct?.name || formData.accountId,
          amount: signed,
          direction: formData.direction,
          instrument: formData.instrument || null,
          entryPrice: formData.entryPrice || null,
          exitPrice: formData.exitPrice || null,
          riskReward: formData.riskReward ? parseFloat(formData.riskReward) : null,
          rulesFollowed: formData.rulesFollowed,
          rulesBroken: formData.rulesBroken,
          behaviors: formData.behaviors,
          notes: formData.notes || null,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(body?.error || 'Failed to log trade.');
        return;
      }
      // Surface the same warnings the bot gets — drawdown breaches, unknown
      // plan rules, "this app can't see your broker balance", etc.
      if (Array.isArray(body?.warnings) && body.warnings.length) {
        alert(body.warnings.join('\n\n'));
      } else if (body?.verdict?.breached) {
        alert(body.verdict.message);
      }
      setShowAddForm(false);
      setFormData({ accountId: '', direction: 'long', instrument: '', entryPrice: '', exitPrice: '', amount: '', result: 'win', riskReward: '', rulesFollowed: true, rulesBroken: [], behaviors: [], notes: '' });
      loadData();
    } catch (e) { console.error('Failed to add trade:', e); }
  };

  const handleDeleteTrade = async (id: string) => {
    // Deleting used to remove the row WITHOUT reversing the balance, so the
    // account kept the P&L of a trade that no longer existed. Use the undo
    // journal instead, which reverses balance, HWM and calendar together.
    if (!confirm('Delete this trade and reverse its effect on the account balance?')) return;
    try {
      const res = await fetch(`${apiBase}/db-trades`, {
        method: 'DELETE',
        headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, reverseBalance: true }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        alert(body?.error || 'Failed to delete trade.');
        return;
      }
      loadData();
    } catch (e) { console.error('Failed to delete trade:', e); }
  };

  const toggleBehavior = (b: string) => {
    setFormData(prev => ({
      ...prev,
      behaviors: prev.behaviors.includes(b) ? prev.behaviors.filter(x => x !== b) : [...prev.behaviors, b],
    }));
  };

  const toggleRuleBroken = (r: string) => {
    setFormData(prev => ({
      ...prev,
      rulesBroken: prev.rulesBroken.includes(r) ? prev.rulesBroken.filter(x => x !== r) : [...prev.rulesBroken, r],
    }));
  };

  const filteredTrades = filterAccount === 'all' ? trades : trades.filter(t => t.accountId === filterAccount);

  if (loading) {
    return <div className="flex items-center justify-center py-20 text-gray-400">Loading trades...</div>;
  }

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Win Rate" value={stats ? `${stats.winRate.toFixed(1)}%` : '0%'} icon={<Percent className="w-5 h-5" />} color="text-neon-cyan" />
        <StatCard label="Total P&L" value={stats ? `$${stats.totalPnL >= 0 ? '+' : ''}${stats.totalPnL.toFixed(2)}` : '$0'} icon={<DollarSign className="w-5 h-5" />} color={stats && stats.totalPnL >= 0 ? 'text-neon-lime' : 'text-red-400'} />
        <StatCard label="Total Trades" value={stats?.totalTrades?.toString() || '0'} icon={<Activity className="w-5 h-5" />} color="text-neon-purple" />
        <StatCard label="Avg R:R" value={stats ? `${stats.avgRR.toFixed(2)}R` : '0R'} icon={<Target className="w-5 h-5" />} color="text-neon-amber" />
      </div>

      {/* Win/Loss Breakdown */}
      {stats && stats.totalTrades > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard label="Wins" value={stats.wins.toString()} icon={<TrendingUp className="w-5 h-5" />} color="text-neon-lime" />
          <StatCard label="Losses" value={stats.losses.toString()} icon={<TrendingDown className="w-5 h-5" />} color="text-red-400" />
          <StatCard label="Best Trade" value={`+$${stats.bestTrade.toFixed(2)}`} icon={<ArrowUpRight className="w-5 h-5" />} color="text-neon-lime" />
          <StatCard label="Worst Trade" value={`-$${Math.abs(stats.worstTrade).toFixed(2)}`} icon={<ArrowDownRight className="w-5 h-5" />} color="text-red-400" />
        </div>
      )}

      {/* Behavioral Impact Stats */}
      {stats && stats.behaviorStats && stats.behaviorStats.length > 0 && (
        <div className="bg-gray-900/60 border border-gray-800 rounded-xl p-6">
          <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
            <Brain className="w-5 h-5 text-neon-purple" />
            Behavioral Impact
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-gray-400 border-b border-gray-700">
                  <th className="text-left py-2 px-3">Behavior</th>
                  <th className="text-center py-2 px-3">Trades</th>
                  <th className="text-center py-2 px-3">W/L</th>
                  <th className="text-right py-2 px-3">Win Rate</th>
                  <th className="text-right py-2 px-3">P&L</th>
                </tr>
              </thead>
              <tbody>
                {stats.behaviorStats.map((bs) => (
                  <tr key={bs.behavior} className="border-b border-gray-800">
                    <td className="py-2 px-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${bs.winRate >= 50 ? 'bg-neon-lime/20 text-neon-lime' : 'bg-red-400/20 text-red-400'}`}>
                        {bs.behavior}
                      </span>
                    </td>
                    <td className="py-2 px-3 text-center text-gray-300">{bs.count}</td>
                    <td className="py-2 px-3 text-center text-gray-300">{bs.wins}W / {bs.losses}L</td>
                    <td className={`py-2 px-3 text-right font-semibold ${bs.winRate >= 50 ? 'text-neon-lime' : 'text-red-400'}`}>{bs.winRate.toFixed(0)}%</td>
                    <td className={`py-2 px-3 text-right font-semibold ${bs.totalPnL >= 0 ? 'text-neon-lime' : 'text-red-400'}`}>{bs.totalPnL >= 0 ? '+' : ''}${bs.totalPnL.toFixed(0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Rule Compliance Stats */}
      {stats && stats.ruleCompliance && stats.ruleCompliance.length > 0 && (
        <div className="bg-gray-900/60 border border-gray-800 rounded-xl p-6">
          <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
            <Shield className="w-5 h-5 text-neon-cyan" />
            Rule Compliance
          </h3>
          <div className="space-y-3">
            {stats.ruleCompliance.map((rc) => (
              <div key={rc.rule} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <ShieldAlert className={`w-4 h-4 ${rc.complianceRate >= 80 ? 'text-neon-lime' : rc.complianceRate >= 50 ? 'text-neon-amber' : 'text-red-400'}`} />
                  <span className="text-gray-300 text-sm">{rc.rule}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-gray-500 text-xs">{rc.broken} broken</span>
                  <div className="w-32 h-2 bg-gray-800 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full ${rc.complianceRate >= 80 ? 'bg-neon-lime' : rc.complianceRate >= 50 ? 'bg-neon-amber' : 'bg-red-400'}`}
                      style={{ width: `${rc.complianceRate}%` }}
                    />
                  </div>
                  <span className={`text-sm font-semibold w-12 text-right ${rc.complianceRate >= 80 ? 'text-neon-lime' : rc.complianceRate >= 50 ? 'text-neon-amber' : 'text-red-400'}`}>{rc.complianceRate.toFixed(0)}%</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Trades Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-white">Trade History</h2>
        <div className="flex gap-2">
          <select
            value={filterAccount}
            onChange={(e) => setFilterAccount(e.target.value)}
            className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200"
          >
            <option value="all">All Accounts</option>
            {accounts.map(a => <option key={a.id} value={a.id}>{a.name} ({a.firm})</option>)}
          </select>
          <button
            onClick={() => setShowAddForm(!showAddForm)}
            className="bg-gradient-to-r from-neon-purple to-neon-cyan text-white px-4 py-2 rounded-lg font-medium hover:opacity-90 transition"
          >
            + Log Trade
          </button>
        </div>
      </div>

      {/* Add Trade Form */}
      {showAddForm && (
        <div className="bg-gray-900/80 border border-gray-700 rounded-xl p-6 space-y-4">
          <h3 className="text-lg font-semibold text-white">Log New Trade</h3>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <div>
              <label className="text-sm text-gray-400 mb-1 block">Account</label>
              <select
                value={formData.accountId}
                onChange={(e) => setFormData({ ...formData, accountId: e.target.value })}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white"
              >
                <option value="">Select account...</option>
                {accounts.map(a => <option key={a.id} value={a.id}>{a.name} ({a.firm})</option>)}
              </select>
            </div>
            <div>
              <label className="text-sm text-gray-400 mb-1 block">Direction</label>
              <select value={formData.direction} onChange={(e) => setFormData({ ...formData, direction: e.target.value })}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white">
                <option value="long">Long</option><option value="short">Short</option>
              </select>
            </div>
            <div>
              <label className="text-sm text-gray-400 mb-1 block">Instrument</label>
              <input value={formData.instrument} onChange={(e) => setFormData({ ...formData, instrument: e.target.value })} placeholder="NQ, ES, CL..."
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white" />
            </div>
            <div>
              <label className="text-sm text-gray-400 mb-1 block">Entry Price</label>
              <input value={formData.entryPrice} onChange={(e) => setFormData({ ...formData, entryPrice: e.target.value })} placeholder="0.00"
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white" />
            </div>
            <div>
              <label className="text-sm text-gray-400 mb-1 block">Exit Price</label>
              <input value={formData.exitPrice} onChange={(e) => setFormData({ ...formData, exitPrice: e.target.value })} placeholder="0.00"
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white" />
            </div>
            <div>
              <label className="text-sm text-gray-400 mb-1 block">P&L Amount ($)</label>
              <input type="number" value={formData.amount} onChange={(e) => setFormData({ ...formData, amount: e.target.value })} placeholder="200"
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white" />
            </div>
            <div>
              <label className="text-sm text-gray-400 mb-1 block">Result</label>
              <select value={formData.result} onChange={(e) => setFormData({ ...formData, result: e.target.value as 'win' | 'loss' })}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white">
                <option value="win">Win</option><option value="loss">Loss</option>
              </select>
            </div>
            <div>
              <label className="text-sm text-gray-400 mb-1 block">Risk:Reward (R)</label>
              <input type="number" step="0.1" value={formData.riskReward} onChange={(e) => setFormData({ ...formData, riskReward: e.target.value })} placeholder="2.5"
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white" />
            </div>
          </div>

          {/* Behaviors */}
          <div>
            <label className="text-sm text-gray-400 mb-2 block">Behaviors / Conditions (toggle all that apply)</label>
            <div className="flex flex-wrap gap-2">
              {COMMON_BEHAVIORS.map(b => (
                <button key={b} onClick={() => toggleBehavior(b)}
                  className={`text-xs px-3 py-1.5 rounded-full border transition ${formData.behaviors.includes(b) ? 'bg-neon-purple/30 border-neon-purple text-white' : 'bg-gray-800 border-gray-700 text-gray-400 hover:border-gray-600'}`}>
                  {b}
                </button>
              ))}
            </div>
          </div>

          {/* Rules Broken */}
          <div>
            <label className="text-sm text-gray-400 mb-2 block">Rules Broken (toggle any you violated)</label>
            <div className="flex flex-wrap gap-2">
              {(accounts.find(a => a.id === formData.accountId)?.rules || []).map((r: string) => (
                <button key={r} onClick={() => toggleRuleBroken(r)}
                  className={`text-xs px-3 py-1.5 rounded-full border transition ${formData.rulesBroken.includes(r) ? 'bg-red-400/30 border-red-400 text-white' : 'bg-gray-800 border-gray-700 text-gray-400 hover:border-gray-600'}`}>
                  {r}
                </button>
              ))}
              {!(accounts.find(a => a.id === formData.accountId)?.rules?.length) && (
                <span className="text-gray-500 text-sm">No rules set for this account</span>
              )}
            </div>
          </div>

          <div>
            <label className="text-sm text-gray-400 mb-1 block">Notes</label>
            <textarea value={formData.notes} onChange={(e) => setFormData({ ...formData, notes: e.target.value })} placeholder="Trade notes..."
              rows={2} className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white" />
          </div>
          <div className="flex gap-2">
            <button onClick={handleAddTrade} className="bg-neon-purple text-white px-6 py-2 rounded-lg font-medium hover:opacity-90">Save Trade</button>
            <button onClick={() => setShowAddForm(false)} className="bg-gray-700 text-white px-6 py-2 rounded-lg font-medium hover:opacity-90">Cancel</button>
          </div>
        </div>
      )}

      {/* Trades Table */}
      {filteredTrades.length === 0 ? (
        <div className="text-center py-16 text-gray-500">
          <Trophy className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p>No trades logged yet. Click "Log Trade" to add your first one.</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-gray-400 border-b border-gray-700">
                <th className="text-left py-2 px-3">Date</th>
                <th className="text-left py-2 px-3">Account</th>
                <th className="text-left py-2 px-3">Dir</th>
                <th className="text-left py-2 px-3">Instrument</th>
                <th className="text-right py-2 px-3">Amount</th>
                <th className="text-right py-2 px-3">R:R</th>
                <th className="text-left py-2 px-3">Behaviors</th>
                <th className="text-left py-2 px-3">Notes</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filteredTrades.map((t) => (
                <tr key={t.id} className="border-b border-gray-800 hover:bg-gray-900/50">
                  <td className="py-2 px-3 text-gray-300">{new Date(t.tradeDate).toLocaleDateString()}</td>
                  <td className="py-2 px-3 text-gray-300">{t.accountName || 'Unknown'} <span className="text-gray-500 text-xs">({t.accountFirm})</span></td>
                  <td className="py-2 px-3">
                    <span className={t.direction === 'long' ? 'text-neon-lime' : 'text-red-400'}>
                      {t.direction === 'long' ? 'L' : 'S'}
                    </span>
                  </td>
                  <td className="py-2 px-3 text-gray-300">{t.instrument || '-'}</td>
                  <td className={`py-2 px-3 text-right font-semibold ${t.result === 'win' ? 'text-neon-lime' : 'text-red-400'}`}>
                    {t.result === 'win' ? '+' : '-'}${Math.abs(parseFloat(t.amount)).toFixed(2)}
                  </td>
                  <td className="py-2 px-3 text-right text-gray-300">{t.riskReward ? `${parseFloat(t.riskReward).toFixed(2)}R` : '-'}</td>
                  <td className="py-2 px-3">
                    {(t.behaviors || []).length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {(t.behaviors || []).map((b) => (
                          <span key={b} className="text-xs bg-neon-purple/20 text-neon-purple px-1.5 py-0.5 rounded">{b}</span>
                        ))}
                      </div>
                    ) : <span className="text-gray-600">-</span>}
                  </td>
                  <td className="py-2 px-3 text-gray-500 max-w-xs truncate">{t.notes || (t.rulesBroken || []).join(', ') || '-'}</td>
                  <td className="py-2 px-3">
                    <button onClick={() => handleDeleteTrade(t.id)} className="text-gray-500 hover:text-red-400 transition">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

const StatCard: React.FC<{ label: string; value: string; icon: React.ReactNode; color: string }> = ({ label, value, icon, color }) => (
  <div className="bg-gray-900/60 border border-gray-800 rounded-xl p-4">
    <div className="flex items-center justify-between mb-2">
      <span className="text-sm text-gray-400">{label}</span>
      <span className={color}>{icon}</span>
    </div>
    <div className={`text-2xl font-bold ${color}`}>{value}</div>
  </div>
);
