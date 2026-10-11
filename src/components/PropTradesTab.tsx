import React, { useState, useEffect, useCallback } from 'react';

interface PropTrade {
  id: string; instrument: string; action: string; quantity: number;
  entryPrice?: string; exitPrice?: string; pnl?: string; riskReward?: string;
  entryDate?: string; exitDate?: string;
  strategy?: string; variant?: string; setupTf?: string; entryTf?: string; slPlacement?: string;
  slType?: string; tpMethod?: string; tryCounter?: number; stuckToSize?: string;
  accountId?: string; groupId?: string; phase?: string;
}

const fmtUSD = (n: number | null | undefined) => {
  if (n == null) return '—';
  return (n >= 0 ? '+' : '') + '$' + Math.abs(n).toFixed(2);
};

const PropTradesTab: React.FC = () => {
  const [trades, setTrades] = useState<PropTrade[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [showTradesList, setShowTradesList] = useState(false);

  const getHeaders = useCallback(() => {
    const h: Record<string, string> = {};
    try { const u = JSON.parse(localStorage.getItem('user') || '{}'); if (u?.id) { h['X-User-Id'] = String(u.id); h['X-User-Email'] = String(u.email); } } catch {}
    return h;
  }, []);

  useEffect(() => {
    const load = async () => {
      const [tradeRes, statsRes] = await Promise.all([
        fetch('/.netlify/functions/db-prop-trades?limit=50', { headers: getHeaders() }).catch(() => null),
        fetch('/.netlify/functions/db-prop-trades', { method: 'POST', headers: { 'Content-Type': 'application/json', ...getHeaders() }, body: JSON.stringify({ action: 'stats' }) }).catch(() => null),
      ]);
      if (tradeRes?.ok) { const d = await tradeRes.json(); setTrades(d.trades || []); }
      if (statsRes?.ok) { const d = await statsRes.json(); setStats(d.stats); }
      setLoading(false);
    };
    load();
  }, []); // eslint-disable-line

  if (loading) return <div className="text-center text-white/40 py-12">Loading prop trades...</div>;

  const phaseStats = stats?.byPhase || {};
  const phases = [
    { key: 'eval', label: 'Eval Total', color: '#a855f7' },
    { key: 'funded', label: 'Funded Total', color: '#22d3ee' },
    { key: 'live', label: 'Live Total', color: '#a3e635' },
  ];

  return (
    <div className="space-y-6">
      {/* Phase summary boxes */}
      <div className="grid grid-cols-3 gap-4">
        {phases.map(({ key, label, color }) => {
          const ps = phaseStats[key] || {};
          return (
            <div key={key} className="rounded-2xl border p-5 text-center"
              style={{ borderColor: `${color}30`, background: `${color}08`, boxShadow: `0 0 20px ${color}10` }}
            >
              <div className="text-xs uppercase tracking-widest mb-1" style={{ color }}>{label}</div>
              <div className="text-2xl font-bold text-white mb-1">{fmtUSD(ps.totalPnL)}</div>
              <div className="text-xs text-white/40">{ps.wins || 0}W / {ps.losses || 0}L</div>
            </div>
          );
        })}
      </div>

      {/* Overall stats */}
      <div className="rounded-2xl border border-white/10 p-5 bg-white/5">
        <div className="flex items-center justify-between">
          <div>
            <span className="text-3xl font-bold text-white">{stats?.totalTrades || 0} trades</span>
            <span className="ml-3 text-lg text-white/40">|</span>
            <span className={`ml-3 text-lg font-bold ${parseFloat(stats?.totalPnL || 0) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
              {fmtUSD(parseFloat(stats?.totalPnL || 0))}
            </span>
            <span className={`ml-3 text-lg ${parseFloat(stats?.winRate || 0) >= 50 ? 'text-emerald-400' : 'text-amber-400'}`}>
              {stats?.winRate || 0}% WR
            </span>
          </div>
          <button onClick={() => setShowTradesList(!showTradesList)}
            className="text-sm px-4 py-2 rounded-lg border border-white/15 text-white/50 hover:text-white"
          >{showTradesList ? 'Hide' : 'Show'} Trades</button>
        </div>
      </div>

      {/* Trades list */}
      {showTradesList && (
        <div className="rounded-2xl border border-white/10 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/10 text-xs uppercase text-white/40">
                <th className="p-3 text-left">Date</th>
                <th className="p-3 text-left">Instr</th>
                <th className="p-3 text-left">Action</th>
                <th className="p-3 text-right">Qty</th>
                <th className="p-3 text-right">PnL</th>
                <th className="p-3 text-left">Strategy</th>
                <th className="p-3 text-left">Phase</th>
                <th className="p-3 text-left">Account</th>
              </tr>
            </thead>
            <tbody>
              {trades.length === 0 ? (
                <tr><td colSpan={8} className="p-6 text-center text-white/30">No prop trades yet — log them from the cockpit</td></tr>
              ) : trades.map(t => (
                <tr key={t.id} className="border-b border-white/5 hover:bg-white/5">
                  <td className="p-3 text-white/60 text-xs">{t.entryDate?.slice(0, 10) || '—'}</td>
                  <td className="p-3 text-white font-medium">{t.instrument}</td>
                  <td className={`p-3 ${t.action === 'buy' ? 'text-emerald-400' : 'text-red-400'}`}>{t.action.toUpperCase()}</td>
                  <td className="p-3 text-right text-white/70">{t.quantity}</td>
                  <td className={`p-3 text-right font-bold ${parseFloat(String(t.pnl || 0)) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                    {fmtUSD(parseFloat(String(t.pnl || 0)))}
                  </td>
                  <td className="p-3 text-white/70 text-xs">{t.strategy || '—'}{t.variant ? ` (${t.variant})` : ''}</td>
                  <td className="p-3">
                    <span className={`text-xs px-2 py-0.5 rounded ${
                      t.phase === 'live' ? 'bg-lime-500/20 text-lime-300' : t.phase === 'funded' ? 'bg-cyan-500/20 text-cyan-300' : 'bg-purple-500/20 text-purple-300'
                    }`}>{t.phase}</span>
                  </td>
                  <td className="p-3 text-white/50 text-xs">{t.accountId?.slice(0, 8) || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default PropTradesTab;