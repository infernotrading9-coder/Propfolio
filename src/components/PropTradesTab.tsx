import React, { useState, useEffect, useCallback } from 'react';

interface PropTrade {
  id: string; instrument: string; action: string; quantity: number;
  pnl?: string; riskReward?: string; outcome?: string;
  entryDate?: string; exitDate?: string;
  strategy?: string; variant?: string; setupTf?: string; entryTf?: string; slPlacement?: string;
  slType?: string; tpMethod?: string; tryCounter?: number; stuckToSize?: string;
  accountId?: string; groupId?: string; phase?: string;
}

/** R is signed: a stop is -1, a win is whatever it actually paid. */
const fmtR = (n: number | null | undefined) => {
  if (n == null || !Number.isFinite(Number(n))) return '—';
  const v = Number(n);
  return (v > 0 ? '+' : '') + v.toFixed(2) + 'R';
};

const rColor = (n: number) => (n > 0 ? 'text-emerald-400' : n < 0 ? 'text-red-400' : 'text-white/50');

/** One "win rate / total R / avg R" table per grouping, so a strategy can be judged by its buckets. */
const Breakdown: React.FC<{ title: string; rows: any[]; hint?: string }> = ({ title, rows, hint }) => {
  if (!rows || rows.length === 0) {
    return (
      <div className="rounded-2xl border border-white/10 p-4">
        <div className="text-xs uppercase tracking-widest text-white/40 mb-2">{title}</div>
        <div className="text-sm text-white/25">No closed trades yet</div>
      </div>
    );
  }
  return (
    <div className="rounded-2xl border border-white/10 p-4">
      <div className="text-xs uppercase tracking-widest text-white/40 mb-3">{title}</div>
      {hint && <div className="text-[11px] text-white/25 -mt-2 mb-3">{hint}</div>}
      <table className="w-full text-sm">
        <thead>
          <tr className="text-[10px] uppercase text-white/30 border-b border-white/10">
            <th className="text-left py-1.5 font-normal">Bucket</th>
            <th className="text-right py-1.5 font-normal">N</th>
            <th className="text-right py-1.5 font-normal">WR</th>
            <th className="text-right py-1.5 font-normal">Total R</th>
            <th className="text-right py-1.5 font-normal">Avg R</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((b: any) => (
            <tr key={b.key} className="border-b border-white/5 last:border-0">
              <td className="py-1.5 text-white/80">{b.key}</td>
              <td className="py-1.5 text-right text-white/50">{b.n}</td>
              <td className="py-1.5 text-right text-white/60">{b.winRate}%</td>
              <td className={`py-1.5 text-right font-bold ${rColor(b.totalR)}`}>{fmtR(b.totalR)}</td>
              <td className={`py-1.5 text-right ${rColor(b.avgR)}`}>{fmtR(b.avgR)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
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
        fetch('/.netlify/functions/db-prop-trades?limit=200', { headers: getHeaders() }).catch(() => null),
        fetch('/.netlify/functions/db-prop-trades', { method: 'POST', headers: { 'Content-Type': 'application/json', ...getHeaders() }, body: JSON.stringify({ action: 'stats' }) }).catch(() => null),
      ]);
      if (tradeRes?.ok) { const d = await tradeRes.json(); setTrades(d.trades || []); }
      if (statsRes?.ok) { const d = await statsRes.json(); setStats(d.stats); }
      setLoading(false);
    };
    load();
  }, []); // eslint-disable-line

  if (loading) return <div className="text-center text-white/40 py-12">Loading prop trades...</div>;

  const phases = [
    { key: 'eval', label: 'Eval', color: '#a855f7' },
    { key: 'funded', label: 'Funded', color: '#22d3ee' },
    { key: 'live', label: 'Live', color: '#a3e635' },
  ];

  return (
    <div className="space-y-6">
      {/* Phase summary — R, not dollars */}
      <div className="grid grid-cols-3 gap-4">
        {phases.map(({ key, label, color }) => {
          const ps = stats?.byPhase?.[key] || {};
          return (
            <div key={key} className="rounded-2xl border p-5 text-center"
              style={{ borderColor: `${color}30`, background: `${color}08`, boxShadow: `0 0 20px ${color}10` }}
            >
              <div className="text-xs uppercase tracking-widest mb-1" style={{ color }}>{label}</div>
              <div className={`text-2xl font-bold mb-1 ${rColor(ps.totalR || 0)}`}>{fmtR(ps.totalR || 0)}</div>
              <div className="text-xs text-white/40">{ps.wins || 0}W / {ps.losses || 0}L · {ps.n || 0} closed</div>
            </div>
          );
        })}
      </div>

      {/* Overall — the headline is expectancy in R */}
      <div className="rounded-2xl border border-white/10 p-5 bg-white/5">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
          <span className="text-3xl font-bold text-white">{stats?.closedCount || 0} <span className="text-lg text-white/40">closed</span></span>
          <span className="text-lg font-bold text-white/70">{stats?.winRate || 0}% WR</span>
          <span className={`text-lg font-bold ${rColor(stats?.totalR || 0)}`}>{fmtR(stats?.totalR || 0)} total</span>
          <span className={`text-lg font-bold ${rColor(stats?.avgR || 0)}`}>{fmtR(stats?.avgR || 0)} / trade</span>
          {stats?.open > 0 && <span className="text-sm text-amber-300/70">{stats.open} open</span>}
          <span className="text-xs text-white/30">
            best {fmtR(stats?.bestR)} · worst {fmtR(stats?.worstR)}
          </span>
          <button onClick={() => setShowTradesList(!showTradesList)}
            className="ml-auto text-sm px-4 py-2 rounded-lg border border-white/15 text-white/50 hover:text-white"
          >{showTradesList ? 'Hide' : 'Show'} Trades</button>
        </div>
        <div className="text-[11px] text-white/30 mt-2">
          Expectancy is avg R per trade — the number that decides whether a strategy is worth trading.
        </div>
      </div>

      {/* Breakdowns — the point of the log: which setup actually has an edge */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Breakdown title="By Strategy" rows={stats?.byStrategy} />
        <Breakdown title="By Variant" rows={stats?.byVariant} />
        <Breakdown title="By Setup TF" rows={stats?.bySetupTf} />
        <Breakdown title="By Entry TF" rows={stats?.byEntryTf} />
        <Breakdown title="By SL Placement" rows={stats?.bySlPlacement} />
      </div>

      {/* Trades list — R-denominated */}
      {showTradesList && (
        <div className="rounded-2xl border border-white/10 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/10 text-xs uppercase text-white/40">
                <th className="p-3 text-left">Date</th>
                <th className="p-3 text-left">Strategy</th>
                <th className="p-3 text-left">Setup/Entry</th>
                <th className="p-3 text-left">SL</th>
                <th className="p-3 text-left">Outcome</th>
                <th className="p-3 text-right">R</th>
                <th className="p-3 text-left">Phase</th>
              </tr>
            </thead>
            <tbody>
              {trades.length === 0 ? (
                <tr><td colSpan={7} className="p-6 text-center text-white/30">No prop trades yet — they log from the cockpit on strategy confirm</td></tr>
              ) : trades.map(t => {
                const r = parseFloat(String(t.riskReward || '0')) || 0;
                const open = t.outcome == null;
                return (
                  <tr key={t.id} className="border-b border-white/5 hover:bg-white/5">
                    <td className="p-3 text-white/60 text-xs">{t.entryDate?.slice(0, 10) || '—'}</td>
                    <td className="p-3 text-white/80">{t.strategy || '—'}{t.variant ? <span className="text-white/40"> · {t.variant}</span> : ''}</td>
                    <td className="p-3 text-white/50 text-xs">{t.setupTf || '—'} / {t.entryTf || '—'}</td>
                    <td className="p-3 text-white/50 text-xs">{t.slPlacement || '—'}</td>
                    <td className="p-3">
                      <span className={`text-xs px-2 py-0.5 rounded ${
                        open ? 'bg-amber-500/20 text-amber-300'
                          : t.outcome === 'win' ? 'bg-emerald-500/20 text-emerald-300'
                          : t.outcome === 'loss' ? 'bg-red-500/20 text-red-300'
                          : 'bg-white/10 text-white/50'
                      }`}>{open ? 'open' : t.outcome}</span>
                    </td>
                    <td className={`p-3 text-right font-bold ${rColor(open ? 0 : r)}`}>{open ? '—' : fmtR(r)}</td>
                    <td className="p-3 text-white/50 text-xs">{t.phase || '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default PropTradesTab;
