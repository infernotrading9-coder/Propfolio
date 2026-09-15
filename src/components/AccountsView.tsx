import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Wallet, GripVertical, Edit3, Save, X, Trash2, ChevronLeft, ChevronRight, CheckCircle2, XCircle, Minus } from 'lucide-react';
import { NeonCard } from './NeonCard';
import { toLocalISODate, todayLocalISO, parseLocalDate } from '../utils/dates';
import { computeDrawdown } from '../../server/db/drawdownModel';

interface TradingAccount {
  id: string;
  name: string;
  firm: string;
  accountNumberLast4?: string | null;
  displayLabel?: string | null;
  accountSize: string;
  balance: string;
  drawdownUsed: string;
  highWaterMark: string;
  maxDrawdown?: string;
  dailyDrawdown?: string;
  lockedFloor?: string | null;
  dayStartBalance?: string | null;
  settledHighWaterMark?: string | null;
  lastSettledAt?: string | null;
  floorLockLevel?: string | null;
  evalType?: string | null;
  firmType?: string | null;
  riskPerTrade?: string;
  rules?: string[] | null;
  notes?: string | null;
  status: string;
  phase: string;
  platform?: string | null;
  groupName?: string | null;
  copyTradeGroup?: string | null;
  sortOrder: number;
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
  glowOverride?: string;
}> = ({ acct, isEditing, editData, onEdit, onDelete, onSave, onCancel, setEditField, glowOverride }) => {
  // Collapsed state: if last_settled_at is after the current session start,
  // the account was logged today and should be collapsed until 5pm EST.
  const sessionStart5pm = (() => {
    const now = new Date();
    const offset = -4 * 3600e3; // EDT = UTC-4
    const ny = new Date(now.getTime() + offset);
    const cut = new Date(Date.UTC(ny.getUTCFullYear(), ny.getUTCMonth(), ny.getUTCDate(), 17, 0, 0));
    const start = cut.getTime() <= ny.getTime() ? cut : new Date(cut.getTime() - 86400e3);
    return new Date(start.getTime() - offset);
  })();
  const isCollapsed = acct.lastSettledAt && new Date(acct.lastSettledAt) >= sessionStart5pm && !isEditing;
  const balance = parseFloat(acct.balance);
  const drawdown = parseFloat(acct.drawdownUsed);
  const hwm = parseFloat(acct.highWaterMark);
  const maxDD = acct.maxDrawdown ? parseFloat(acct.maxDrawdown) : 0;
  const dailyDD = acct.dailyDrawdown ? parseFloat(acct.dailyDrawdown) : 0;
  // Session-aware drawdown: max DD is derived from the SETTLED high-water mark
  // (frozen at the last 5pm EST close) so intraday profit never moves the
  // stop-out, and both drawdowns are shown as price LEVELS rather than dollar
  // amounts. See server/db/drawdownModel.ts for the full rationale.
  const dd = computeDrawdown({
    balance,
    accountSize: parseFloat(acct.accountSize),
    maxDrawdown: maxDD,
    dailyDrawdown: dailyDD,
    dayStartBalance: acct.dayStartBalance != null ? parseFloat(acct.dayStartBalance) : null,
    settledHighWaterMark: acct.settledHighWaterMark != null ? parseFloat(acct.settledHighWaterMark) : null,
    lockedFloor: acct.lockedFloor != null ? parseFloat(acct.lockedFloor) : null,
    floorLockLevel: acct.floorLockLevel != null ? parseFloat(acct.floorLockLevel) : null,
  });
  const ddPercent = maxDD > 0 ? Math.min(100, (drawdown / maxDD) * 100) : 0;
  const profit = balance - hwm;
  // A daily-DD breach is only fatal on CFD firms. On futures it's a session
  // lockout — no more trades until the 5pm settle, but the account survives.
  // Max DD is what actually kills a futures account.
  const isCfd = ['cfd', 'forex'].includes(String(acct.firmType || 'futures').toLowerCase());
  const isFuturesDailyLockout = dd.breached && dd.binding === 'daily' && !isCfd;
  const acctSizeNum = parseFloat(acct.accountSize);
  const sizeLabel = acctSizeNum >= 1000 ? `$${(acctSizeNum / 1000).toFixed(0)}K` : `$${acctSizeNum}`;

  // Stage badge. These three are distinct: passing an eval yields FUNDED, and
  // LIVE is a separate promotion the firm grants after 5+ payouts — it is never
  // implied by passing. `phase` is written only by the cascade service.
  const phaseInfo = acct.phase === 'live'
    ? { color: 'text-lime-400', bgColor: 'bg-lime-500/20', borderColor: 'border-lime-400/50', label: 'Live' }
    : acct.phase === 'funded'
    ? { color: 'text-cyan-400', bgColor: 'bg-cyan-500/20', borderColor: 'border-cyan-400/50', label: 'Funded' }
    : { color: 'text-purple-400', bgColor: 'bg-purple-500/20', borderColor: 'border-purple-400/50', label: 'Eval' };

  return (
    <div className="group relative transform-gpu transition-all duration-300 hover:scale-[1.02] hover:-translate-y-1">
      <NeonCard
        glow={(glowOverride as any) || (ddPercent > 80 ? 'pink' : 'purple')}
        className="relative overflow-hidden p-5 h-full"
      >
        {isCollapsed ? (
          /* Collapsed view — minimized until 5pm EST */
          <div className="relative z-10 flex items-center justify-between">
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <div className="flex-1 min-w-0">
                <h4 className="text-lg font-bold text-white/60 truncate">{acct.name}</h4>
                <p className="text-sm text-white/40 truncate">
                  {acct.firm}{(acct.displayLabel || acct.accountNumberLast4) ? ` · ...${acct.displayLabel || acct.accountNumberLast4}` : ''} · {sizeLabel}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="text-right">
                <div className="text-white/40 text-xs">Balance</div>
                <div className="text-white/60 font-semibold">${balance.toFixed(0)}</div>
              </div>
              <div className={`px-2 py-1 rounded-full text-xs font-medium ${profit >= 0 ? 'bg-lime-500/15 text-lime-300 border border-lime-400/30' : 'bg-red-500/15 text-red-300 border border-red-400/30'}`}>
                {profit >= 0 ? '+' : ''}{profit.toFixed(0)} · ✓ Done
              </div>
            </div>
          </div>
        ) : (
        <>
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
                  {acct.firm}{(acct.displayLabel || acct.accountNumberLast4) ? ` · ...${acct.displayLabel || acct.accountNumberLast4}` : ''} · {sizeLabel}
                  {acct.evalType ? <span className="ml-1 text-cyan-300/70">· {acct.evalType}</span> : null}
                </p>
              </div>
            </div>
            <div className={`flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${phaseInfo.bgColor} ${phaseInfo.borderColor} border`}>
              <span className={phaseInfo.color}>{phaseInfo.label}</span>
            </div>
          </div>

          {isEditing ? (
            <div className="space-y-2">
              <div className="grid grid-cols-4 gap-2">
                <input type="number" value={editData.balance || ''} onChange={(e) => setEditField('balance', e.target.value)} placeholder="Balance" className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-white text-sm" />
                <input type="number" value={editData.maxDrawdown || ''} onChange={(e) => setEditField('maxDrawdown', e.target.value)} placeholder="Max DD" className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-white text-sm" />
                <input type="number" value={editData.dailyDrawdown || ''} onChange={(e) => setEditField('dailyDrawdown', e.target.value)} placeholder="Daily DD" className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-white text-sm" />
                <input type="number" value={editData.lockedFloor || ''} onChange={(e) => setEditField('lockedFloor', e.target.value)} placeholder="Locked Floor" className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-white text-sm" />
              </div>
              <div className="grid grid-cols-4 gap-2">
                <input type="number" value={editData.drawdownUsed || ''} onChange={(e) => setEditField('drawdownUsed', e.target.value)} placeholder="DD Used" className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-white text-sm" />
              </div>
              <div className="flex gap-2">
                <button onClick={onSave} className="bg-neon-lime text-black px-3 py-1 rounded text-sm font-medium"><Save className="w-3 h-3 inline" /> Save</button>
                <button onClick={onCancel} className="bg-gray-700 text-white px-3 py-1 rounded text-sm"><X className="w-3 h-3 inline" /> Cancel</button>
              </div>
            </div>
          ) : (
            <>
              {/* Stats grid */}
              <div className="grid grid-cols-4 gap-2 text-center">
                <div>
                  <div className="text-white/40 text-xs">Balance</div>
                  <div className="text-white font-semibold">${balance.toFixed(0)}</div>
                </div>
                <div>
                  <div className="text-white/40 text-xs">Max DD {dd.floorLocked && <span className="text-amber-400/70">🔒</span>}</div>
                  <div
                    title={`Account dies at $${dd.maxDDLevel.toFixed(0)} — ${dd.floorLocked ? 'floor is LOCKED here' : `trailing from settled HWM $${dd.settledHwm.toFixed(0)} − $${maxDD.toFixed(0)}; locks at $${dd.lockLevel.toFixed(0)}`}. After the 5pm settle: $${dd.projectedMaxDDLevelAtSettle.toFixed(0)}${dd.willLockAtSettle ? ' (locks permanently)' : ''}`}
                    className={`font-medium ${dd.maxDDRoom <= 0 ? 'text-red-400' : 'text-white/70'}`}
                  >${dd.maxDDLevel.toFixed(0)}</div>
                  <div className="text-white/30 text-[10px] leading-tight">{dd.maxDDRoom >= 0 ? `${dd.maxDDRoom.toFixed(0)} away` : `${Math.abs(dd.maxDDRoom).toFixed(0)} under`}</div>
                </div>
                <div>
                  <div className="text-white/40 text-xs">Daily DD</div>
                  <div
                    title={`Account dies at $${dd.dailyDDLevel.toFixed(0)} today — day-start $${dd.dayStart.toFixed(0)} − daily limit $${dailyDD.toFixed(0)}. Resets at the 5pm EST settle.`}
                    className={`font-medium ${dd.dailyDDRoom <= 0 ? 'text-red-400' : 'text-white/70'}`}
                  >${dailyDD > 0 ? dd.dailyDDLevel.toFixed(0) : '—'}</div>
                  <div className="text-white/30 text-[10px] leading-tight">{dailyDD > 0 ? (dd.dailyDDRoom >= 0 ? `${dd.dailyDDRoom.toFixed(0)} away` : `${Math.abs(dd.dailyDDRoom).toFixed(0)} under`) : 'not set'}</div>
                </div>
                <div>
                  <div className="text-white/40 text-xs">P&L</div>
                  <div className={`font-medium ${profit >= 0 ? 'text-lime-400' : 'text-red-400'}`}>{profit >= 0 ? '+' : ''}{profit.toFixed(0)}</div>
                </div>
              </div>

              {/* Stop-out: the level you actually hit first */}
              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-white/40">
                    Stop-out <span className="text-white/30">({dd.binding === 'daily' ? 'daily' : 'max DD'} binding)</span>
                  </span>
                  <span className={dd.breached ? (isFuturesDailyLockout ? 'text-amber-400 font-semibold' : 'text-red-400 font-semibold') : dd.room < (dailyDD || maxDD) * 0.25 ? 'text-amber-400' : 'text-white/50'}>
                    ${dd.stopOutLevel.toFixed(0)} · {dd.breached ? (isFuturesDailyLockout ? `LOCKED OUT ${Math.abs(dd.room).toFixed(0)} over` : `BREACHED ${Math.abs(dd.room).toFixed(0)}`) : `${dd.room.toFixed(0)} room`}
                  </span>
                </div>
                <div className="h-2 bg-white/5 rounded-full overflow-hidden">
                  {(() => {
                    // Room remaining as a share of the day's allowance.
                    const allowance = Math.max(dailyDD || 0, maxDD || 0, 1);
                    const pct = Math.max(0, Math.min(100, (dd.room / allowance) * 100));
                    return (
                      <div
                        className={`h-full rounded-full transition-all ${dd.breached || pct < 20 ? 'bg-red-500' : pct < 50 ? 'bg-amber-500' : 'bg-gradient-to-r from-cyan-400 to-purple-400'}`}
                        style={{ width: `${dd.breached ? 100 : pct}%` }}
                      />
                    );
                  })()}
                </div>
                <div className="flex justify-between text-[10px] text-white/30 mt-1">
                  <span>Day start ${dd.dayStart.toFixed(0)} · today {dd.dayPnL >= 0 ? '+' : ''}{dd.dayPnL.toFixed(0)}</span>
                  {!dd.floorLocked && dd.willLockAtSettle && <span className="text-amber-400/70">locks ${dd.projectedMaxDDLevelAtSettle.toFixed(0)} at 5pm</span>}
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
        </>
        )}
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
    days.push({ date: toLocalISODate(d), isCurrentMonth: d.getMonth() === month });
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

  const today = todayLocalISO();

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

  // Selected date detail.
  // Every ACTIVE calendar account is listed for the selected day, whether or not
  // it already has an entry. Previously this was derived from dateMap (existing
  // entries only), which deadlocked the calendar: with no entries there was
  // nothing to click, and the only path to the mark buttons was clicking an
  // existing entry — so the first entry could never be created.
  const selectedDateItems = useMemo(() => {
    if (!selectedDate) return [] as Array<{ accountId: string; accountName: string; entry: CalEntry | null }>;
    return calAccounts
      .filter(a => a.isActive)
      .map(a => ({
        accountId: a.id,
        accountName: a.name,
        entry: (calEntriesByAccount[a.id] || []).find(e => e.date === selectedDate) || null,
      }));
  }, [selectedDate, calAccounts, calEntriesByAccount]);
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
          const dayNum = parseLocalDate(d).getDate();

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
            <p className="text-white/40 text-sm text-center py-4">No active accounts to log rules against.</p>
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
                const status = item.entry ? item.entry.followedRules : undefined;
                return (
                  <div
                    key={item.accountId}
                    onClick={() => setSelectedAccountId(item.accountId)}
                    className={`cursor-pointer p-3 rounded-lg border transition-all hover:scale-[1.02] hover:-translate-y-0.5 ${
                      status === true ? 'bg-emerald-500/10 border-emerald-400/30 hover:border-emerald-400/50' :
                      status === false ? 'bg-rose-500/10 border-rose-400/30 hover:border-rose-400/50' :
                      status === null ? 'bg-white/5 border-white/10 hover:border-white/20' :
                      'bg-white/[0.02] border-dashed border-white/10 hover:border-cyan-400/40'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-white font-medium text-sm truncate">{item.accountName}</span>
                      {status === true ? <CheckCircle2 className="w-4 h-4 text-emerald-400" /> :
                       status === false ? <XCircle className="w-4 h-4 text-rose-400" /> :
                       <Minus className="w-4 h-4 text-white/30" />}
                    </div>
                    <div className={`text-xs ${status === undefined ? 'text-cyan-300/60' : 'text-white/50'}`}>
                      {status === true ? 'Rules Followed' : status === false ? 'Rules Broken' : status === null ? 'No Trade' : 'Not marked — click to log'}
                    </div>
                    {item.entry?.ruleCompliance && Object.keys(item.entry.ruleCompliance).length > 0 && (
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

// ─── Copy-Trade Group Card (same size as a regular card, slightly different color) ──
const CopyTradeGroupCard: React.FC<{
  accounts: TradingAccount[];
  groupLabel: string;
  editingId: string | null;
  editData: Partial<TradingAccount>;
  onEdit: (id: string) => void;
  onSave: (id: string, updates: Partial<TradingAccount>) => void;
  onCancel: () => void;
  setEditField: (field: string, value: string) => void;
  onUnlink: (ref: string) => void;
}> = ({ accounts: groupAccts, groupLabel, editingId, editData, onEdit, onSave, onCancel, setEditField, onUnlink }) => {
  const [expanded, setExpanded] = useState(false);
  const [unlinkTarget, setUnlinkTarget] = useState<string | null>(null);
  const primary = groupAccts[0];

  return (
    <div className="relative">
      {/* Same HolographicAccountCard — the cyan glow prop tints it */}
      <div onDoubleClick={() => setExpanded(!expanded)} className="relative">
        <div className="absolute top-2 right-2 z-30 px-2 py-0.5 rounded-full bg-cyan-500/20 border border-cyan-400/40 text-cyan-300 text-xs font-medium pointer-events-none">
          🔗 {groupLabel}
        </div>
        <HolographicAccountCard
          acct={primary}
          isEditing={editingId === primary.id}
          editData={editData}
          onEdit={() => onEdit(primary.id)}
          onDelete={() => {}}
          onSave={() => onSave(primary.id, editData)}
          onCancel={onCancel}
          setEditField={setEditField}
          glowOverride="cyan"
        />
      </div>

      {/* Expand panel — slides down on double-click */}
      {expanded && (
        <div className="mt-2 rounded-xl border border-cyan-400/20 bg-gray-900/80 p-4" style={{ animation: 'slideUp 0.3s ease-out' }}>
          <div className="flex items-center justify-between mb-3">
            <span className="text-cyan-300 text-sm font-semibold">🔗 {groupLabel} — {groupAccts.length} accounts</span>
            <button onClick={() => setExpanded(false)} className="text-white/40 hover:text-white text-xs">Collapse ✕</button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {groupAccts.map((acct) => (
              <div key={acct.id} className="relative bg-white/5 rounded-lg p-3 border border-white/10">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-white font-medium text-sm">{acct.displayLabel || acct.name}</span>
                  <button
                    onClick={() => setUnlinkTarget(acct.displayLabel || acct.accountNumberLast4 || acct.id)}
                    className="text-white/30 hover:text-red-400 text-xs"
                    title="Unlink from group"
                  >✕</button>
                </div>
                <div className="grid grid-cols-3 gap-2 text-center text-xs">
                  <div>
                    <div className="text-white/40">Balance</div>
                    <div className="text-white font-semibold">${parseFloat(acct.balance).toFixed(0)}</div>
                  </div>
                  <div>
                    <div className="text-white/40">P&L</div>
                    <div className={`font-semibold ${parseFloat(acct.balance) - parseFloat(acct.highWaterMark) >= 0 ? 'text-lime-400' : 'text-red-400'}`}>
                      {parseFloat(acct.balance) - parseFloat(acct.highWaterMark) >= 0 ? '+' : ''}{(parseFloat(acct.balance) - parseFloat(acct.highWaterMark)).toFixed(0)}
                    </div>
                  </div>
                  <div>
                    <div className="text-white/40">Size</div>
                    <div className="text-white/70">${parseFloat(acct.accountSize).toFixed(0)}</div>
                  </div>
                </div>
                <div className="flex gap-1 mt-2 justify-end">
                  <button onClick={() => onEdit(acct.id)} className="text-white/40 hover:text-cyan-300 text-xs">Edit</button>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-2 text-center">
            <span className="text-white/30 text-xs">Double-click the card to collapse</span>
          </div>
        </div>
      )}

      {/* Unlink confirm prompt */}
      {unlinkTarget && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setUnlinkTarget(null)}>
          <div className="bg-[#0a0e17] border border-red-500/40 rounded-xl p-6 max-w-sm w-full shadow-[0_0_30px_rgba(239,68,68,0.3)]" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-white mb-2">Unlink {unlinkTarget}?</h3>
            <p className="text-white/60 text-sm mb-4">This will remove {unlinkTarget} from the copy-trade group. You can re-link it later.</p>
            <div className="flex gap-2">
              <button
                onClick={() => { onUnlink(unlinkTarget); setUnlinkTarget(null); }}
                className="flex-1 bg-red-600 text-white px-4 py-2 rounded-lg font-medium text-sm"
              >Yes, unlink</button>
              <button onClick={() => setUnlinkTarget(null)} className="flex-1 bg-gray-700 text-white px-4 py-2 rounded-lg text-sm">Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ─── Main AccountsView ───────────────────────────────────────────────────────
export const AccountsView: React.FC<AccountsViewProps> = ({ apiBase, getAuthHeaders, calendarAccounts = [], calendarEntriesByAccount = {}, onCalendarEntryUpsert }) => {
  const [accounts, setAccounts] = useState<TradingAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddAccount, setShowAddAccount] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [orderMode, setOrderMode] = useState(false);
  const [orderedIds, setOrderedIds] = useState<string[]>([]);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [linkMode, setLinkMode] = useState(false);
  const [linkSelected, setLinkSelected] = useState<Set<string>>(new Set());
  const [linkFlash, setLinkFlash] = useState(false);
  const [linkLabel, setLinkLabel] = useState('');
  const [linkTargetGroup, setLinkTargetGroup] = useState<string | null>(null);

  const [newAccount, setNewAccount] = useState({
    name: '', firm: '', accountNumberLast4: '', accountSize: '', balance: '', maxDrawdown: '', dailyDrawdown: '', lockedFloor: '', riskPerTrade: '', rules: '', notes: '', phase: 'challenge', platform: '', groupName: '', cost: '',
  });

  const [editData, setEditData] = useState<Partial<TradingAccount>>({});

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [accountsRes] = await Promise.all([
        fetch(`${apiBase}/db-accounts`, { headers: getAuthHeaders() }),
      ]);
      const accountsData = await accountsRes.json();
      if (accountsData.accounts) setAccounts(accountsData.accounts);
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
          // Single-source: adding an eval account also spawns its challenge + budget expense.
          spawnChallengeAndBudget: true,
          cost: parseFloat(newAccount.cost) || 0,
        }),
      });
      setShowAddAccount(false);
      setNewAccount({ name: '', firm: '', accountNumberLast4: '', accountSize: '', balance: '', maxDrawdown: '', dailyDrawdown: '', lockedFloor: '', riskPerTrade: '', rules: '', notes: '', phase: 'challenge', platform: '', groupName: '', cost: '' });
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


  // Drag-and-drop reorder (moveAccount removed — reorder uses drag only)
  const handleDragStart = (index: number) => setDragIndex(index);
  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (dragIndex === null || dragIndex === index) return;
    const newOrder = [...orderedIds];
    const [moved] = newOrder.splice(dragIndex, 1);
    newOrder.splice(index, 0, moved);
    setOrderedIds(newOrder);
    setDragIndex(index);
  };
  const handleDragEnd = () => setDragIndex(null);
  const handleSaveDragOrder = async () => {
    // Save the dragged order as both the sort_order and the daily order
    try {
      await fetch(`${apiBase}/db-accounts`, {
        method: 'POST',
        headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'reorder', orderedIds }),
      });
      await fetch(`${apiBase}/db-accounts`, {
        method: 'POST',
        headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'set-daily-order', orderDate: todayLocalISO(), orderedAccountIds: orderedIds }),
      });
      setOrderMode(false);
      loadData();
    } catch (e) { console.error('Failed to save drag order:', e); }
  };

  // Copy-trade grouping
  const groupedAccounts = useMemo(() => {
    const groups = new Map<string, TradingAccount[]>();
    const standalone: TradingAccount[] = [];
    for (const acct of accounts) {
      if (acct.copyTradeGroup) {
        const existing = groups.get(acct.copyTradeGroup) || [];
        existing.push(acct);
        groups.set(acct.copyTradeGroup, existing);
      } else {
        standalone.push(acct);
      }
    }
    return { groups, standalone };
  }, [accounts]);

  const handleLinkCopyTrade = async () => {
    if (linkSelected.size < 1) { alert('Select at least 1 account'); return; }
    const refs: string[] = [];
    for (const id of linkSelected) {
      const acct = accounts.find(a => a.id === id);
      if (acct) refs.push(acct.displayLabel || acct.accountNumberLast4 || acct.id);
    }
    // If adding to an existing group, use that group's ID
    const groupId = linkTargetGroup || (linkLabel.trim() || `${refs[0]} +${refs.length - 1}`);
    try {
      await fetch(`${apiBase}/db-accounts`, {
        method: 'POST',
        headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'link-copy-trade', accountRefs: refs, groupLabel: groupId }),
      });
      setLinkMode(false);
      setLinkSelected(new Set());
      setLinkLabel('');
      setLinkTargetGroup(null);
      loadData();
    } catch (e) { console.error('Failed to link copy trades:', e); alert('Failed to link accounts'); }
  };

  const toggleLinkSelect = (id: string) => {
    setLinkSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setLinkFlash(true);
    setTimeout(() => setLinkFlash(false), 400);
  };

  const handleUnlinkCopyTrade = async (ref: string) => {
    try {
      await fetch(`${apiBase}/db-accounts`, {
        method: 'POST',
        headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'unlink-copy-trade', accountRef: ref }),
      });
      loadData();
    } catch (e) { console.error('Failed to unlink:', e); }
  };

  if (loading) {
    return <div className="flex items-center justify-center py-20 text-gray-400">Loading accounts...</div>;
  }

  return (
    <div className="space-y-6">
      <style>{`
        @keyframes slideUp {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      {/* Accounts Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-white flex items-center gap-2">
          <Wallet className="w-6 h-6 text-neon-purple" />
          Trading Accounts
        </h2>
        <div className="flex gap-2">
          <button
            onClick={() => { setLinkMode(!linkMode); setLinkSelected(new Set()); }}
            className={`px-4 py-2 rounded-lg font-medium text-sm transition-all ${linkMode ? 'bg-cyan-500/30 border border-cyan-400/50 text-cyan-200 shadow-[0_0_20px_rgba(6,182,212,0.3)]' : 'bg-gradient-to-r from-cyan-500/20 to-purple-500/20 border border-cyan-400/30 text-cyan-200 hover:opacity-90'}`}
          >
            {linkMode ? 'Cancel Link' : '🔗 Link Copy Trades'}
          </button>
          <button
            onClick={() => { setOrderMode(!orderMode); if (!orderMode) setOrderedIds(accounts.map(a => a.id)); }}
            disabled={linkMode}
            className="bg-white/5 border border-white/10 text-white/70 px-4 py-2 rounded-lg font-medium text-sm hover:opacity-90 disabled:opacity-30"
          >
            {orderMode ? 'Cancel' : '↕ Reorder'}
          </button>
          <button
            onClick={() => setShowAddAccount(!showAddAccount)}
            disabled={linkMode || orderMode}
            className="bg-gradient-to-r from-neon-purple to-neon-cyan text-white px-4 py-2 rounded-lg font-medium hover:opacity-90 disabled:opacity-30"
          >
            + Add Account
          </button>
        </div>
      </div>

      {/* Link mode banner + floating confirm panel */}
      {linkMode && (
        <>
          <div className="flex items-center justify-between bg-cyan-500/10 border border-cyan-400/30 rounded-xl px-4 py-3 animate-pulse">
            <span className="text-cyan-200 text-sm font-medium">
              Click accounts to select them ({linkSelected.size} selected). Select 1+ to add to a group, or 2+ to create a new group.
            </span>
            <button onClick={() => { setLinkMode(false); setLinkSelected(new Set()); }} className="text-white/50 hover:text-white text-sm">Exit</button>
          </div>

          {/* Floating confirm panel — slides in when 1+ selected */}
          {linkSelected.size >= 1 && (
            <div className="fixed bottom-6 right-6 z-40 bg-[#0a0e17] border border-cyan-400/50 rounded-xl p-4 shadow-[0_0_30px_rgba(6,182,212,0.3)] max-w-xs"
              style={{ animation: 'slideUp 0.3s ease-out' }}>
              <div className="flex items-center gap-2 mb-2">
                <span className="text-cyan-300 text-sm font-bold">🔗 Link {linkSelected.size} account{linkSelected.size > 1 ? 's' : ''}?</span>
              </div>
              <div className="flex flex-wrap gap-1 mb-3">
                {[...linkSelected].map(id => {
                  const a = accounts.find(x => x.id === id);
                  return (
                    <span key={id} className="text-xs bg-cyan-500/20 border border-cyan-400/30 text-cyan-200 px-2 py-0.5 rounded-full">
                      {a?.displayLabel || a?.accountNumberLast4 || a?.name}
                    </span>
                  );
                })}
              </div>
              {/* If existing groups exist, show a dropdown to add to one */}
              {groupedAccounts.groups.size > 0 && (
                <div className="mb-2">
                  <label className="text-xs text-white/50 block mb-1">Add to existing group (optional):</label>
                  <select
                    value={linkTargetGroup || ''}
                    onChange={(e) => setLinkTargetGroup(e.target.value || null)}
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-xs mb-1"
                  >
                    <option value="">— Create new group —</option>
                    {Array.from(groupedAccounts.groups.keys()).map(g => (
                      <option key={g} value={g} className="bg-gray-800">{g} ({groupedAccounts.groups.get(g)!.length} accounts)</option>
                    ))}
                  </select>
                </div>
              )}
              {!linkTargetGroup && (
                <input
                  value={linkLabel}
                  onChange={(e) => setLinkLabel(e.target.value)}
                  placeholder="New group label (optional)"
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-xs mb-2"
                />
              )}
              <div className="flex gap-2">
                <button onClick={handleLinkCopyTrade} className="flex-1 bg-cyan-600 text-white px-3 py-2 rounded-lg font-medium text-sm">
                  {linkTargetGroup ? 'Add to Group' : 'Link Accounts'}
                </button>
                <button onClick={() => { setLinkSelected(new Set()); setLinkTargetGroup(null); }} className="bg-gray-700 text-white px-3 py-2 rounded-lg text-sm">Clear</button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Reorder save bar */}
      {orderMode && (
        <div className="flex items-center justify-between bg-cyan-500/5 border border-cyan-400/20 rounded-xl px-4 py-3">
          <span className="text-cyan-200 text-sm">Drag cards to reorder. Saved as today's trading order.</span>
          <button onClick={handleSaveDragOrder} className="bg-neon-lime text-black px-4 py-2 rounded-lg font-medium text-sm">
            Save Order
          </button>
        </div>
      )}

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
            <FormField label="Eval Cost ($) — logs budget expense" value={newAccount.cost} onChange={(v) => setNewAccount({ ...newAccount, cost: v })} placeholder="89" type="number" />
            <FormField label="Max Drawdown ($)" value={newAccount.maxDrawdown} onChange={(v) => setNewAccount({ ...newAccount, maxDrawdown: v })} placeholder="2000" type="number" />
            <FormField label="Daily Drawdown ($)" value={newAccount.dailyDrawdown} onChange={(v) => setNewAccount({ ...newAccount, dailyDrawdown: v })} placeholder="1000" type="number" />
            <FormField label="Locked Floor ($) — max DD frozen at this level" value={newAccount.lockedFloor} onChange={(v) => setNewAccount({ ...newAccount, lockedFloor: v })} placeholder="50100" type="number" />
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

      {/* Accounts Grid — Holographic Cards with copy-trade grouping + drag + link select */}
      {accounts.length === 0 ? (
        <div className="text-center py-16 text-gray-500">
          <Wallet className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p>No accounts yet. Click "Add Account" to create one.</p>
        </div>
      ) : orderMode ? (
        /* Reorder mode: draggable list */
        <div className="space-y-2">
          {orderedIds.map((id, idx) => {
            const acct = accounts.find(a => a.id === id);
            if (!acct) return null;
            return (
              <div
                key={id}
                draggable
                onDragStart={() => handleDragStart(idx)}
                onDragOver={(e) => handleDragOver(e, idx)}
                onDragEnd={handleDragEnd}
                className={`flex items-center gap-3 bg-gray-800/50 rounded-lg px-4 py-3 border ${dragIndex === idx ? 'border-cyan-400/50 opacity-60' : 'border-transparent'} cursor-grab active:cursor-grabbing`}
              >
                <GripVertical className="w-4 h-4 text-gray-500 flex-shrink-0" />
                <span className="text-neon-cyan font-bold w-6 text-center">{idx + 1}</span>
                <span className="text-white font-medium">{acct.name}</span>
                <span className="text-gray-400 text-sm">{acct.firm}</span>
                <span className="text-gray-500 text-sm ml-auto">${parseFloat(acct.balance).toFixed(0)}</span>
              </div>
            );
          })}
        </div>
      ) : linkMode ? (
        /* Link mode: click-to-select standalone accounts */
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {groupedAccounts.standalone.map((acct) => {
            const isSelected = linkSelected.has(acct.id);
            return (
              <div
                key={acct.id}
                onClick={() => toggleLinkSelect(acct.id)}
                className={`cursor-pointer transition-all duration-300 rounded-xl border-2 ${isSelected ? 'border-cyan-400/70 bg-cyan-500/10 shadow-[0_0_25px_rgba(6,182,212,0.3)] scale-[1.02]' : 'border-white/10 hover:border-cyan-400/30 hover:scale-[1.01]'} ${linkFlash && isSelected ? 'animate-bounce' : ''}`}
              >
                <HolographicAccountCard
                  acct={acct}
                  isEditing={false}
                  editData={editData}
                  onEdit={() => {}}
                  onDelete={() => {}}
                  onSave={() => {}}
                  onCancel={() => {}}
                  setEditField={() => {}}
                />
                {isSelected && (
                  <div className="absolute top-2 right-2 w-6 h-6 rounded-full bg-cyan-500 flex items-center justify-center text-white text-xs font-bold z-20">
                    ✓
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="space-y-4">
          {/* Copy-trade groups */}
          {Array.from(groupedAccounts.groups.entries()).map(([groupId, groupAccts]) => (
            <CopyTradeGroupCard
              key={groupId}
              accounts={groupAccts}
              groupLabel={groupId}
              editingId={editingId}
              editData={editData}
              onEdit={(id) => { setEditingId(id); const a = accounts.find(x => x.id === id); if (a) setEditData({ balance: a.balance, drawdownUsed: a.drawdownUsed, highWaterMark: a.highWaterMark, maxDrawdown: a.maxDrawdown, dailyDrawdown: a.dailyDrawdown, lockedFloor: a.lockedFloor, notes: a.notes, status: a.status, rules: a.rules }); }}
              onSave={handleUpdateAccount}
              onCancel={() => setEditingId(null)}
              setEditField={(field, value) => setEditData(prev => ({ ...prev, [field]: value }))}
              onUnlink={handleUnlinkCopyTrade}
            />
          ))}
          {/* Standalone accounts */}
          {groupedAccounts.standalone.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {groupedAccounts.standalone.map((acct) => {
                const isEditing = editingId === acct.id;
                return (
                  <HolographicAccountCard
                    key={acct.id}
                    acct={acct}
                    isEditing={isEditing}
                    editData={editData}
                    onEdit={() => {
                      setEditingId(acct.id);
                      setEditData({ balance: acct.balance, drawdownUsed: acct.drawdownUsed, highWaterMark: acct.highWaterMark, maxDrawdown: acct.maxDrawdown, dailyDrawdown: acct.dailyDrawdown, lockedFloor: acct.lockedFloor, notes: acct.notes, status: acct.status, rules: acct.rules });
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
