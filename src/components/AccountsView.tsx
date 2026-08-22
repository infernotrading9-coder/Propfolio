import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Wallet, ArrowUp, ArrowDown, GripVertical, Calendar, Edit3, Save, X, Trash2, ChevronLeft, ChevronRight, CheckCircle2, XCircle, Minus } from 'lucide-react';
import { NeonCard } from './NeonCard';

interface TradingAccount {
  id: string;
  name: string;
  firm: string;
  accountNumberLast4?: string | null;
  accountSize: string;
  balance: string;
  drawdownUsed: string;
  highWaterMark: string;
  maxDrawdown?: string;
  dailyDrawdown?: string;
  riskPerTrade?: string;
  rules?: string[] | null;
  notes?: string | null;
  status: string;
  phase: string;
  platform?: string | null;
  groupName?: string | null;
  sortOrder: number;
}

interface DailyOrder {
  id: string;
  orderDate: string;
  orderedAccountIds: string[];
  notes?: string | null;
}

// --- Calendar types (server-backed) ---
interface CalAccount {
  id: string;
  name: string;
  challengeId?: string;
  isActive: boolean;
  createdAt: string;
}
interface CalEntry {
  id: string;
  date: string;
  followedRules: boolean | null;
  ruleCompliance?: Record<string, boolean> | null;
  notes?: string;
}

interface AccountsViewProps {
  apiBase: string;
  getAuthHeaders: () => Record<string, string>;
  calendarAccounts?: CalAccount[];
  calendarEntriesByAccount?: Record<string, CalEntry[]>;
  onCalendarEntryUpsert?: (accountId: string, date: string, followedRules: boolean | null, ruleCompliance?: Record<string, boolean> | null) => void;
}

