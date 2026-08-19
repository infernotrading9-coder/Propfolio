import React, { useMemo, useState } from 'react';
import { NeonCard } from './NeonCard';
import { StatsSummary, Challenge } from '../types';
import { Trophy, DollarSign, Percent, Wallet, Calculator, Clock } from 'lucide-react';

type PassBasis = 'start' | 'completion';

function computeYearStats(challenges: Challenge[], year: string, basis: PassBasis): StatsSummary {
  const validChallenges = challenges.filter(challenge => challenge);
  
  // Challenges that started in the selected year (used for costs and success rates)
  const challengesStartedThisYear = validChallenges.filter(c => {
    if (!c?.startDate) return false;
    return c.startDate.slice(0, 4) === year;
  });
  
  const spent = challengesStartedThisYear.reduce((s, c) => s + (c?.cost ?? 0), 0);
  
  // Payouts received in the selected year across ALL challenges
  const payouts = validChallenges.reduce((sum, c) => {
    if (Array.isArray(c?.payouts)) {
      const yearly = c.payouts.reduce((pSum, p) => {
        const d = p?.date;
        if (typeof d === 'string' && d.slice(0, 4) === year) {
          return pSum + (p?.amount ?? 0);
        }
        return pSum;
      }, 0);
      return sum + yearly;
    }
    return sum;
  }, 0);
  
  const roi = spent > 0 ? (payouts - spent) / spent : 0;
  const isInYear = (d?: string) => typeof d === 'string' && d.slice(0,4) === year;
  const eligibleByStart = {
    e1: challengesStartedThisYear.filter(c => (c?.totalPhases || 3) >= 1),
    e2: challengesStartedThisYear.filter(c => (c?.totalPhases || 3) >= 2),
    e3: challengesStartedThisYear.filter(c => (c?.totalPhases || 3) >= 3),
  };
  const eligibleByCompletion = {
    e1: validChallenges.filter(c => (c?.totalPhases || 3) >= 1 && (isInYear(c?.startDate) || isInYear(c?.phases?.phase1?.completedAt))),
    e2: validChallenges.filter(c => (c?.totalPhases || 3) >= 2 && (isInYear(c?.startDate) || isInYear(c?.phases?.phase2?.completedAt))),
    e3: validChallenges.filter(c => (c?.totalPhases || 3) >= 3 && (isInYear(c?.startDate) || isInYear(c?.phases?.phase3?.completedAt))),
  };
  const eligible1 = basis === 'completion' ? eligibleByCompletion.e1 : eligibleByStart.e1;
  const eligible2 = basis === 'completion' ? eligibleByCompletion.e2 : eligibleByStart.e2;
  const eligible3 = basis === 'completion' ? eligibleByCompletion.e3 : eligibleByStart.e3;
  const liveAccounts = (basis === 'completion'
    ? eligible1.filter(c => {
        const tp = c.totalPhases || 3;
        if (tp === 1) return !!c.phases?.phase1?.completed && isInYear(c.phases?.phase1?.completedAt);
        if (tp === 2) return !!c.phases?.phase1?.completed && !!c.phases?.phase2?.completed && isInYear(c.phases?.phase2?.completedAt);
        return !!c.phases?.phase1?.completed && !!c.phases?.phase2?.completed && !!c.phases?.phase3?.completed && isInYear(c.phases?.phase3?.completedAt);
      })
    : eligible1.filter(c => {
        const tp = c.totalPhases || 3;
        if (tp === 1) return c.phases?.phase1?.completed;
        if (tp === 2) return c.phases?.phase1?.completed && c.phases?.phase2?.completed;
        return c.phases?.phase1?.completed && c.phases?.phase2?.completed && c.phases?.phase3?.completed;
      })
  ).length;
  
  const phase1Passed = (basis === 'completion'
    ? eligible1.filter(c => !!c?.phases?.phase1?.completed && isInYear(c?.phases?.phase1?.completedAt))
    : eligible1.filter(c => !!c?.phases?.phase1?.completed)
  ).length;
  const phase2Passed = (basis === 'completion'
    ? eligible2.filter(c => !!c?.phases?.phase2?.completed && isInYear(c?.phases?.phase2?.completedAt))
    : eligible2.filter(c => !!c?.phases?.phase2?.completed)
  ).length;
  const phase3Passed = (basis === 'completion'
    ? eligible3.filter(c => !!c?.phases?.phase3?.completed && isInYear(c?.phases?.phase3?.completedAt))
    : eligible3.filter(c => !!c?.phases?.phase3?.completed)
  ).length;
  const phase1Pass = eligible1.length > 0 ? (phase1Passed / eligible1.length) : 0;
  const phase2Pass = eligible2.length > 0 ? (phase2Passed / eligible2.length) : 0;
  const phase3Pass = eligible3.length > 0 ? (phase3Passed / eligible3.length) : 0;
  const liveAccountsRate = eligible1.length > 0 ? (liveAccounts / eligible1.length) : 0;
  
  const costPerLiveAccount = liveAccounts > 0 ? spent / liveAccounts : 0;
  
  // Average time to live account for challenges started in the selected year
  const liveAccountChallenges = challengesStartedThisYear.filter(c => {
    if (!c?.phases) return false;
    const totalPhases = c.totalPhases || 3;
    if (totalPhases === 1) return c.phases?.phase1?.completed && c.phases?.phase1?.completedAt;
    if (totalPhases === 2) return c.phases?.phase1?.completed && c.phases?.phase2?.completed && c.phases?.phase2?.completedAt;
    return c.phases?.phase1?.completed && c.phases?.phase2?.completed && c.phases?.phase3?.completed && c.phases?.phase3?.completedAt;
  });
  
  let totalDaysToLive = 0;
  liveAccountChallenges.forEach(challenge => {
    if (!challenge?.startDate || !challenge?.phases) return;
    const startDate = new Date(challenge.startDate);
    const totalPhases = challenge.totalPhases || 3;
    
    let finalCompletionDate;
    if (totalPhases === 1 && challenge.phases?.phase1?.completedAt) {
      finalCompletionDate = new Date(challenge.phases.phase1.completedAt);
    } else if (totalPhases === 2 && challenge.phases?.phase2?.completedAt) {
      finalCompletionDate = new Date(challenge.phases.phase2.completedAt);
    } else if (totalPhases === 3 && challenge.phases?.phase3?.completedAt) {
      finalCompletionDate = new Date(challenge.phases.phase3.completedAt);
    }
    
    if (finalCompletionDate) {
      const daysDiff = Math.floor((finalCompletionDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
      if (daysDiff >= 0) {
        totalDaysToLive += daysDiff;
      }
    }
  });
  
  const averageTimeToLive = liveAccountChallenges.length > 0 ? totalDaysToLive / liveAccountChallenges.length : 0;
  
  const firstChallengeMonth = challengesStartedThisYear.length > 0 ? challengesStartedThisYear.reduce((min, c) => {
    if (!c?.startDate || !min?.startDate) return min;
    return (c.startDate < min.startDate ? c : min);
  }, challengesStartedThisYear[0])?.startDate?.slice(0,7) : undefined;
  
  // Account size performance scoped to challenges started this year
  const accountSizeGroups = {
    '10K': challengesStartedThisYear.filter(c => c?.accountSize && c.accountSize <= 10000),
    '25K': challengesStartedThisYear.filter(c => c?.accountSize && c.accountSize > 10000 && c.accountSize <= 25000),
    '50K': challengesStartedThisYear.filter(c => c?.accountSize && c.accountSize > 25000 && c.accountSize <= 50000),
    '100K': challengesStartedThisYear.filter(c => c?.accountSize && c.accountSize > 50000 && c.accountSize <= 100000),
    '200K+': challengesStartedThisYear.filter(c => c?.accountSize && c.accountSize > 100000)
  };
  
  const accountSizePerformance: Record<string, { roi: number; successRate: number; count: number }> = {};
  Object.entries(accountSizeGroups).forEach(([size, sizeChall]) => {
    if (sizeChall.length > 0) {
      const sizeSpent = sizeChall.reduce((s, c) => s + (c?.cost ?? 0), 0);
      // Payouts for these challenges, but only amounts received in the selected year
      const sizePayouts = sizeChall.reduce((s, c) => {
        if (Array.isArray(c?.payouts)) {
          return s + c.payouts.reduce((sum, p) => {
            const d = p?.date;
            if (typeof d === 'string' && d.slice(0, 4) === year) {
              return sum + (p?.amount ?? 0);
            }
            return sum;
          }, 0);
        }
        return s;
      }, 0);
      const sizeROI = sizeSpent > 0 ? (sizePayouts - sizeSpent) / sizeSpent : 0;
      
      const sizeLiveAccounts = sizeChall.filter(c => {
        if (!c?.phases) return false;
        const totalPhases = c.totalPhases || 3;
        if (totalPhases === 1) return c.phases?.phase1?.completed;
        if (totalPhases === 2) return c.phases?.phase1?.completed && c.phases?.phase2?.completed;
        return c.phases?.phase1?.completed && c.phases?.phase2?.completed && c.phases?.phase3?.completed;
      }).length;
      
      accountSizePerformance[size] = {
        roi: sizeROI,
        successRate: sizeLiveAccounts / sizeChall.length,
        count: sizeChall.length
      };
    }
  });
  
  return {
    totalSpent: spent,
    totalPayouts: payouts,
    roi,
    liveAccountsRate,
    phase1PassRate: phase1Pass,
    phase2PassRate: phase2Pass,
    phase3PassRate: phase3Pass,
    costPerLiveAccount,
    averageTimeToLive,
    firstChallengeMonth,
    
    longestWinStreak: 0,
    longestLoseStreak: 0,
    currentStreak: { type: 'none' as const, count: 0 },
    accountSizePerformance,
    firmPerformance: {},
  };
}

export const DashboardStats: React.FC<{ challenges: Challenge[]; selectedYear: string; onChangeYear: (y: string) => void }> = ({ challenges, selectedYear, onChangeYear }) => {
  
  const [basis, setBasis] = useState<PassBasis>('start');
  
  const availableYears = useMemo(() => {
    const years = new Set<string>();
    years.add(new Date().getFullYear().toString());
    challenges.forEach(c => {
      if (c?.startDate && typeof c.startDate === 'string') {
        years.add(c.startDate.slice(0, 4));
      }
      if (Array.isArray(c?.payouts)) {
        c.payouts.forEach(p => {
          const d = p?.date;
          if (typeof d === 'string' && d.length >= 4) {
            years.add(d.slice(0, 4));
          }
        });
      }
    });
    return Array.from(years).sort((a, b) => parseInt(b) - parseInt(a));
  }, [challenges]);
  
  const stats = useMemo(() => computeYearStats(challenges, selectedYear, basis), [challenges, selectedYear, basis]);
  const eligible2Count = useMemo(
    () => (basis === 'completion'
      ? challenges.filter(c => (c?.totalPhases || 3) >= 2 && ((c?.startDate?.slice(0,4) === selectedYear) || (c?.phases?.phase2?.completedAt?.slice(0,4) === selectedYear))).length
      : challenges.filter(c => c?.startDate?.slice(0,4) === selectedYear && (c?.totalPhases || 3) >= 2).length),
    [challenges, selectedYear, basis]
  );
  const eligible3Count = useMemo(
    () => (basis === 'completion'
      ? challenges.filter(c => (c?.totalPhases || 3) >= 3 && ((c?.startDate?.slice(0,4) === selectedYear) || (c?.phases?.phase3?.completedAt?.slice(0,4) === selectedYear))).length
      : challenges.filter(c => c?.startDate?.slice(0,4) === selectedYear && (c?.totalPhases || 3) >= 3).length),
    [challenges, selectedYear, basis]
  );
  const eligible1Count = useMemo(
    () => (basis === 'completion'
      ? challenges.filter(c => (c?.totalPhases || 3) >= 1 && ((c?.startDate?.slice(0,4) === selectedYear) || (c?.phases?.phase1?.completedAt?.slice(0,4) === selectedYear))).length
      : challenges.filter(c => c?.startDate?.slice(0,4) === selectedYear && (c?.totalPhases || 3) >= 1).length),
    [challenges, selectedYear, basis]
  );
  const liveCount = useMemo(() => {
    return challenges.filter(c => {
      const tp = c?.totalPhases || 3;
      const ph = c?.phases;
      if (!ph) return false;
      if (basis === 'completion') {
        if (tp === 1) return !!ph.phase1?.completed && ph.phase1?.completedAt?.slice(0,4) === selectedYear;
        if (tp === 2) return !!ph.phase1?.completed && !!ph.phase2?.completed && ph.phase2?.completedAt?.slice(0,4) === selectedYear;
        return !!ph.phase1?.completed && !!ph.phase2?.completed && !!ph.phase3?.completed && ph.phase3?.completedAt?.slice(0,4) === selectedYear;
      } else {
        if (c?.startDate?.slice(0,4) !== selectedYear) return false;
        if (tp === 1) return !!ph.phase1?.completed;
        if (tp === 2) return !!ph.phase1?.completed && !!ph.phase2?.completed;
        return !!ph.phase1?.completed && !!ph.phase2?.completed && !!ph.phase3?.completed;
      }
    }).length;
  }, [challenges, selectedYear, basis]);
  const roiIsPositive = stats.roi >= 0;
  
  const baseItems = [
    {
      title: 'Total Spent',
      value: `$${stats.totalSpent.toLocaleString(undefined, { maximumFractionDigits: 2 })}`,
      icon: <Wallet className="w-8 h-8 text-red-300 drop-shadow-neon-red" />,
      glow: 'red',
      textColor: 'text-red-300',
    },
    {
      title: 'Total Payouts',
      value: `$${stats.totalPayouts.toLocaleString(undefined, { maximumFractionDigits: 2 })}`,
      icon: <DollarSign className="w-8 h-8 text-green-300 drop-shadow-neon-green" />,
      glow: 'green',
      textColor: 'text-green-300',
    },
    {
      title: 'ROI',
      value: `${(stats.roi * 100).toFixed(1)}%`,
      icon: <Percent className={`w-8 h-8 ${roiIsPositive ? 'text-green-300 drop-shadow-neon-green' : 'text-red-300 drop-shadow-neon-red'}`} />,
      glow: roiIsPositive ? 'green' : 'red',
      textColor: roiIsPositive ? 'text-green-300' : 'text-red-300',
    },
    {
      title: 'Funded Pass Rate',
      value: `${(stats.liveAccountsRate * 100).toFixed(1)}%`,
      icon: <Trophy className="w-8 h-8 text-pink-300 drop-shadow-neon-pink" />,
      glow: 'pink',
      textColor: 'text-pink-300',
    },
    {
      title: 'Phase 1 Pass Rate',
      value: `${(stats.phase1PassRate * 100).toFixed(1)}%`,
      icon: <Trophy className="w-8 h-8 text-cyan-300 drop-shadow-neon-cyan" />,
      glow: 'cyan',
      textColor: 'text-cyan-300',
    },
    {
      title: 'Cost Per Funded Account',
      value: stats.costPerLiveAccount > 0 ? `$${stats.costPerLiveAccount.toLocaleString(undefined, { maximumFractionDigits: 0 })}` : 'No funded accounts',
      icon: <Calculator className="w-8 h-8 text-orange-300 drop-shadow-neon-orange" />,
      glow: 'orange',
      textColor: 'text-orange-300',
    },
    {
      title: 'Avg Time to Funded',
      value: stats.averageTimeToLive > 0 ? `${Math.round(stats.averageTimeToLive)} days` : 'Complete phases first',
      icon: <Clock className="w-8 h-8 text-amber-300 drop-shadow-neon-amber" />,
      glow: 'amber',
      textColor: 'text-amber-300',
    },
  ] as {
    title: string;
    value: string;
    icon: React.ReactNode;
    glow: 'red' | 'green' | 'pink' | 'cyan' | 'lime' | 'orange' | 'purple' | 'amber';
    textColor: string;
  }[];
  const statItems = [...baseItems];
  if (eligible2Count > 0) {
    statItems.splice(3, 0, {
      title: 'Phase 2 Pass Rate',
      value: `${(stats.phase2PassRate * 100).toFixed(1)}%`,
      icon: <Trophy className="w-8 h-8 text-lime-300 drop-shadow-neon-lime" />,
      glow: 'lime',
      textColor: 'text-lime-300',
    });
  }
  if (eligible3Count > 0 && typeof stats.phase3PassRate === 'number') {
    statItems.splice(4, 0, {
      title: 'Phase 3 Pass Rate',
      value: `${(stats.phase3PassRate * 100).toFixed(1)}%`,
      icon: <Trophy className="w-8 h-8 text-green-300 drop-shadow-neon-green" />,
      glow: 'green',
      textColor: 'text-green-300',
    });
  }
  statItems.push({
    title: 'Funded Accounts',
    value: `${liveCount} / ${eligible1Count}`,
    icon: <Trophy className="w-8 h-8 text-pink-300 drop-shadow-neon-pink" />,
    glow: 'pink',
    textColor: 'text-pink-300',
  });

  return (
    <div>
      <div className="mb-4 flex flex-col items-stretch gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-end">
        <label className="text-sm font-medium text-white/80 sm:mr-1">Year</label>
        <select
          value={selectedYear}
          onChange={(e) => onChangeYear(e.target.value)}
          className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-white focus:border-cyan-400/50 focus:outline-none focus:ring-2 focus:ring-cyan-500/30 sm:w-auto"
        >
          {availableYears.map(year => (
            <option key={year} value={year} className="bg-gray-800">
              {year}
            </option>
          ))}
        </select>
        <label className="text-sm font-medium text-white/80 sm:ml-3 sm:mr-1">Pass Basis</label>
        <select
          value={basis}
          onChange={(e) => setBasis(e.target.value as PassBasis)}
          className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-white focus:border-cyan-400/50 focus:outline-none focus:ring-2 focus:ring-cyan-500/30 sm:w-auto"
          title="Choose whether yearly pass rates use Start Year or Completion Year"
        >
          <option value="start" className="bg-gray-800">Start Year</option>
          <option value="completion" className="bg-gray-800">Completion Year</option>
        </select>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-3 gap-6">
        {statItems.map((s, idx) => (
          <NeonCard key={idx} glow={s.glow} className="p-6 select-none caret-transparent">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs uppercase tracking-wider text-white/60">{s.title}</div>
                <div className={`mt-1 text-3xl font-bold ${s.textColor || 'text-white'} drop-shadow-neon whitespace-nowrap`}>{s.value}</div>
              </div>
              <div className="flex items-center justify-center w-12 h-12 rounded-lg bg-white/5 border border-white/10 overflow-hidden">
                {s.icon}
              </div>
            </div>
          </NeonCard>
        ))}
      </div>
    </div>
  );
};
