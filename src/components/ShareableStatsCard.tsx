import React, { useRef, useMemo } from 'react';
import { Challenge, StatsSummary } from '../types';
import { TrendingUp, TrendingDown, Download, Zap } from 'lucide-react';
import * as htmlToImage from 'html-to-image';

// Import the stats computation logic from DashboardStats
function computeStats(challenges: Challenge[]): StatsSummary {
  const spent = challenges.reduce((s, c) => s + (c.cost ?? 0), 0);
  const payouts = challenges.reduce((s, c) => {
    if (Array.isArray(c.payouts)) {
      return s + c.payouts.reduce((sum, p) => sum + p.amount, 0);
    }
    return s + (c.payouts ?? 0);
  }, 0);
  const roi = spent > 0 ? (payouts - spent) / spent : 0;

  const eligible1 = challenges.filter(c => (c.totalPhases || 3) >= 1);
  const eligible2 = challenges.filter(c => (c.totalPhases || 3) >= 2);
  const liveAccounts = eligible1.filter(c => {
    const totalPhases = c.totalPhases || 3;
    if (totalPhases === 1) return c.phases.phase1.completed;
    if (totalPhases === 2) return c.phases.phase1.completed && c.phases.phase2.completed;
    return c.phases.phase1.completed && c.phases.phase2.completed && c.phases.phase3.completed;
  }).length;
  
  const phase1Pass = eligible1.length > 0 ? (eligible1.filter(c => c.phases.phase1.completed).length / eligible1.length) : 0;
  const phase2Pass = eligible2.length > 0 ? (eligible2.filter(c => c.phases.phase2.completed).length / eligible2.length) : 0;
  const costPerLiveAccount = liveAccounts > 0 ? spent / liveAccounts : 0;
  
  const liveAccountChallenges = challenges.filter(c => {
    const totalPhases = c.totalPhases || 3;
    if (totalPhases === 1) return c.phases.phase1.completed && c.phases.phase1.completedAt;
    if (totalPhases === 2) return c.phases.phase1.completed && c.phases.phase2.completed && c.phases.phase2.completedAt;
    return c.phases.phase1.completed && c.phases.phase2.completed && c.phases.phase3.completed && c.phases.phase3.completedAt;
  });
  
  let totalDaysToLive = 0;
  liveAccountChallenges.forEach(challenge => {
    const startDate = new Date(challenge.startDate);
    const totalPhases = challenge.totalPhases || 3;
    
    let finalCompletionDate;
    if (totalPhases === 1 && challenge.phases.phase1.completedAt) {
      finalCompletionDate = new Date(challenge.phases.phase1.completedAt);
    } else if (totalPhases === 2 && challenge.phases.phase2.completedAt) {
      finalCompletionDate = new Date(challenge.phases.phase2.completedAt);
    } else if (totalPhases === 3 && challenge.phases.phase3.completedAt) {
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
  const firstChallengeMonth = challenges.length ? challenges.reduce((min, c) => (c.startDate < min.startDate ? c : min), challenges[0]).startDate.slice(0,7) : undefined;

  return {
    totalSpent: spent,
    totalPayouts: payouts,
    roi,
    liveAccountsRate: eligible1.length > 0 ? (liveAccounts / eligible1.length) : 0,
    phase1PassRate: phase1Pass,
    phase2PassRate: phase2Pass,
    costPerLiveAccount,
    averageTimeToLive,
    firstChallengeMonth,
    
    // New metrics (empty defaults for compatibility)
    longestWinStreak: 0,
    longestLoseStreak: 0,
    currentStreak: { type: 'none' as const, count: 0 },
    accountSizePerformance: {},
    firmPerformance: {},
  };
}

interface ShareableStatsCardProps {
  challenges: Challenge[];
  timeframe: 'month' | 'week' | 'year' | 'all-time';
  selectedMonth?: string; // YYYY-MM format
  selectedWeek?: string; // YYYY-WXX format
  selectedYear?: string; // YYYY format
  selectedStats?: ShareStatKey[];
}

export type ShareStatKey = 'capital' | 'payouts' | 'live' | 'phase1' | 'phase2' | 'phase3' | 'avgTime';

// Smart number formatting for trading stats
const formatMoney = (amount: number): string => {
  const absAmount = Math.abs(amount);
  
  if (absAmount >= 100000) {
    // 100K+ -> show as 150K, 1.2M, etc.
    if (absAmount >= 1000000) {
      return `${(amount / 1000000).toFixed(1)}M`;
    } else {
      return `${Math.round(amount / 1000)}K`;
    }
  } else {
    // Under 100K -> show whole numbers: 1,234 or 95,000
    return Math.round(amount).toLocaleString();
  }
};

const getWeekOfYear = (date: Date): number => {
  const startOfYear = new Date(date.getFullYear(), 0, 1);
  const pastDaysOfYear = (date.getTime() - startOfYear.getTime()) / 86400000;
  return Math.ceil((pastDaysOfYear + startOfYear.getDay() + 1) / 7);
};

export const ShareableStatsCard: React.FC<ShareableStatsCardProps> = ({ 
  challenges, 
  timeframe, 
  selectedMonth,
  selectedWeek,
  selectedYear,
  selectedStats = ['capital', 'payouts']
}) => {
  const cardRef = useRef<HTMLDivElement>(null);
  
  // Calculate stats based on timeframe
  const stats = useMemo(() => {
    // Helper function to calculate monthly costs and payouts
    const getMonthlyData = (month: string) => {
      let monthlyCosts = 0;
      let monthlyPayouts = 0;
      const challengesInPeriod: Challenge[] = [];
      
      challenges.forEach((challenge) => {
        // Track challenges that started in this month for avg time to live
        if (challenge.startDate.slice(0, 7) === month) {
          monthlyCosts += challenge.cost ?? 0;
          challengesInPeriod.push(challenge);
        }
        
        // Monthly payouts: sum of payouts received in this month across ALL challenges
        if (Array.isArray(challenge.payouts)) {
          challenge.payouts.forEach((payout) => {
            if (payout.date.slice(0, 7) === month) {
              monthlyPayouts += payout.amount;
            }
          });
        }
      });
      
      return { costs: monthlyCosts, payouts: monthlyPayouts, challengesInPeriod };
    };
    
    // Helper function to calculate weekly costs and payouts
    const getWeeklyData = (week: string) => {
      let weeklyCosts = 0;
      let weeklyPayouts = 0;
      const challengesInPeriod: Challenge[] = [];
      
      challenges.forEach((challenge) => {
        // Get week from start date (YYYY-WXX format)
        const startDate = new Date(challenge.startDate);
        const year = startDate.getFullYear();
        const weekOfYear = getWeekOfYear(startDate);
        const challengeWeek = `${year}-W${String(weekOfYear).padStart(2, '0')}`;
        
        if (challengeWeek === week) {
          weeklyCosts += challenge.cost ?? 0;
          challengesInPeriod.push(challenge);
        }
        
        // Weekly payouts: sum of payouts received in this week across ALL challenges
        if (Array.isArray(challenge.payouts)) {
          challenge.payouts.forEach((payout) => {
            const payoutDate = new Date(payout.date);
            const payoutYear = payoutDate.getFullYear();
            const payoutWeek = getWeekOfYear(payoutDate);
            const payoutWeekStr = `${payoutYear}-W${String(payoutWeek).padStart(2, '0')}`;
            
            if (payoutWeekStr === week) {
              weeklyPayouts += payout.amount;
            }
          });
        }
      });
      
      return { costs: weeklyCosts, payouts: weeklyPayouts, challengesInPeriod };
    };
    
    // Helper function to calculate yearly costs and payouts
    const getYearlyData = (year: string) => {
      let yearlyCosts = 0;
      let yearlyPayouts = 0;
      const challengesInPeriod: Challenge[] = [];
      
      challenges.forEach((challenge) => {
        // Track challenges that started in this year
        if (challenge.startDate.slice(0, 4) === year) {
          yearlyCosts += challenge.cost ?? 0;
          challengesInPeriod.push(challenge);
        }
        
        // Yearly payouts: sum of payouts received in this year across ALL challenges
        if (Array.isArray(challenge.payouts)) {
          challenge.payouts.forEach((payout) => {
            if (payout.date.slice(0, 4) === year) {
              yearlyPayouts += payout.amount;
            }
          });
        }
      });
      
      return { costs: yearlyCosts, payouts: yearlyPayouts, challengesInPeriod };
    };
    
    // Helper function to get week number
    const getWeekOfYear = (date: Date): number => {
      const startOfYear = new Date(date.getFullYear(), 0, 1);
      const pastDaysOfYear = (date.getTime() - startOfYear.getTime()) / 86400000;
      return Math.ceil((pastDaysOfYear + startOfYear.getDay() + 1) / 7);
    };
    
    // Helper function to calculate average time to live for challenges in a specific period
    const calculateAvgTimeToLive = (challengesInPeriod: Challenge[]): number => {
      const completedChallenges = challengesInPeriod.filter(c => {
        const totalPhases = c.totalPhases || 3;
        if (totalPhases === 1) return c.phases.phase1.completed && c.phases.phase1.completedAt;
        if (totalPhases === 2) return c.phases.phase1.completed && c.phases.phase2.completed && c.phases.phase2.completedAt;
        return c.phases.phase1.completed && c.phases.phase2.completed && c.phases.phase3.completed && c.phases.phase3.completedAt;
      });
      
      if (completedChallenges.length === 0) return 0;
      
      let totalDays = 0;
      completedChallenges.forEach(challenge => {
        const startDate = new Date(challenge.startDate);
        const totalPhases = challenge.totalPhases || 3;
        
        let finalCompletionDate;
        if (totalPhases === 1 && challenge.phases.phase1.completedAt) {
          finalCompletionDate = new Date(challenge.phases.phase1.completedAt);
        } else if (totalPhases === 2 && challenge.phases.phase2.completedAt) {
          finalCompletionDate = new Date(challenge.phases.phase2.completedAt);
        } else if (totalPhases === 3 && challenge.phases.phase3.completedAt) {
          finalCompletionDate = new Date(challenge.phases.phase3.completedAt);
        }
        
        if (finalCompletionDate) {
          const daysDiff = Math.floor((finalCompletionDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
          if (daysDiff >= 0) {
            totalDays += daysDiff;
          }
        }
      });
      
      return totalDays / completedChallenges.length;
    };
    
    if (timeframe === 'all-time') {
      // For all-time, use the standard DashboardStats computation
      return computeStats(challenges);
    } else if (timeframe === 'month' && selectedMonth) {
      // For monthly, use the same logic as your dashboard monthly cards
      const monthlyData = getMonthlyData(selectedMonth);
      const roi = monthlyData.costs > 0 ? (monthlyData.payouts - monthlyData.costs) / monthlyData.costs : 0;
      const avgTimeToLive = calculateAvgTimeToLive(monthlyData.challengesInPeriod);
      
      // For monthly view, use timeframe-filtered eligible denominators (by start month)
      const eligible1m = challenges.filter(c => c.startDate.slice(0,7) === selectedMonth && (c.totalPhases || 3) >= 1);
      const eligible2m = challenges.filter(c => c.startDate.slice(0,7) === selectedMonth && (c.totalPhases || 3) >= 2);
      const eligible3m = challenges.filter(c => c.startDate.slice(0,7) === selectedMonth && (c.totalPhases || 3) >= 3);
      const liveAccountsm = eligible1m.filter(c => {
        const totalPhases = c.totalPhases || 3;
        if (totalPhases === 1) return c.phases.phase1.completed;
        if (totalPhases === 2) return c.phases.phase1.completed && c.phases.phase2.completed;
        return c.phases.phase1.completed && c.phases.phase2.completed && c.phases.phase3.completed;
      }).length;
      const phase1Passm = eligible1m.length > 0 ? (eligible1m.filter(c => c.phases.phase1.completed).length / eligible1m.length) : 0;
      const phase2Passm = eligible2m.length > 0 ? (eligible2m.filter(c => c.phases.phase2.completed).length / eligible2m.length) : 0;
      const phase3Passm = eligible3m.length > 0 ? (eligible3m.filter(c => c.phases.phase3.completed).length / eligible3m.length) : 0;
      const costPerLiveAccount = liveAccountsm > 0 ? monthlyData.costs / liveAccountsm : 0;
      
      return {
        totalSpent: monthlyData.costs,
        totalPayouts: monthlyData.payouts,
        roi,
        liveAccountsRate: eligible1m.length > 0 ? (liveAccountsm / eligible1m.length) : 0,
        phase1PassRate: phase1Passm,
        phase2PassRate: phase2Passm,
        phase3PassRate: phase3Passm,
        costPerLiveAccount,
        averageTimeToLive: avgTimeToLive,
        firstChallengeMonth: selectedMonth,
        
        // New metrics (empty defaults for compatibility)
        longestWinStreak: 0,
        longestLoseStreak: 0,
        currentStreak: { type: 'none' as const, count: 0 },
        accountSizePerformance: {},
        firmPerformance: {},
      };
    } else if (timeframe === 'week' && selectedWeek) {
      // For weekly view
      const weeklyData = getWeeklyData(selectedWeek);
      const roi = weeklyData.costs > 0 ? (weeklyData.payouts - weeklyData.costs) / weeklyData.costs : 0;
      const avgTimeToLive = calculateAvgTimeToLive(weeklyData.challengesInPeriod);
      
      // For weekly view, use timeframe-filtered eligible denominators (by start week)
      const eligible1w = challenges.filter(c => {
        const d = new Date(c.startDate);
        const y = d.getFullYear();
        const w = getWeekOfYear(d);
        const cw = `${y}-W${String(w).padStart(2, '0')}`;
        return cw === selectedWeek && (c.totalPhases || 3) >= 1;
      });
      const eligible2w = challenges.filter(c => {
        const d = new Date(c.startDate);
        const y = d.getFullYear();
        const w = getWeekOfYear(d);
        const cw = `${y}-W${String(w).padStart(2, '0')}`;
        return cw === selectedWeek && (c.totalPhases || 3) >= 2;
      });
      const eligible3w = challenges.filter(c => {
        const d = new Date(c.startDate);
        const y = d.getFullYear();
        const w = getWeekOfYear(d);
        const cw = `${y}-W${String(w).padStart(2, '0')}`;
        return cw === selectedWeek && (c.totalPhases || 3) >= 3;
      });
      const liveAccountsw = eligible1w.filter(c => {
        const totalPhases = c.totalPhases || 3;
        if (totalPhases === 1) return c.phases.phase1.completed;
        if (totalPhases === 2) return c.phases.phase1.completed && c.phases.phase2.completed;
        return c.phases.phase1.completed && c.phases.phase2.completed && c.phases.phase3.completed;
      }).length;
      const phase1Passw = eligible1w.length > 0 ? (eligible1w.filter(c => c.phases.phase1.completed).length / eligible1w.length) : 0;
      const phase2Passw = eligible2w.length > 0 ? (eligible2w.filter(c => c.phases.phase2.completed).length / eligible2w.length) : 0;
      const phase3Passw = eligible3w.length > 0 ? (eligible3w.filter(c => c.phases.phase3.completed).length / eligible3w.length) : 0;
      const costPerLiveAccount = liveAccountsw > 0 ? weeklyData.costs / liveAccountsw : 0;
      
      return {
        totalSpent: weeklyData.costs,
        totalPayouts: weeklyData.payouts,
        roi,
        liveAccountsRate: eligible1w.length > 0 ? (liveAccountsw / eligible1w.length) : 0,
        phase1PassRate: phase1Passw,
        phase2PassRate: phase2Passw,
        phase3PassRate: phase3Passw,
        costPerLiveAccount,
        averageTimeToLive: avgTimeToLive,
        firstChallengeMonth: selectedWeek,
        
        // New metrics (empty defaults for compatibility)
        longestWinStreak: 0,
        longestLoseStreak: 0,
        currentStreak: { type: 'none' as const, count: 0 },
        accountSizePerformance: {},
        firmPerformance: {},
      };
    } else if (timeframe === 'year' && selectedYear) {
      // For yearly view
      const yearlyData = getYearlyData(selectedYear);
      const roi = yearlyData.costs > 0 ? (yearlyData.payouts - yearlyData.costs) / yearlyData.costs : 0;
      const avgTimeToLive = calculateAvgTimeToLive(yearlyData.challengesInPeriod);
      
      // For yearly view, use eligible-based denominators scoped to this year
      const baseYear = yearlyData.challengesInPeriod;
      const eligible1y = baseYear.filter(c => (c.totalPhases || 3) >= 1);
      const eligible2y = baseYear.filter(c => (c.totalPhases || 3) >= 2);
      const eligible3y = baseYear.filter(c => (c.totalPhases || 3) >= 3);
      const liveAccountsy = eligible1y.filter(c => {
        const totalPhases = c.totalPhases || 3;
        if (totalPhases === 1) return c.phases.phase1.completed;
        if (totalPhases === 2) return c.phases.phase1.completed && c.phases.phase2.completed;
        return c.phases.phase1.completed && c.phases.phase2.completed && c.phases.phase3.completed;
      }).length;
      const phase1Passy = eligible1y.length > 0 ? (eligible1y.filter(c => c.phases.phase1.completed).length / eligible1y.length) : 0;
      const phase2Passy = eligible2y.length > 0 ? (eligible2y.filter(c => c.phases.phase2.completed).length / eligible2y.length) : 0;
      const phase3Passy = eligible3y.length > 0 ? (eligible3y.filter(c => c.phases.phase3.completed).length / eligible3y.length) : 0;
      const costPerLiveAccount = liveAccountsy > 0 ? yearlyData.costs / liveAccountsy : 0;
      
      return {
        totalSpent: yearlyData.costs,
        totalPayouts: yearlyData.payouts,
        roi,
        liveAccountsRate: eligible1y.length > 0 ? (liveAccountsy / eligible1y.length) : 0,
        phase1PassRate: phase1Passy,
        phase2PassRate: phase2Passy,
        phase3PassRate: phase3Passy,
        costPerLiveAccount,
        averageTimeToLive: avgTimeToLive,
        firstChallengeMonth: selectedYear,
        
        // New metrics (empty defaults for compatibility)
        longestWinStreak: 0,
        longestLoseStreak: 0,
        currentStreak: { type: 'none' as const, count: 0 },
        accountSizePerformance: {},
        firmPerformance: {},
      };
    }
    
    // Fallback to all-time
    return computeStats(challenges);
  }, [challenges, timeframe, selectedMonth, selectedWeek, selectedYear]);

  const isPositive = stats.roi >= 0;
  const timeframeBaseChallenges = useMemo(() => {
    if (timeframe === 'month' && selectedMonth) {
      return challenges.filter(c => c.startDate.slice(0, 7) === selectedMonth);
    }
    if (timeframe === 'week' && selectedWeek) {
      return challenges.filter(c => {
        const d = new Date(c.startDate);
        const y = d.getFullYear();
        const w = getWeekOfYear(d);
        return `${y}-W${String(w).padStart(2, '0')}` === selectedWeek;
      });
    }
    if (timeframe === 'year' && selectedYear) {
      return challenges.filter(c => c.startDate.slice(0, 4) === selectedYear);
    }
    return challenges;
  }, [challenges, timeframe, selectedMonth, selectedWeek, selectedYear]);
  const eligible2Count = useMemo(
    () => timeframeBaseChallenges.filter(c => (c.totalPhases || 3) >= 2).length,
    [timeframeBaseChallenges]
  );
  const eligible3Count = useMemo(
    () => timeframeBaseChallenges.filter(c => (c.totalPhases || 3) >= 3).length,
    [timeframeBaseChallenges]
  );
  const profit = stats.totalPayouts - stats.totalSpent;
  const glassTileClass = "group relative perspective-1000";
  const glassTileStyle: React.CSSProperties = {
    background: `linear-gradient(135deg, 
      rgba(255, 255, 255, 0.1) 0%, 
      rgba(255, 255, 255, 0.05) 50%, 
      rgba(255, 255, 255, 0.02) 100%
    )`,
    border: `1px solid rgba(255, 255, 255, 0.2)`,
    boxShadow: `
      0 8px 32px rgba(0, 0, 0, 0.3),
      0 0 0 1px rgba(255, 255, 255, 0.05),
      inset 0 1px 0 rgba(255, 255, 255, 0.1),
      inset 0 -1px 0 rgba(0, 0, 0, 0.1)
    `
  };
  const getMetricValueClass = (value: string, compactValue: boolean) => {
    if (!compactValue) return 'text-3xl sm:text-4xl';

    if (value.length >= 12) {
      return 'text-[1.4rem] sm:text-[1.75rem] tracking-[-0.08em]';
    }
    if (value.length >= 10) {
      return 'text-[1.6rem] sm:text-[1.95rem] tracking-[-0.06em]';
    }
    if (value.length >= 8) {
      return 'text-[1.85rem] sm:text-[2.15rem] tracking-[-0.05em]';
    }

    return 'text-[2rem] sm:text-[2.35rem] tracking-tight';
  };
  const renderMetricTile = (
    key: ShareStatKey,
    title: string,
    value: string,
    accentSoft: string,
    gradient: string,
    textClass: string,
    orbShadow: string,
    compactValue = false
  ) => (
    <div key={key} className={glassTileClass}>
      <div className="relative transform-gpu transition-all duration-700">
        <div className="relative overflow-hidden rounded-3xl backdrop-blur-xl transition-all duration-500" style={glassTileStyle}>
          <div
            className="absolute inset-0 opacity-30"
            style={{
              background: `radial-gradient(ellipse at center, ${accentSoft} 0%, transparent 70%)`,
              filter: 'blur(18px)'
            }}
          />
          <div className="absolute inset-0 pointer-events-none overflow-hidden">
            {[...Array(4)].map((_, i) => (
              <div
                key={i}
                className="absolute w-1 h-1 rounded-full opacity-40"
                style={{
                  left: `${15 + i * 20}%`,
                  top: `${20 + (i % 2) * 35}%`,
                  background: accentSoft.replace('0.25', '0.8'),
                  boxShadow: `0 0 10px ${accentSoft.replace('0.25', '0.5')}`
                }}
              />
            ))}
          </div>

          <div className="relative p-5 sm:p-6 z-10">
            <div className="relative mb-6">
              <div
                className="absolute -inset-2 rounded-2xl opacity-30"
                style={{
                  background: `radial-gradient(ellipse at center, ${accentSoft} 0%, transparent 70%)`,
                  filter: 'blur(20px)'
                }}
              />
              <div className="relative flex items-center justify-between">
                <div className="flex-1">
                  <h3
                    className="text-xl font-black text-transparent bg-clip-text mb-1"
                    style={{
                      backgroundImage: gradient,
                      backgroundSize: '200% 200%',
                      filter: 'drop-shadow(0 0 8px rgba(255,255,255,0.25))'
                    }}
                  >
                    {title}
                  </h3>
                  <div
                    className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium backdrop-blur-md"
                    style={{
                      background: 'rgba(255, 255, 255, 0.1)',
                      border: '1px solid rgba(255, 255, 255, 0.2)'
                    }}
                  >
                    <span className="text-white/70">
                      {timeframe === 'month' ? 'Monthly' : timeframe === 'week' ? 'Weekly' : timeframe === 'year' ? 'Yearly' : 'All-Time'}
                    </span>
                  </div>
                </div>

                <div className="relative">
                  <div className="w-14 h-14 relative">
                    <div
                      className="absolute inset-0 rounded-full blur-md"
                      style={{ background: `radial-gradient(circle, ${accentSoft} 0%, transparent 70%)` }}
                    />
                    <div
                      className="relative w-full h-full rounded-full flex items-center justify-center backdrop-blur-lg"
                      style={{
                        background: `linear-gradient(135deg, 
                          rgba(255, 255, 255, 0.2) 0%,
                          rgba(255, 255, 255, 0.1) 50%,
                          rgba(255, 255, 255, 0.05) 100%
                        )`,
                        border: '2px solid rgba(255, 255, 255, 0.3)',
                        boxShadow: `0 8px 32px ${accentSoft}, inset 0 1px 0 rgba(255, 255, 255, 0.3)`
                      }}
                    >
                      <div className="w-3 h-3 rounded-full" style={{ background: accentSoft.replace('0.25', '1'), boxShadow: orbShadow }} />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="relative text-center py-6 px-2">
              <div
                className="absolute inset-0 rounded-2xl opacity-20"
                style={{
                  background: `radial-gradient(ellipse at center, ${accentSoft} 0%, transparent 60%)`,
                  filter: 'blur(15px)'
                }}
              />
              <div className="relative">
                <p className="text-sm text-white/60 font-medium uppercase tracking-[0.2em] mb-2">Metric</p>
                <div className="relative min-w-0 overflow-visible px-1">
                  <h2
                    className={`max-w-full font-black leading-[0.95] whitespace-nowrap ${getMetricValueClass(value, compactValue)} ${textClass}`}
                    style={{ filter: `drop-shadow(0 0 18px ${accentSoft.replace('0.25', '0.8')})` }}
                  >
                    {value}
                  </h2>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
  const statDefinitions = useMemo(() => {
    const defs: Record<ShareStatKey, JSX.Element> = {
      live: renderMetricTile('live', 'Funded Pass Rate', `${(stats.liveAccountsRate * 100).toFixed(0)}%`, 'rgba(34, 211, 238, 0.25)', 'linear-gradient(45deg, #22d3ee, #67e8f9, #a5f3fc, #22d3ee)', stats.liveAccountsRate > 0.5 ? 'text-green-400' : stats.liveAccountsRate > 0.3 ? 'text-yellow-400' : 'text-red-400', stats.liveAccountsRate > 0.5 ? '0 0 10px rgba(34, 197, 94, 0.8)' : stats.liveAccountsRate > 0.3 ? '0 0 10px rgba(234, 179, 8, 0.8)' : '0 0 10px rgba(248, 113, 113, 0.8)'),
      phase1: renderMetricTile('phase1', 'Phase 1 Pass', `${(stats.phase1PassRate * 100).toFixed(0)}%`, 'rgba(34, 211, 238, 0.25)', 'linear-gradient(45deg, #22d3ee, #67e8f9, #a5f3fc, #22d3ee)', 'text-cyan-300', '0 0 10px rgba(34, 211, 238, 0.8)'),
      phase2: renderMetricTile('phase2', 'Phase 2 Pass', `${(stats.phase2PassRate * 100).toFixed(0)}%`, 'rgba(163, 230, 53, 0.25)', 'linear-gradient(45deg, #84cc16, #a3e635, #d9f99d, #84cc16)', 'text-lime-300', '0 0 10px rgba(163, 230, 53, 0.8)'),
      phase3: renderMetricTile('phase3', 'Phase 3 Pass', `${((stats.phase3PassRate ?? 0) * 100).toFixed(0)}%`, 'rgba(34, 197, 94, 0.25)', 'linear-gradient(45deg, #22c55e, #4ade80, #86efac, #22c55e)', 'text-green-300', '0 0 10px rgba(34, 197, 94, 0.8)'),
      capital: renderMetricTile('capital', 'Capital Invested', `$${formatMoney(stats.totalSpent)}`, 'rgba(248, 113, 113, 0.25)', 'linear-gradient(45deg, #ef4444, #f87171, #fca5a5, #ef4444)', 'text-red-400', '0 0 10px rgba(248, 113, 113, 0.8)', true),
      payouts: renderMetricTile('payouts', 'Total Payouts', `$${formatMoney(stats.totalPayouts)}`, 'rgba(34, 197, 94, 0.25)', 'linear-gradient(45deg, #10b981, #34d399, #6ee7b7, #10b981)', 'text-green-400', '0 0 10px rgba(34, 197, 94, 0.8)', true),
      avgTime: renderMetricTile('avgTime', 'Avg Time to Live', `${stats.averageTimeToLive > 0 ? `${Math.round(stats.averageTimeToLive)}d` : 'N/A'}`, 'rgba(168, 85, 247, 0.25)', 'linear-gradient(45deg, #a855f7, #c084fc, #e9d5ff, #a855f7)', 'text-purple-400', '0 0 10px rgba(168, 85, 247, 0.8)'),
    };
    return defs;
  }, [stats, timeframe]);
  const visibleStatKeys = useMemo(
    () => selectedStats.filter(key => {
      if (key === 'phase2') return eligible2Count > 0;
      if (key === 'phase3') return eligible3Count > 0 && typeof stats.phase3PassRate === 'number';
      return true;
    }),
    [selectedStats, eligible2Count, eligible3Count, stats.phase3PassRate]
  );
  // Format date manually to avoid timezone issues
  const formatDate = (() => {
    if (timeframe === 'month' && selectedMonth) {
      const [year, monthNum] = selectedMonth.split('-');
      const monthNames = [
        'January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December'
      ];
      return `${monthNames[parseInt(monthNum) - 1]} ${year}`;
    } else if (timeframe === 'week' && selectedWeek) {
      const [year, weekPart] = selectedWeek.split('-W');
      const weekNum = parseInt(weekPart);
      
      // Calculate the actual date range for this week
      const startOfYear = new Date(parseInt(year), 0, 1);
      const daysToAdd = (weekNum - 1) * 7;
      const weekStart = new Date(startOfYear.getTime() + daysToAdd * 24 * 60 * 60 * 1000);
      
      // Adjust to get Monday as start of week
      const dayOfWeek = weekStart.getDay();
      const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
      weekStart.setDate(weekStart.getDate() + mondayOffset);
      
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekStart.getDate() + 6);
      
      const formatOptions: Intl.DateTimeFormatOptions = { 
        month: 'short', 
        day: 'numeric' 
      };
      
      const startStr = weekStart.toLocaleDateString('en-US', formatOptions);
      const endStr = weekEnd.toLocaleDateString('en-US', formatOptions);
      
      return `${startStr} - ${endStr} ${year}`;
    } else if (timeframe === 'year' && selectedYear) {
      return `${selectedYear} PERFORMANCE`;
    }
    return '';
  })();

  const downloadImage = async () => {
    if (cardRef.current) {
      const node = cardRef.current;

      // Temporarily simplify problematic CSS and ensure full height capture
      const originalStyles = new Map<HTMLElement, string>();
      const allElements = node.querySelectorAll('*');

      // Also relax overflow on the root for capture to avoid clipping
      const rootOriginalOverflow = node.style.overflow;
      node.style.overflow = 'visible';

      allElements.forEach((el) => {
        if (el instanceof HTMLElement) {
          const computedStyle = window.getComputedStyle(el);
          originalStyles.set(el, el.style.cssText);
          if (computedStyle.backdropFilter && computedStyle.backdropFilter !== 'none') {
            el.style.backdropFilter = 'none';
            if (!el.style.backgroundColor) {
              el.style.backgroundColor = 'rgba(0, 0, 0, 0.4)';
            }
          }
        }
      });

      try {
        // Ensure fonts are loaded to avoid reflow during capture
        try { /* @ts-ignore */ await (document as any).fonts?.ready; } catch {}

        // Temporarily let the card grow to full content height
        const originalExplicitHeight = node.style.height;
        node.style.height = 'auto';

        // Force layout to compute scroll sizes
        // eslint-disable-next-line @typescript-eslint/no-unused-expressions
        node.offsetHeight;

        const width = Math.ceil(node.scrollWidth || node.getBoundingClientRect().width);
        const height = Math.ceil(node.scrollHeight || node.getBoundingClientRect().height);

        const dataUrl = await htmlToImage.toPng(node, {
          quality: 1.0,
          pixelRatio: 2,
          width,
          height,
          backgroundColor: '#0a0a0a',
          style: {
            // Neutralize potential transforms that could affect bounds
            transform: 'none',
            transformOrigin: 'top left',
            overflow: 'visible',
          },
          cacheBust: true
        });

        // Restore explicit height
        node.style.height = originalExplicitHeight;

        const link = document.createElement('a');
        const filename = timeframe === 'month' && selectedMonth 
          ? `trading-stats-${selectedMonth}.png`
          : timeframe === 'week' && selectedWeek
          ? `trading-stats-${selectedWeek}.png`
          : timeframe === 'year' && selectedYear
          ? `trading-stats-${selectedYear}.png`
          : 'trading-stats-all-time.png';

        link.download = filename;
        link.href = dataUrl;
        link.click();
      } catch (error) {
        console.error('Error generating image:', error);
      } finally {
        // Restore original styles
        node.style.overflow = rootOriginalOverflow;
        originalStyles.forEach((css, el) => { el.style.cssText = css; });
      }
    }
  };

  // Generate current timestamp
  const currentTime = new Date().toLocaleTimeString('en-US', { hour12: false });
  const currentDate = new Date().toLocaleDateString('en-US', { 
    weekday: 'short', 
    year: 'numeric', 
    month: 'short', 
    day: '2-digit' 
  });

  return (
    <div className="flex flex-col items-center space-y-6">
      {/* Dashboard-style glass card */}
      <div 
        ref={cardRef}
        data-card-ref="true"
        className="relative w-full max-w-[580px] min-h-[650px] overflow-hidden rounded-3xl backdrop-blur-xl border border-white/20"
        style={{
          background: `linear-gradient(135deg,
            rgba(255, 255, 255, 0.1) 0%,
            rgba(255, 255, 255, 0.05) 50%,
            rgba(255, 255, 255, 0.02) 100%
          ), linear-gradient(145deg, #0a0a0a 0%, #111827 55%, #0f172a 100%)`,
          boxShadow: `
            0 8px 32px rgba(0, 0, 0, 0.35),
            0 0 0 1px rgba(255, 255, 255, 0.05),
            inset 0 1px 0 rgba(255, 255, 255, 0.12),
            inset 0 -1px 0 rgba(0, 0, 0, 0.15)
          `
        }}
      >
        <div className="absolute inset-0 opacity-20" style={{
          background: 'conic-gradient(from 180deg at 50% 50%, rgba(34,211,238,0.15), rgba(168,85,247,0.1), rgba(16,185,129,0.12), rgba(34,211,238,0.15))'
        }} />
        
        {/* Content */}
        <div className="relative p-8 h-full flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full" style={{
              background: 'rgba(255, 255, 255, 0.08)',
              border: '1px solid rgba(255,255,255,0.14)'
            }}>
              <div className="w-2.5 h-2.5 rounded-full bg-green-400" style={{ boxShadow: '0 0 10px rgba(34, 197, 94, 0.7)' }} />
              <span className="text-white/80 text-xs font-semibold tracking-[0.18em]">DASHBOARD</span>
            </div>
            <div className="text-white/70 text-sm font-mono">
              {currentTime}
            </div>
          </div>
          

          {/* Main Title */}
          <div className="relative mb-8">
            <div className="absolute -inset-3 rounded-3xl opacity-30" style={{
              background: isPositive
                ? 'radial-gradient(ellipse at center, rgba(16, 185, 129, 0.25) 0%, transparent 70%)'
                : 'radial-gradient(ellipse at center, rgba(239, 68, 68, 0.25) 0%, transparent 70%)',
              filter: 'blur(22px)'
            }} />
            <div className="relative flex items-start justify-between gap-4">
              <div>
                <div className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium mb-3" style={{
                  background: 'rgba(255, 255, 255, 0.08)',
                  border: '1px solid rgba(255,255,255,0.14)'
                }}>
                  <span className="text-white/70">{currentDate}</span>
                </div>
                <h1 className="text-3xl font-black text-transparent bg-clip-text"
                  style={{
                    backgroundImage: isPositive
                      ? 'linear-gradient(45deg, #10b981, #34d399, #6ee7b7)'
                      : 'linear-gradient(45deg, #ef4444, #f87171, #fca5a5)',
                    filter: 'drop-shadow(0 0 8px rgba(255,255,255,0.2))'
                  }}>
                  {timeframe === 'month' ? 'Monthly Stats' : timeframe === 'week' ? 'Weekly Stats' : timeframe === 'year' ? 'Yearly Stats' : 'All-Time Stats'}
                </h1>
                <p className="text-white/65 text-sm font-semibold tracking-[0.18em] mt-2">
                  {timeframe === 'month' || timeframe === 'week' || timeframe === 'year' ? formatDate.toUpperCase() : 'ALL-TIME PERFORMANCE'}
                </p>
              </div>
              <div className="relative shrink-0">
                <div className="w-16 h-16 rounded-full flex items-center justify-center" style={{
                  background: `linear-gradient(135deg,
                    rgba(255,255,255,0.18) 0%,
                    rgba(255,255,255,0.08) 100%
                  )`,
                  border: '1px solid rgba(255,255,255,0.24)',
                  boxShadow: `0 8px 32px ${isPositive ? 'rgba(16,185,129,0.25)' : 'rgba(239,68,68,0.25)'}`
                }}>
                  <Zap className={`w-8 h-8 ${isPositive ? 'text-emerald-300' : 'text-rose-300'}`} />
                </div>
              </div>
            </div>
          </div>

          {/* Main ROI Display */}
          <div className="relative overflow-hidden rounded-3xl p-6 mb-6 border border-white/20" style={glassTileStyle}>
            <div className="absolute inset-0 opacity-25" style={{
              background: isPositive
                ? 'radial-gradient(ellipse at center, rgba(16, 185, 129, 0.25) 0%, transparent 65%)'
                : 'radial-gradient(ellipse at center, rgba(239, 68, 68, 0.25) 0%, transparent 65%)'
            }} />
            <div className="relative text-center">
              <div className="flex items-center justify-center mb-2">
                {isPositive ? (
                  <div className="flex items-center space-x-2">
                    <TrendingUp className="w-7 h-7 text-green-400" style={{
                      filter: 'drop-shadow(0 0 15px rgba(34, 197, 94, 0.8))'
                    }} />
                    <span className="text-green-400 font-black text-lg tracking-[0.18em]">PROFITABLE</span>
                  </div>
                ) : (
                  <div className="flex items-center space-x-2">
                    <TrendingDown className="w-7 h-7 text-red-400" style={{
                      filter: 'drop-shadow(0 0 15px rgba(239, 68, 68, 0.8))'
                    }} />
                    <span className="text-red-400 font-black text-lg tracking-[0.18em]">LOSS</span>
                  </div>
                )}
              </div>
              
              <div className={`text-5xl font-black mb-2 ${
                isPositive ? 'text-green-400' : 'text-red-400'
              }`} style={{
                textShadow: isPositive 
                  ? '0 0 30px rgba(34, 197, 94, 0.8), 0 0 60px rgba(34, 197, 94, 0.4)' 
                  : '0 0 30px rgba(239, 68, 68, 0.8), 0 0 60px rgba(239, 68, 68, 0.4)'
              }}>
                {stats.roi >= 0 ? '+' : ''}{(stats.roi * 100).toFixed(1)}%
              </div>
              
              <div className={`text-xl font-bold break-words px-2 ${
                profit >= 0 ? 'text-green-300' : 'text-red-300'
              }`}>
                {profit >= 0 ? '+' : ''}${formatMoney(profit)} NET PROFIT
              </div>
            </div>
          </div>

          {/* Stats Grid */}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-5 mb-6 flex-1">
            {visibleStatKeys.map(key => statDefinitions[key])}
          </div>

          {/* Footer */}
          <div className="text-center mt-auto">
            <div className="w-24 h-px bg-gradient-to-r from-transparent via-white/40 to-transparent mx-auto mb-3"></div>
            <div className="text-white/75 text-sm font-bold tracking-[0.18em]">
              TRADING DASHBOARD
            </div>
            <div className="text-white/45 text-xs mt-1 font-mono">
              Snapshot Export
            </div>
          </div>
        </div>
      </div>

      {/* Download Button */}
      <button
        onClick={downloadImage}
        className="flex items-center gap-4 px-8 py-4 bg-gradient-to-r from-cyan-600 via-blue-700 to-purple-800 hover:from-cyan-500 hover:via-blue-600 hover:to-purple-700 text-white rounded-2xl font-bold transition-all duration-300 transform hover:scale-105 border border-cyan-500/50"
        style={{
          boxShadow: '0 0 30px rgba(6, 182, 212, 0.4), 0 10px 40px rgba(0, 0, 0, 0.3)'
        }}
      >
        <Download className="w-6 h-6" style={{
          filter: 'drop-shadow(0 0 8px rgba(255, 255, 255, 0.5))'
        }} />
        <span className="text-lg tracking-wide">DOWNLOAD IMAGE</span>
      </button>
    </div>
  );
};

/* Removed gradient animation CSS - not needed for static design */