// ─── Holographic Account Card ───────────────────────────────────────────────
const HolographicAccountCard: React.FC<{
  acct: TradingAccount;
  isEditing: boolean;
  editData: Partial<TradingAccount>;
  onEdit: () => void;
  onDelete: () => void;
  onSave: () => void;
  onCancel: () => void;
  setEditField: (field: string, value: string) => void;
}> = ({ acct, isEditing, editData, onEdit, onDelete, onSave, onCancel, setEditField }) => {
  const balance = parseFloat(acct.balance);
  const drawdown = parseFloat(acct.drawdownUsed);
  const hwm = parseFloat(acct.highWaterMark);
  const maxDD = acct.maxDrawdown ? parseFloat(acct.maxDrawdown) : 0;
  const ddPercent = maxDD > 0 ? Math.min(100, (drawdown / maxDD) * 100) : 0;
  const profit = balance - hwm;
  const acctSizeNum = parseFloat(acct.accountSize);
  const sizeLabel = acctSizeNum >= 1000 ? `$${(acctSizeNum / 1000).toFixed(0)}K` : `$${acctSizeNum}`;

  const phaseInfo = acct.phase === 'live'
    ? { color: 'text-lime-400', bgColor: 'bg-lime-500/20', borderColor: 'border-lime-400/50', label: 'Live' }
    : acct.phase === 'funded'
    ? { color: 'text-cyan-400', bgColor: 'bg-cyan-500/20', borderColor: 'border-cyan-400/50', label: 'Funded' }
    : { color: 'text-purple-400', bgColor: 'bg-purple-500/20', borderColor: 'border-purple-400/50', label: 'Challenge' };

  return (
    <div className="group relative transform-gpu transition-all duration-300 hover:scale-[1.02] hover:-translate-y-1">
      <NeonCard
        glow={ddPercent > 80 ? 'pink' : 'purple'}
        className="relative overflow-hidden p-5 h-full"
      >
        {/* Holographic Reflection Layer */}
        <div
          className="absolute inset-0 opacity-0 group-hover:opacity-30 transition-opacity duration-700 pointer-events-none"
          style={{
            background: `conic-gradient(from 0deg at 50% 50%, transparent 0deg, rgba(34, 211, 238, 0.1) 60deg, rgba(168, 85, 247, 0.1) 120deg, rgba(236, 72, 153, 0.1) 180deg, rgba(34, 211, 238, 0.1) 240deg, rgba(168, 85, 247, 0.1) 300deg, transparent 360deg)`,
            filter: 'blur(1px)',
          }}
        />
        {/* Floating particles */}
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          {[...Array(6)].map((_, i) => (
            <div
              key={i}
              className="absolute w-1 h-1 rounded-full bg-cyan-400 opacity-30"
              style={{
                left: `${Math.random() * 100}%`,
                top: `${Math.random() * 100}%`,
                animation: `floatingParticle ${4 + Math.random() * 3}s ease-in-out infinite ${i * 0.5}s`,
                boxShadow: '0 0 6px rgba(34, 211, 238, 0.5)',
              }}
            />
          ))}
        </div>

        <div className="relative z-10 space-y-3">
          {/* Header */}
          <div className="flex items-start justify-between">
            <div className="flex items-start gap-3 flex-1 min-w-0">
              <div className="flex-1 min-w-0">
                <h4 className="text-lg font-bold text-white truncate group-hover:text-cyan-300 transition-colors">
                  {acct.name}
                </h4>
                <p className="text-sm text-white/50 truncate">
                  {acct.firm}{acct.accountNumberLast4 ? ` · ...${acct.accountNumberLast4}` : ''} · {sizeLabel}
                </p>
              </div>
            </div>
            <div className={`flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${phaseInfo.bgColor} ${phaseInfo.borderColor} border`}>
              <span className={phaseInfo.color}>{phaseInfo.label}</span>
            </div>
          </div>

          {isEditing ? (
            <div className="space-y-2">
              <div className="grid grid-cols-3 gap-2">
                <input type="number" value={editData.balance || ''} onChange={(e) => setEditField('balance', e.target.value)} placeholder="Balance" className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-white text-sm" />
                <input type="number" value={editData.drawdownUsed || ''} onChange={(e) => setEditField('drawdownUsed', e.target.value)} placeholder="DD Used" className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-white text-sm" />
                <input type="number" value={editData.highWaterMark || ''} onChange={(e) => setEditField('highWaterMark', e.target.value)} placeholder="HWM" className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-white text-sm" />
              </div>
              <div className="flex gap-2">
                <button onClick={onSave} className="bg-neon-lime text-black px-3 py-1 rounded text-sm font-medium"><Save className="w-3 h-3 inline" /> Save</button>
                <button onClick={onCancel} className="bg-gray-700 text-white px-3 py-1 rounded text-sm"><X className="w-3 h-3 inline" /> Cancel</button>
              </div>
            </div>
          ) : (
            <>
              {/* Stats grid */}
              <div className="grid grid-cols-3 gap-2 text-center">
                <div>
                  <div className="text-white/40 text-xs">Balance</div>
                  <div className="text-white font-semibold">${balance.toFixed(0)}</div>
                </div>
                <div>
                  <div className="text-white/40 text-xs">HWM</div>
                  <div className="text-white/70 font-medium">${hwm.toFixed(0)}</div>
                </div>
                <div>
                  <div className="text-white/40 text-xs">P&L</div>
                  <div className={`font-medium ${profit >= 0 ? 'text-lime-400' : 'text-red-400'}`}>{profit >= 0 ? '+' : ''}{profit.toFixed(0)}</div>
                </div>
              </div>

              {/* Drawdown bar */}
              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-white/40">Drawdown</span>
                  <span className={ddPercent > 80 ? 'text-red-400' : 'text-white/50'}>${drawdown.toFixed(0)} / ${maxDD.toFixed(0)} ({ddPercent.toFixed(0)}%)</span>
                </div>
                <div className="h-2 bg-white/5 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${ddPercent > 80 ? 'bg-red-500' : ddPercent > 50 ? 'bg-amber-500' : 'bg-gradient-to-r from-cyan-400 to-purple-400'}`}
                    style={{ width: `${ddPercent}%` }}
                  />
                </div>
              </div>

              {/* Rules */}
              {acct.rules && acct.rules.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {acct.rules.slice(0, 4).map((rule, i) => (
                    <span key={i} className="text-xs bg-white/5 border border-white/10 text-white/70 px-2 py-0.5 rounded-full truncate max-w-[120px]">{rule}</span>
                  ))}
                  {acct.rules.length > 4 && (
                    <span className="text-xs text-white/40 px-1">+{acct.rules.length - 4} more</span>
                  )}
                </div>
              )}

              {/* Footer */}
              <div className="flex items-center justify-between pt-2 border-t border-white/10">
                <div className="flex gap-1">
                  <button onClick={onEdit} className="text-white/40 hover:text-cyan-300 transition-colors"><Edit3 className="w-4 h-4" /></button>
                  <button onClick={onDelete} className="text-white/40 hover:text-red-400 transition-colors"><Trash2 className="w-4 h-4" /></button>
                </div>
                {acct.notes && <p className="text-xs text-white/30 truncate flex-1 ml-2">{acct.notes}</p>}
              </div>
            </>
          )}
        </div>
      </NeonCard>
    </div>
  );
};

