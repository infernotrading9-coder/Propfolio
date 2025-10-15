import React, { useMemo } from 'react';
import { NeonCard } from './NeonCard';
import { StatsSummary, Challenge } from '../types';
import { Trophy, DollarSign, Percent, Wallet, Calculator, Clock } from 'lucide-react';

function computeStats(challenges: Challenge[]): StatsSummary {
  // Filter out invalid challenges first
  const validChallenges = challenges.filter(challenge => challenge);
  
  const spent = validChallenges.reduce((s, c) => s + (c?.cost ?? 0), 0);
  const payouts = validChallenges.reduce((s, c) => {
    // Handle both old (number) and new (array) payout structures
    if (Array.isArray(c?.payouts)) {
      return s + c.payouts.reduce((sum, p) => sum + (p?.amount ?? 0), 0);
    }
    return s + (c?.payouts ?? 0);
  }, 0);
  const roi = spent > 0 ? (payouts - spent) / spent : 0;

  const total = validChallenges.length || 1;
  // Live accounts = challenges that completed all phases (reached live trading)
  const liveAccounts = validChallenges.filter(c => {
    // Check if all phases for this challenge are completed
    if (!c?.phases) return false;
    const totalPhases = c.totalPhases || 3;
    if (totalPhases === 1) return c.phases?.phase1?.completed;
    if (totalPhases === 2) return c.phases?.phase1?.completed && c.phases?.phase2?.completed;
    return c.phases?.phase1?.completed && c.phases?.phase2?.completed && c.phases?.phase3?.completed;
  }).length;
  
  const phase1Pass = validChallenges.filter(c => c?.phases?.phase1?.completed).length / total;
  const phase2Pass = validChallenges.filter(c => c?.phases?.phase2?.completed).length / total;
  
  // Calculate cost per live account (efficiency metric)
  const costPerLiveAccount = liveAccounts > 0 ? spent / liveAccounts : 0;
  
  // Calculate average time to live account (from start to completion of all phases)
  const liveAccountChallenges = validChallenges.filter(c => {
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
    
    // Get the final completion date based on total phases
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

  const firstChallengeMonth = validChallenges.length > 0 ? validChallenges.reduce((min, c) => {
    if (!c?.startDate || !min?.startDate) return min;
    return (c.startDate < min.startDate ? c : min);
  }, validChallenges[0])?.startDate?.slice(0,7) : undefined;

  // Calculate account size performance
  const accountSizeGroups = {
    '10K': validChallenges.filter(c => c?.accountSize && c.accountSize <= 10000),
    '25K': validChallenges.filter(c => c?.accountSize && c.accountSize > 10000 && c.accountSize <= 25000),
    '50K': validChallenges.filter(c => c?.accountSize && c.accountSize > 25000 && c.accountSize <= 50000),
    '100K': validChallenges.filter(c => c?.accountSize && c.accountSize > 50000 && c.accountSize <= 100000),
    '200K+': validChallenges.filter(c => c?.accountSize && c.accountSize > 100000)
  };
  
  const accountSizePerformance: Record<string, { roi: number; successRate: number; count: number }> = {};
  
  Object.entries(accountSizeGroups).forEach(([size, sizeChall]) => {
    if (sizeChall.length > 0) {
      const sizeSpent = sizeChall.reduce((s, c) => s + (c?.cost ?? 0), 0);
      const sizePayouts = sizeChall.reduce((s, c) => {
        if (Array.isArray(c?.payouts)) {
          return s + c.payouts.reduce((sum, p) => sum + (p?.amount ?? 0), 0);
        }
        return s + (c?.payouts ?? 0);
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
    liveAccountsRate: liveAccounts / total,
    phase1PassRate: phase1Pass,
    phase2PassRate: phase2Pass,
    costPerLiveAccount,
    averageTimeToLive,
    firstChallengeMonth,
    
    // New metrics
    longestWinStreak: 0,
    longestLoseStreak: 0,
    currentStreak: { type: 'none' as const, count: 0 },
    accountSizePerformance,
    firmPerformance: {},
  };
}

export const DashboardStats: React.FC<{ challenges: Challenge[] }> = ({ challenges }) => {
  const stats = useMemo(() => computeStats(challenges), [challenges]);
  const roiIsPositive = stats.roi >= 0;
  
  const statItems = [
    {
      title: 'Total Spent',
      value: `$${stats.totalSpent.toLocaleString(undefined, { maximumFractionDigits: 2 })}`,
      icon: <Wallet className="w-6 h-6 text-red-300 drop-shadow-neon-red" />,
      glow: 'red',
      textColor: 'text-red-300',
    },
    {
      title: 'Total Payouts',
      value: `$${stats.totalPayouts.toLocaleString(undefined, { maximumFractionDigits: 2 })}`,
      icon: <DollarSign className="w-6 h-6 text-green-300 drop-shadow-neon-green" />,
      glow: 'green',
      textColor: 'text-green-300',
    },
    {
      title: 'ROI',
      value: `${(stats.roi * 100).toFixed(1)}%`,
      icon: <Percent className={`w-6 h-6 ${roiIsPositive ? 'text-green-300 drop-shadow-neon-green' : 'text-red-300 drop-shadow-neon-red'}`} />,
      glow: roiIsPositive ? 'green' : 'red',
      textColor: roiIsPositive ? 'text-green-300' : 'text-red-300',
    },
    {
      title: 'Live Account Rate',
      value: `${(stats.liveAccountsRate * 100).toFixed(1)}%`,
      icon: <Trophy className="w-6 h-6 text-pink-300 drop-shadow-neon-pink" />,
      glow: 'pink',
      textColor: 'text-pink-300',
    },
    {
      title: 'Phase 1 Pass Rate',
      value: `${(stats.phase1PassRate * 100).toFixed(1)}%`,
      icon: <Trophy className="w-6 h-6 text-cyan-300 drop-shadow-neon-cyan" />,
      glow: 'cyan',
      textColor: 'text-cyan-300',
    },
    {
      title: 'Phase 2 Pass Rate',
      value: `${(stats.phase2PassRate * 100).toFixed(1)}%`,
      icon: <Trophy className="w-6 h-6 text-lime-300 drop-shadow-neon-lime" />,
      glow: 'lime',
      textColor: 'text-lime-300',
    },
    {
      title: 'Cost Per Live Account',
      value: stats.costPerLiveAccount > 0 ? `$${stats.costPerLiveAccount.toLocaleString(undefined, { maximumFractionDigits: 0 })}` : 'No live accounts',
      icon: <Calculator className="w-6 h-6 text-orange-300 drop-shadow-neon-orange" />,
      glow: 'orange',
      textColor: 'text-orange-300',
    },
    {
      title: 'Avg Time to Live',
      value: stats.averageTimeToLive > 0 ? `${Math.round(stats.averageTimeToLive)} days` : 'Complete phases first',
      icon: <Clock className="w-6 h-6 text-amber-300 drop-shadow-neon-amber" />,
      glow: 'amber',
      textColor: 'text-amber-300',
    },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-3 gap-4">
      {statItems.map((s, idx) => (
        <NeonCard key={idx} glow={s.glow} className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs uppercase tracking-wider text-white/60">{s.title}</div>
              <div className={`mt-1 text-2xl font-bold ${s.textColor || 'text-white'} drop-shadow-neon`}>{s.value}</div>
            </div>
            <div className="p-2 rounded-lg bg-white/5 border border-white/10">{s.icon}</div>
          </div>
        </NeonCard>
      ))}
    </div>
  );
};