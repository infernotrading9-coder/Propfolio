import React, { useMemo } from 'react';
import { DayEntry } from '../utils/calendarStorage';
import { NeonCard } from './NeonCard';

function compute(entries: DayEntry[]) {
  const weekdays = entries.filter(e => e.followedRules !== null);
  const total = weekdays.length;
  const followed = weekdays.filter(e => e.followedRules === true).length;
  const notFollowed = weekdays.filter(e => e.followedRules === false).length;
  const successRate = total ? followed / total : 0;

  // current streak
  const sorted = [...entries].sort((a,b) => a.date.localeCompare(b.date));
  let streak = 0;
  for (let i = sorted.length - 1; i >= 0; i--) {
    const e = sorted[i];
    if (e.followedRules === true) streak++;
    else break;
  }

  return { total, followed, notFollowed, successRate, streak };
}

export const Statistics: React.FC<{ entries: DayEntry[]; accountName?: string; isArchived?: boolean }>
= ({ entries, accountName, isArchived = false }) => {
  const s = useMemo(() => compute(entries), [entries]);
  return (
    <NeonCard className={`p-4 ${isArchived ? 'bg-gradient-to-br from-red-900/10 to-red-800/5' : ''}`} glow={isArchived ? "red" : "cyan"}>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div>
          <div className={`text-xs ${isArchived ? 'text-red-300/60' : 'text-white/60'}`}>Account</div>
          <div className={`text-lg font-semibold ${isArchived ? 'text-red-200' : ''}`}>
            {accountName ?? '—'}
            {isArchived && <span className="text-xs text-red-400 ml-1">(Archived)</span>}
          </div>
        </div>
        <div>
          <div className={`text-xs ${isArchived ? 'text-red-300/60' : 'text-white/60'}`}>Success Rate</div>
          <div className={`text-lg font-semibold ${isArchived ? 'text-red-200' : ''}`}>{(s.successRate * 100).toFixed(1)}%</div>
        </div>
        <div>
          <div className={`text-xs ${isArchived ? 'text-red-300/60' : 'text-white/60'}`}>Followed / Total</div>
          <div className={`text-lg font-semibold ${isArchived ? 'text-red-200' : ''}`}>{s.followed} / {s.total}</div>
        </div>
        <div>
          <div className={`text-xs ${isArchived ? 'text-red-300/60' : 'text-white/60'}`}>Current Streak</div>
          <div className={`text-lg font-semibold ${isArchived ? 'text-red-200' : ''}`}>{s.streak}</div>
        </div>
      </div>
    </NeonCard>
  );
};