// ─── Combined Rule Calendar ──────────────────────────────────────────────────
const getAllDaysInMonth = (year: number, month: number) => {
  const days: { date: string; isCurrentMonth: boolean }[] = [];
  const firstDay = new Date(year, month, 1);
  const firstDayOfWeek = firstDay.getDay();
  const mondayOffset = firstDayOfWeek === 0 ? 6 : firstDayOfWeek - 1;
  const startDate = new Date(year, month, 1 - mondayOffset);
  for (let i = 0; i < 42; i++) {
    const d = new Date(startDate);
    d.setDate(startDate.getDate() + i);
    days.push({ date: d.toISOString().slice(0, 10), isCurrentMonth: d.getMonth() === month });
  }
  return days;
};

const CombinedRuleCalendar: React.FC<{
  calAccounts: CalAccount[];
  calEntriesByAccount: Record<string, CalEntry[]>;
  onEntryUpsert: (accountId: string, date: string, followedRules: boolean | null) => void;
}> = ({ calAccounts, calEntriesByAccount, onEntryUpsert }) => {
  const [cursor, setCursor] = useState(() => new Date());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);

  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const days = useMemo(() => getAllDaysInMonth(year, month), [year, month]);
  const weekdays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  // Build a map: date -> array of { accountId, accountName, entry }
  const dateMap = useMemo(() => {
    const map: Record<string, Array<{ accountId: string; accountName: string; entry: CalEntry }>> = {};
    for (const acct of calAccounts) {
      if (!acct.isActive) continue;
      const entries = calEntriesByAccount[acct.id] || [];
      for (const entry of entries) {
        if (!map[entry.date]) map[entry.date] = [];
        map[entry.date].push({ accountId: acct.id, accountName: acct.name, entry });
      }
    }
    return map;
  }, [calAccounts, calEntriesByAccount]);

  const today = new Date().toISOString().slice(0, 10);

  const handleDayClick = (date: string) => {
    if (selectedDate === date) {
      setSelectedDate(null);
    } else {
      setSelectedDate(date);
      setSelectedAccountId(null);
    }
  };

  // Get summary for a date
  const getDateSummary = (date: string) => {
    const items = dateMap[date] || [];
    if (items.length === 0) return null;
    const followed = items.filter(i => i.entry.followedRules === true).length;
    const broken = items.filter(i => i.entry.followedRules === false).length;
    return { total: items.length, followed, broken };
  };

  // Selected date detail
  const selectedDateItems = selectedDate ? (dateMap[selectedDate] || []) : [];
  const selectedAccount = selectedAccountId ? calAccounts.find(a => a.id === selectedAccountId) : null;
  const selectedAccountEntries = selectedAccountId ? (calEntriesByAccount[selectedAccountId] || []) : [];
  const selectedAccountEntryForDate = selectedDate && selectedAccountId
    ? selectedAccountEntries.find(e => e.date === selectedDate)
    : null;

  return (
    <NeonCard className="p-6 relative overflow-hidden" glow="purple">
      {/* Background effects */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-purple-400/20 to-transparent animate-pulse" />
        <div className="absolute -top-10 -right-10 w-32 h-32 bg-purple-500/5 rounded-full blur-xl animate-pulse" />
        <div className="absolute -bottom-10 -left-10 w-24 h-24 bg-cyan-500/5 rounded-full blur-xl animate-pulse" style={{ animationDelay: '1s' }} />
      </div>

      {/* Header */}
      <div className="relative flex items-center justify-between mb-6">
        <button
          className="group flex items-center gap-2 px-4 py-2 rounded-lg bg-gradient-to-r from-purple-500/10 to-purple-600/10 hover:from-purple-500/20 hover:to-purple-600/20 border border-purple-500/30 hover:border-purple-400/50 transition-all duration-300 hover:scale-105"
          onClick={() => setCursor(new Date(year, month - 1, 1))}
        >
          <ChevronLeft className="w-4 h-4 text-purple-300 group-hover:text-purple-200" />
          <span className="font-medium text-purple-200 group-hover:text-white">Prev</span>
        </button>

        <div className="text-center">
          <div className="text-2xl font-black text-transparent bg-clip-text bg-gradient-to-r from-purple-300 via-cyan-300 to-purple-300 mb-1 animate-pulse">
            {cursor.toLocaleString(undefined, { month: 'long', year: 'numeric' })}
          </div>
          <div className="text-xs uppercase tracking-wider font-medium text-white/60">
            Combined Rule Calendar — All Accounts
          </div>
        </div>

        <button
          className="group flex items-center gap-2 px-4 py-2 rounded-lg bg-gradient-to-r from-purple-500/10 to-purple-600/10 hover:from-purple-500/20 hover:to-purple-600/20 border border-purple-500/30 hover:border-purple-400/50 transition-all duration-300 hover:scale-105"
          onClick={() => setCursor(new Date(year, month + 1, 1))}
        >
          <span className="font-medium text-purple-200 group-hover:text-white">Next</span>
          <ChevronRight className="w-4 h-4 text-purple-300 group-hover:text-purple-200" />
        </button>
      </div>

      {/* Weekday headers */}
      <div className="relative grid grid-cols-7 gap-2 sm:gap-3 mb-6">
        {weekdays.map((day) => (
          <div key={day} className="relative text-center py-2 px-1 rounded-lg bg-gradient-to-br from-white/5 to-white/10 border border-white/10">
            <div className="text-sm font-bold text-transparent bg-clip-text bg-gradient-to-r from-cyan-300 to-purple-300 uppercase tracking-wider">
              {day}
            </div>
          </div>
        ))}
      </div>

      {/* Calendar grid */}
      <div className="relative grid grid-cols-7 gap-2 sm:gap-3">
        {days.map((dayInfo, index) => {
          const { date: d, isCurrentMonth } = dayInfo;
          const summary = getDateSummary(d);
          const isToday = d === today;
          const isSelected = d === selectedDate;

          const hasData = summary !== null;
          const allFollowed = hasData && summary.broken === 0;
          const allBroken = hasData && summary.followed === 0;

          const baseColor = !hasData
            ? 'bg-gradient-to-br from-white/5 to-white/10 border-white/20 text-white/70 hover:from-white/10 hover:to-white/20'
            : allFollowed
            ? 'bg-gradient-to-br from-emerald-500/20 to-lime-500/30 border-emerald-400/60 text-emerald-100 shadow-[0_0_20px_rgba(16,185,129,0.4)]'
            : allBroken
            ? 'bg-gradient-to-br from-rose-500/20 to-red-500/30 border-rose-400/60 text-rose-100 shadow-[0_0_20px_rgba(239,68,68,0.4)]'
            : 'bg-gradient-to-br from-amber-500/15 to-orange-500/25 border-amber-400/50 text-amber-100 shadow-[0_0_15px_rgba(245,158,11,0.3)]';

          const color = isCurrentMonth ? baseColor : 'bg-gradient-to-br from-white/3 to-white/5 border-white/10 text-white/30 opacity-60';
          const dayNum = new Date(d).getDate();

          return (
            <div
              key={d}
              className={`group relative rounded-xl border backdrop-blur-sm px-2 py-3 text-center min-h-[90px] sm:min-h-[110px] transform-gpu transition-all duration-300 ${
                isCurrentMonth ? `cursor-pointer hover:scale-105 hover:-translate-y-1 ${color}` : color
              } ${isSelected ? 'ring-2 ring-cyan-400/60 ring-offset-2 ring-offset-transparent' : ''} ${isToday && isCurrentMonth ? 'ring-2 ring-cyan-400/40' : ''}`}
              onClick={() => isCurrentMonth && handleDayClick(d)}
              style={{ animation: `fadeInUp 0.6s ease-out forwards`, animationDelay: `${index * 0.02}s` }}
            >
              <div className="relative z-10">
                <div className={`text-lg font-black mb-1 ${isToday && isCurrentMonth ? 'text-transparent bg-clip-text bg-gradient-to-r from-cyan-300 to-purple-300' : ''}`}>
                  {dayNum}
                </div>
                {hasData && isCurrentMonth && (
                  <div className="space-y-0.5">
                    <div className="flex justify-center gap-1">
                      {summary.followed > 0 && (
                        <span className="inline-flex items-center gap-0.5 text-xs bg-emerald-500/20 text-emerald-200 px-1.5 py-0.5 rounded-full">
                          <CheckCircle2 className="w-2.5 h-2.5" />{summary.followed}
                        </span>
                      )}
                      {summary.broken > 0 && (
                        <span className="inline-flex items-center gap-0.5 text-xs bg-rose-500/20 text-rose-200 px-1.5 py-0.5 rounded-full">
                          <XCircle className="w-2.5 h-2.5" />{summary.broken}
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-white/50">{summary.total} account{summary.total !== 1 ? 's' : ''}</div>
                  </div>
                )}
                {!hasData && isCurrentMonth && (
                  <div className="text-xs text-white/30 mt-1">No data</div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Selected date detail panel */}
      {selectedDate && (
        <div className="mt-6 p-4 bg-gradient-to-br from-white/5 to-white/10 border border-white/10 rounded-xl space-y-4">
          <div className="flex items-center justify-between">
            <h4 className="text-lg font-bold text-transparent bg-clip-text bg-gradient-to-r from-cyan-300 to-purple-300">
              {new Date(selectedDate + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
            </h4>
            <button onClick={() => { setSelectedDate(null); setSelectedAccountId(null); }} className="text-white/40 hover:text-white transition-colors">
              <X className="w-5 h-5" />
            </button>
          </div>

          {selectedDateItems.length === 0 ? (
            <p className="text-white/40 text-sm text-center py-4">No rule data for this date. Click days in the calendar to see account details.</p>
          ) : selectedAccount ? (
            /* Detailed view for a specific account on the selected date */
            <div className="space-y-4">
              <button onClick={() => setSelectedAccountId(null)} className="text-sm text-cyan-300 hover:text-cyan-200 transition-colors flex items-center gap-1">
                <ChevronLeft className="w-4 h-4" /> Back to accounts
              </button>
              <div className="bg-white/5 border border-white/10 rounded-lg p-4">
                <div className="flex items-center justify-between mb-3">
                  <h5 className="text-white font-semibold">{selectedAccount.name}</h5>
                  {selectedAccountEntryForDate && (
                    <span className={`text-xs px-2 py-0.5 rounded-full ${
                      selectedAccountEntryForDate.followedRules === true ? 'bg-emerald-500/20 text-emerald-200' :
                      selectedAccountEntryForDate.followedRules === false ? 'bg-rose-500/20 text-rose-200' :
                      'bg-white/10 text-white/50'
                    }`}>
                      {selectedAccountEntryForDate.followedRules === true ? 'Rules Followed' :
                       selectedAccountEntryForDate.followedRules === false ? 'Rules Broken' : 'No Trade'}
                    </span>
                  )}
                </div>
                {selectedAccountEntryForDate?.ruleCompliance && Object.keys(selectedAccountEntryForDate.ruleCompliance).length > 0 && (
                  <div className="space-y-1">
                    {Object.entries(selectedAccountEntryForDate.ruleCompliance).map(([ruleId, followed]) => (
                      <div key={ruleId} className="flex items-center gap-2 text-sm">
                        {followed ? <CheckCircle2 className="w-4 h-4 text-emerald-400" /> : <XCircle className="w-4 h-4 text-rose-400" />}
                        <span className="text-white/70">{followed ? 'Rule followed' : 'Rule broken'}</span>
                      </div>
                    ))}
                  </div>
                )}
                {selectedAccountEntryForDate?.notes && (
                  <p className="text-xs text-white/40 mt-2">{selectedAccountEntryForDate.notes}</p>
                )}
                {/* Cycle through statuses */}
                <div className="mt-3 flex gap-2">
                  <button
                    onClick={() => onEntryUpsert(selectedAccount.id, selectedDate, true)}
                    className={`px-3 py-1 rounded-lg text-xs font-medium transition-all ${
                      selectedAccountEntryForDate?.followedRules === true ? 'bg-emerald-500/30 text-emerald-200 border border-emerald-400/50' : 'bg-white/5 text-white/60 border border-white/10 hover:bg-white/10'
                    }`}
                  >Rules Followed</button>
                  <button
                    onClick={() => onEntryUpsert(selectedAccount.id, selectedDate, false)}
                    className={`px-3 py-1 rounded-lg text-xs font-medium transition-all ${
                      selectedAccountEntryForDate?.followedRules === false ? 'bg-rose-500/30 text-rose-200 border border-rose-400/50' : 'bg-white/5 text-white/60 border border-white/10 hover:bg-white/10'
                    }`}
                  >Rules Broken</button>
                  <button
                    onClick={() => onEntryUpsert(selectedAccount.id, selectedDate, null)}
                    className={`px-3 py-1 rounded-lg text-xs font-medium transition-all ${
                      selectedAccountEntryForDate?.followedRules === null || !selectedAccountEntryForDate ? 'bg-white/10 text-white/70 border border-white/20' : 'bg-white/5 text-white/40 border border-white/10 hover:bg-white/10'
                    }`}
                  >No Trade</button>
                </div>
              </div>
            </div>
          ) : (
            /* List of accounts that have data for this date */
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {selectedDateItems.map((item) => {
                const acct = calAccounts.find(a => a.id === item.accountId);
                if (!acct) return null;
                const status = item.entry.followedRules;
                return (
                  <div
                    key={item.accountId}
                    onClick={() => setSelectedAccountId(item.accountId)}
                    className={`cursor-pointer p-3 rounded-lg border transition-all hover:scale-[1.02] hover:-translate-y-0.5 ${
                      status === true ? 'bg-emerald-500/10 border-emerald-400/30 hover:border-emerald-400/50' :
                      status === false ? 'bg-rose-500/10 border-rose-400/30 hover:border-rose-400/50' :
                      'bg-white/5 border-white/10 hover:border-white/20'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-white font-medium text-sm truncate">{item.accountName}</span>
                      {status === true ? <CheckCircle2 className="w-4 h-4 text-emerald-400" /> :
                       status === false ? <XCircle className="w-4 h-4 text-rose-400" /> :
                       <Minus className="w-4 h-4 text-white/30" />}
                    </div>
                    <div className="text-xs text-white/50">
                      {status === true ? 'Rules Followed' : status === false ? 'Rules Broken' : 'No Trade'}
                    </div>
                    {item.entry.ruleCompliance && Object.keys(item.entry.ruleCompliance).length > 0 && (
                      <div className="text-xs text-white/30 mt-1">
                        {Object.values(item.entry.ruleCompliance).filter(v => v).length}/{Object.keys(item.entry.ruleCompliance).length} rules checked
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </NeonCard>
  );
};

// ─── Main AccountsView ───────────────────────────────────────────────────────
export const AccountsView: React.FC<AccountsViewProps> = ({ apiBase, getAuthHeaders, calendarAccounts = [], calendarEntriesByAccount = {}, onCalendarEntryUpsert }) => {
  const [accounts, setAccounts] = useState<TradingAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddAccount, setShowAddAccount] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [dailyOrder, setDailyOrder] = useState<DailyOrder | null>(null);
  const [orderMode, setOrderMode] = useState(false);
  const [orderedIds, setOrderedIds] = useState<string[]>([]);

  const [newAccount, setNewAccount] = useState({
    name: '', firm: '', accountNumberLast4: '', accountSize: '', balance: '', maxDrawdown: '', dailyDrawdown: '', riskPerTrade: '', rules: '', notes: '', phase: 'challenge', platform: '', groupName: '',
  });

  const [editData, setEditData] = useState<Partial<TradingAccount>>({});

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [accountsRes, orderRes] = await Promise.all([
        fetch(`${apiBase}/db-accounts`, { headers: getAuthHeaders() }),
        fetch(`${apiBase}/db-accounts?action=daily-order&date=${new Date().toISOString().slice(0, 10)}`, { headers: getAuthHeaders() }),
      ]);
      const accountsData = await accountsRes.json();
      const orderData = await orderRes.json();
      if (accountsData.accounts) setAccounts(accountsData.accounts);
      if (orderData.order) setDailyOrder(orderData.order);
    } catch (e) {
      console.error('Failed to load accounts:', e);
    } finally {
      setLoading(false);
    }
  }, [apiBase, getAuthHeaders]);

  useEffect(() => { loadData(); }, [loadData]);

  const handleAddAccount = async () => {
    if (!newAccount.name || !newAccount.firm) return;
    try {
      await fetch(`${apiBase}/db-accounts`, {
        method: 'POST',
        headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'create', ...newAccount,
          rules: newAccount.rules ? newAccount.rules.split(',').map(r => r.trim()) : [],
          accountSize: parseFloat(newAccount.accountSize) || 0,
          balance: parseFloat(newAccount.balance) || parseFloat(newAccount.accountSize) || 0,
          maxDrawdown: parseFloat(newAccount.maxDrawdown) || 0,
          dailyDrawdown: parseFloat(newAccount.dailyDrawdown) || 0,
          riskPerTrade: parseFloat(newAccount.riskPerTrade) || 0,
        }),
      });
      setShowAddAccount(false);
      setNewAccount({ name: '', firm: '', accountNumberLast4: '', accountSize: '', balance: '', maxDrawdown: '', dailyDrawdown: '', riskPerTrade: '', rules: '', notes: '', phase: 'challenge', platform: '', groupName: '' });
      loadData();
    } catch (e) { console.error('Failed to add account:', e); }
  };

  const handleUpdateAccount = async (id: string, updates: Partial<TradingAccount>) => {
    try {
      await fetch(`${apiBase}/db-accounts`, {
        method: 'PUT',
        headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, updates }),
      });
      setEditingId(null);
      loadData();
    } catch (e) { console.error('Failed to update account:', e); }
  };

  const handleDeleteAccount = async (id: string) => {
    if (!confirm('Delete this account? This will also delete its trade history.')) return;
    try {
      await fetch(`${apiBase}/db-accounts`, {
        method: 'DELETE',
        headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      loadData();
    } catch (e) { console.error('Failed to delete account:', e); }
  };

  const handleSaveDailyOrder = async () => {
    if (orderedIds.length === 0) return;
    try {
      await fetch(`${apiBase}/db-accounts`, {
        method: 'POST',
        headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'set-daily-order', orderDate: new Date().toISOString().slice(0, 10), orderedAccountIds: orderedIds }),
      });
      setOrderMode(false);
      loadData();
    } catch (e) { console.error('Failed to save daily order:', e); }
  };

  const moveAccount = (index: number, direction: 'up' | 'down') => {
    const newOrder = [...orderedIds];
    const swapIndex = direction === 'up' ? index - 1 : index + 1;
    if (swapIndex < 0 || swapIndex >= newOrder.length) return;
    [newOrder[index], newOrder[swapIndex]] = [newOrder[swapIndex], newOrder[index]];
    setOrderedIds(newOrder);
  };

  if (loading) {
    return <div className="flex items-center justify-center py-20 text-gray-400">Loading accounts...</div>;
  }

  return (
    <div className="space-y-6">
      {/* Daily Trading Order Section */}
      <div className="bg-gray-900/60 border border-gray-800 rounded-xl p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <Calendar className="w-5 h-5 text-neon-cyan" />
            Today's Trading Order
          </h2>
          <div className="flex gap-2">
            {orderMode ? (
              <>
                <button onClick={handleSaveDailyOrder} className="bg-neon-lime text-black px-4 py-2 rounded-lg font-medium text-sm hover:opacity-90">Save Order</button>
                <button onClick={() => { setOrderMode(false); setOrderedIds([]); }} className="bg-gray-700 text-white px-4 py-2 rounded-lg text-sm">Cancel</button>
              </>
            ) : (
              <button
                onClick={() => { setOrderMode(true); setOrderedIds(accounts.map(a => a.id)); }}
                className="bg-gradient-to-r from-neon-purple to-neon-cyan text-white px-4 py-2 rounded-lg font-medium text-sm hover:opacity-90"
              >
                Set Today's Order
              </button>
            )}
          </div>
        </div>

        {dailyOrder && !orderMode ? (
          <div className="space-y-2">
            {dailyOrder.orderedAccountIds.map((id, idx) => {
              const acct = accounts.find(a => a.id === id);
              if (!acct) return null;
              return (
                <div key={id} className="flex items-center gap-3 bg-gray-800/50 rounded-lg px-4 py-2">
                  <span className="text-neon-cyan font-bold w-6 text-center">{idx + 1}</span>
                  <span className="text-white font-medium">{acct.name}</span>
                  <span className="text-gray-400 text-sm">{acct.firm}</span>
                  <span className="text-gray-500 text-sm ml-auto">${parseFloat(acct.balance).toFixed(0)}</span>
                </div>
              );
            })}
            {dailyOrder.notes && <p className="text-gray-400 text-sm mt-2">{dailyOrder.notes}</p>}
          </div>
        ) : orderMode ? (
          <div className="space-y-2">
            {orderedIds.map((id, idx) => {
              const acct = accounts.find(a => a.id === id);
              if (!acct) return null;
              return (
                <div key={id} className="flex items-center gap-3 bg-gray-800/50 rounded-lg px-4 py-2">
                  <GripVertical className="w-4 h-4 text-gray-500" />
                  <span className="text-neon-cyan font-bold w-6 text-center">{idx + 1}</span>
                  <span className="text-white font-medium">{acct.name}</span>
                  <span className="text-gray-400 text-sm">{acct.firm}</span>
                  <div className="ml-auto flex gap-1">
                    <button onClick={() => moveAccount(idx, 'up')} disabled={idx === 0} className="text-gray-400 hover:text-white disabled:opacity-30"><ArrowUp className="w-4 h-4" /></button>
                    <button onClick={() => moveAccount(idx, 'down')} disabled={idx === orderedIds.length - 1} className="text-gray-400 hover:text-white disabled:opacity-30"><ArrowDown className="w-4 h-4" /></button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-gray-500 text-sm">No order set for today. Click "Set Today's Order" to arrange your accounts.</p>
        )}
      </div>

      {/* Accounts Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-white flex items-center gap-2">
          <Wallet className="w-6 h-6 text-neon-purple" />
          Trading Accounts
        </h2>
        <button
          onClick={() => setShowAddAccount(!showAddAccount)}
          className="bg-gradient-to-r from-neon-purple to-neon-cyan text-white px-4 py-2 rounded-lg font-medium hover:opacity-90"
        >
          + Add Account
        </button>
      </div>

      {/* Add Account Form */}
      {showAddAccount && (
        <div className="bg-gray-900/80 border border-gray-700 rounded-xl p-6 space-y-4">
          <h3 className="text-lg font-semibold text-white">Add New Trading Account</h3>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <FormField label="Account Name" value={newAccount.name} onChange={(v) => setNewAccount({ ...newAccount, name: v })} placeholder="Acct 0006" />
            <FormField label="Firm" value={newAccount.firm} onChange={(v) => setNewAccount({ ...newAccount, firm: v })} placeholder="Tradify" />
            <FormField label="Last 4 Digits" value={newAccount.accountNumberLast4} onChange={(v) => setNewAccount({ ...newAccount, accountNumberLast4: v })} placeholder="0006" />
            <FormField label="Account Size ($)" value={newAccount.accountSize} onChange={(v) => setNewAccount({ ...newAccount, accountSize: v })} placeholder="50000" type="number" />
            <FormField label="Current Balance ($)" value={newAccount.balance} onChange={(v) => setNewAccount({ ...newAccount, balance: v })} placeholder="50000" type="number" />
            <FormField label="Max Drawdown ($)" value={newAccount.maxDrawdown} onChange={(v) => setNewAccount({ ...newAccount, maxDrawdown: v })} placeholder="2000" type="number" />
            <FormField label="Daily Drawdown ($)" value={newAccount.dailyDrawdown} onChange={(v) => setNewAccount({ ...newAccount, dailyDrawdown: v })} placeholder="1000" type="number" />
            <FormField label="Risk Per Trade ($)" value={newAccount.riskPerTrade} onChange={(v) => setNewAccount({ ...newAccount, riskPerTrade: v })} placeholder="200" type="number" />
            <div>
              <label className="text-sm text-gray-400 mb-1 block">Phase</label>
              <select
                value={newAccount.phase}
                onChange={(e) => setNewAccount({ ...newAccount, phase: e.target.value })}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white"
              >
                <option value="challenge">Challenge</option>
                <option value="funded">Funded</option>
                <option value="live">Live</option>
              </select>
            </div>
          </div>
          <div>
            <label className="text-sm text-gray-400 mb-1 block">Rules (comma-separated)</label>
            <input
              value={newAccount.rules}
              onChange={(e) => setNewAccount({ ...newAccount, rules: e.target.value })}
              placeholder="Max daily loss before stopping, Only A+ setups"
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white"
            />
          </div>
          <div className="flex gap-2">
            <button onClick={handleAddAccount} className="bg-neon-purple text-white px-6 py-2 rounded-lg font-medium hover:opacity-90">Add Account</button>
            <button onClick={() => setShowAddAccount(false)} className="bg-gray-700 text-white px-6 py-2 rounded-lg">Cancel</button>
          </div>
        </div>
      )}

      {/* Accounts Grid — Holographic Cards */}
      {accounts.length === 0 ? (
        <div className="text-center py-16 text-gray-500">
          <Wallet className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p>No accounts yet. Click "Add Account" to create one.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {accounts.map((acct) => {
            const isEditing = editingId === acct.id;
            return (
              <HolographicAccountCard
                key={acct.id}
                acct={acct}
                isEditing={isEditing}
                editData={editData}
                onEdit={() => {
                  setEditingId(acct.id);
                  setEditData({ balance: acct.balance, drawdownUsed: acct.drawdownUsed, highWaterMark: acct.highWaterMark, notes: acct.notes, status: acct.status, rules: acct.rules });
                }}
                onDelete={() => handleDeleteAccount(acct.id)}
                onSave={() => handleUpdateAccount(acct.id, editData)}
                onCancel={() => setEditingId(null)}
                setEditField={(field, value) => setEditData({ ...editData, [field]: value })}
              />
            );
          })}
        </div>
      )}

      {/* Combined Rule Calendar — at bottom */}
      <div className="mt-8">
        <h3 className="text-xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-cyan-300 to-purple-300 mb-4">
          Rule Calendar — All Accounts
        </h3>
        <CombinedRuleCalendar
          calAccounts={calendarAccounts}
          calEntriesByAccount={calendarEntriesByAccount}
          onEntryUpsert={onCalendarEntryUpsert || (() => {})}
        />
      </div>
    </div>
  );
};

const FormField: React.FC<{ label: string; value: string; onChange: (v: string) => void; placeholder?: string; type?: string }> = ({ label, value, onChange, placeholder, type = 'text' }) => (
  <div>
    <label className="text-sm text-gray-400 mb-1 block">{label}</label>
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white"
    />
  </div>
);
