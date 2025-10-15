import React, { useRef, useMemo } from 'react';
import { Challenge, StatsSummary } from '../types';
import { TrendingUp, TrendingDown, Download, Trophy, DollarSign, Zap } from 'lucide-react';
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

  const total = challenges.length || 1;
  const liveAccounts = challenges.filter(c => {
    const totalPhases = c.totalPhases || 3;
    if (totalPhases === 1) return c.phases.phase1.completed;
    if (totalPhases === 2) return c.phases.phase1.completed && c.phases.phase2.completed;
    return c.phases.phase1.completed && c.phases.phase2.completed && c.phases.phase3.completed;
  }).length;
  
  const phase1Pass = challenges.filter(c => c.phases.phase1.completed).length / total;
  const phase2Pass = challenges.filter(c => c.phases.phase2.completed).length / total;
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
    liveAccountsRate: liveAccounts / total,
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
}

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

export const ShareableStatsCard: React.FC<ShareableStatsCardProps> = ({ 
  challenges, 
  timeframe, 
  selectedMonth,
  selectedWeek,
  selectedYear
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
      
      // For monthly view, use overall challenge stats for success rates
      const totalChallenges = challenges.length || 1;
      const liveAccounts = challenges.filter(c => {
        const totalPhases = c.totalPhases || 3;
        if (totalPhases === 1) return c.phases.phase1.completed;
        if (totalPhases === 2) return c.phases.phase1.completed && c.phases.phase2.completed;
        return c.phases.phase1.completed && c.phases.phase2.completed && c.phases.phase3.completed;
      }).length;
      
      const phase1Pass = challenges.filter(c => c.phases.phase1.completed).length / totalChallenges;
      const phase2Pass = challenges.filter(c => c.phases.phase2.completed).length / totalChallenges;
      const costPerLiveAccount = liveAccounts > 0 ? monthlyData.costs / liveAccounts : 0;
      
      return {
        totalSpent: monthlyData.costs,
        totalPayouts: monthlyData.payouts,
        roi,
        liveAccountsRate: liveAccounts / totalChallenges,
        phase1PassRate: phase1Pass,
        phase2PassRate: phase2Pass,
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
      
      // For weekly view, use overall challenge stats for success rates
      const totalChallenges = challenges.length || 1;
      const liveAccounts = challenges.filter(c => {
        const totalPhases = c.totalPhases || 3;
        if (totalPhases === 1) return c.phases.phase1.completed;
        if (totalPhases === 2) return c.phases.phase1.completed && c.phases.phase2.completed;
        return c.phases.phase1.completed && c.phases.phase2.completed && c.phases.phase3.completed;
      }).length;
      
      const phase1Pass = challenges.filter(c => c.phases.phase1.completed).length / totalChallenges;
      const phase2Pass = challenges.filter(c => c.phases.phase2.completed).length / totalChallenges;
      const costPerLiveAccount = liveAccounts > 0 ? weeklyData.costs / liveAccounts : 0;
      
      return {
        totalSpent: weeklyData.costs,
        totalPayouts: weeklyData.payouts,
        roi,
        liveAccountsRate: liveAccounts / totalChallenges,
        phase1PassRate: phase1Pass,
        phase2PassRate: phase2Pass,
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
      
      // For yearly view, use overall challenge stats for success rates
      const totalChallenges = challenges.length || 1;
      const liveAccounts = challenges.filter(c => {
        const totalPhases = c.totalPhases || 3;
        if (totalPhases === 1) return c.phases.phase1.completed;
        if (totalPhases === 2) return c.phases.phase1.completed && c.phases.phase2.completed;
        return c.phases.phase1.completed && c.phases.phase2.completed && c.phases.phase3.completed;
      }).length;
      
      const phase1Pass = challenges.filter(c => c.phases.phase1.completed).length / totalChallenges;
      const phase2Pass = challenges.filter(c => c.phases.phase2.completed).length / totalChallenges;
      const costPerLiveAccount = liveAccounts > 0 ? yearlyData.costs / liveAccounts : 0;
      
      return {
        totalSpent: yearlyData.costs,
        totalPayouts: yearlyData.payouts,
        roi,
        liveAccountsRate: liveAccounts / totalChallenges,
        phase1PassRate: phase1Pass,
        phase2PassRate: phase2Pass,
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
  const profit = stats.totalPayouts - stats.totalSpent;
  
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
      // Temporarily simplify problematic CSS for screenshot
      const originalStyles = new Map();
      const problematicElements = cardRef.current.querySelectorAll('*');
      
      problematicElements.forEach((element) => {
        if (element instanceof HTMLElement) {
          const computedStyle = window.getComputedStyle(element);
          const originalStyle = element.style.cssText;
          originalStyles.set(element, originalStyle);
          
          // Temporarily remove problematic properties
          if (computedStyle.backdropFilter && computedStyle.backdropFilter !== 'none') {
            element.style.backdropFilter = 'none';
            element.style.backgroundColor = element.style.backgroundColor || 'rgba(0, 0, 0, 0.4)';
          }
        }
      });
      
      try {
        const dataUrl = await htmlToImage.toPng(cardRef.current, {
          quality: 1.0,
          pixelRatio: 2,
          width: 450,
          height: 650,
          backgroundColor: '#0a0a0a'
        });
        
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
        originalStyles.forEach((originalStyle, element) => {
          if (element instanceof HTMLElement) {
            element.style.cssText = originalStyle;
          }
        });
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
      {/* Dark Neon Trading Card */}
      <div 
        ref={cardRef}
        data-card-ref="true"
        className="relative w-[450px] h-[650px] bg-gray-900 overflow-hidden rounded-2xl border border-cyan-500/30"
        style={{
          background: 'linear-gradient(145deg, #0a0a0a 0%, #1a1a2e 50%, #16213e 100%)',
          boxShadow: '0 0 40px rgba(6, 182, 212, 0.3), 0 0 80px rgba(139, 69, 19, 0.1), inset 0 1px 0 rgba(255, 255, 255, 0.1)'
        }}
      >
        {/* Static border glow */}
        <div className="absolute inset-0 rounded-2xl" style={{
          background: 'rgba(6, 182, 212, 0.05)'
        }} />
        
        {/* Content */}
        <div className="relative p-8 h-full flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center space-x-2">
              <div className="w-3 h-3 rounded-full bg-green-400" style={{
                boxShadow: '0 0 10px rgba(34, 197, 94, 0.7)'
              }}></div>
              <span className="text-green-400 text-sm font-bold tracking-wider">LIVE</span>
            </div>
            <div className="text-cyan-300 text-sm font-mono">
              {currentTime}
            </div>
          </div>
          

          {/* Main Title */}
          <div className="text-center mb-8">
            <div className="flex items-center justify-center mb-4">
              <Zap className="w-8 h-8 text-yellow-400 mr-3" style={{
                filter: 'drop-shadow(0 0 10px rgba(234, 179, 8, 0.7))'
              }} />
              <h1 className="text-3xl font-black text-transparent bg-clip-text bg-gradient-to-r from-cyan-300 via-yellow-300 to-pink-300">
                PROP TRADER
              </h1>
            </div>
            <p className="text-cyan-400/80 text-sm font-semibold tracking-wide">
              {timeframe === 'month' || timeframe === 'week' || timeframe === 'year' ? formatDate.toUpperCase() : 'ALL-TIME PERFORMANCE'}
            </p>
          </div>

          {/* Main ROI Display */}
          <div className="bg-black/40 backdrop-blur-sm rounded-xl p-6 mb-6 border border-cyan-500/30 relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-cyan-500/5 to-transparent"></div>
            <div className="relative text-center">
              <div className="flex items-center justify-center mb-3">
                {isPositive ? (
                  <div className="flex items-center space-x-3">
                    <TrendingUp className="w-8 h-8 text-green-400" style={{
                      filter: 'drop-shadow(0 0 15px rgba(34, 197, 94, 0.8))'
                    }} />
                    <span className="text-green-400 font-black text-xl tracking-wide">PROFITABLE</span>
                  </div>
                ) : (
                  <div className="flex items-center space-x-3">
                    <TrendingDown className="w-8 h-8 text-red-400" style={{
                      filter: 'drop-shadow(0 0 15px rgba(239, 68, 68, 0.8))'
                    }} />
                    <span className="text-red-400 font-black text-xl tracking-wide">LOSS</span>
                  </div>
                )}
              </div>
              
              <div className={`text-6xl font-black mb-3 ${
                isPositive ? 'text-green-400' : 'text-red-400'
              }`} style={{
                textShadow: isPositive 
                  ? '0 0 30px rgba(34, 197, 94, 0.8), 0 0 60px rgba(34, 197, 94, 0.4)' 
                  : '0 0 30px rgba(239, 68, 68, 0.8), 0 0 60px rgba(239, 68, 68, 0.4)'
              }}>
                {stats.roi >= 0 ? '+' : ''}{(stats.roi * 100).toFixed(1)}%
              </div>
              
              <div className={`text-2xl font-bold ${
                profit >= 0 ? 'text-green-300' : 'text-red-300'
              }`}>
                {profit >= 0 ? '+' : ''}${formatMoney(profit)} NET PROFIT
              </div>
            </div>
          </div>

          {/* Stats Grid */}
          <div className="grid grid-cols-2 gap-4 mb-6 flex-1">
            {/* Capital Invested - RED (Cost) */}
            <div className="bg-black/30 backdrop-blur-sm rounded-xl p-4 border border-red-500/30 relative">
              <div className="absolute top-2 right-2">
                <DollarSign className="w-5 h-5 text-red-400/60" />
              </div>
              <div className="text-red-300/80 text-xs font-bold uppercase tracking-wider mb-2">
                Capital Invested
              </div>
              <div className="text-red-400 text-2xl font-black" style={{
                textShadow: '0 0 10px rgba(248, 113, 113, 0.5)'
              }}>
                ${formatMoney(stats.totalSpent)}
              </div>
            </div>
            
            {/* Total Payouts - GREEN (Income) */}
            <div className="bg-black/30 backdrop-blur-sm rounded-xl p-4 border border-green-500/30 relative">
              <div className="absolute top-2 right-2">
                <Trophy className="w-5 h-5 text-green-400/60" />
              </div>
              <div className="text-green-300/80 text-xs font-bold uppercase tracking-wider mb-2">
                Total Payouts
              </div>
              <div className="text-green-400 text-2xl font-black" style={{
                textShadow: '0 0 10px rgba(34, 197, 94, 0.5)'
              }}>
                ${formatMoney(stats.totalPayouts)}
              </div>
            </div>
            
            {/* Success Rate - Color coded */}
            <div className="bg-black/30 backdrop-blur-sm rounded-xl p-4 border border-cyan-500/30 relative">
              <div className="absolute top-2 right-2">
                <Trophy className="w-5 h-5 text-cyan-400/60" />
              </div>
              <div className="text-cyan-300/80 text-xs font-bold uppercase tracking-wider mb-2">
                Success Rate
              </div>
              <div className={`text-2xl font-black ${
                stats.liveAccountsRate > 0.5 ? 'text-green-400' : 
                stats.liveAccountsRate > 0.3 ? 'text-yellow-400' : 'text-red-400'
              }`} style={{
                textShadow: stats.liveAccountsRate > 0.5 
                  ? '0 0 10px rgba(34, 197, 94, 0.5)'
                  : stats.liveAccountsRate > 0.3
                  ? '0 0 10px rgba(234, 179, 8, 0.5)'
                  : '0 0 10px rgba(248, 113, 113, 0.5)'
              }}>
                {(stats.liveAccountsRate * 100).toFixed(0)}%
              </div>
            </div>
            
            {/* Avg Time to Live */}
            <div className="bg-black/30 backdrop-blur-sm rounded-xl p-4 border border-purple-500/30 relative">
              <div className="absolute top-2 right-2">
                <Trophy className="w-5 h-5 text-purple-400/60" />
              </div>
              <div className="text-purple-300/80 text-xs font-bold uppercase tracking-wider mb-2">
                Avg Time to Live
              </div>
              <div className="text-purple-400 text-2xl font-black" style={{
                textShadow: '0 0 10px rgba(168, 85, 247, 0.5)'
              }}>
                {stats.averageTimeToLive > 0 ? `${Math.round(stats.averageTimeToLive)}d` : 'N/A'}
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="text-center mt-auto">
            <div className="w-24 h-px bg-gradient-to-r from-transparent via-cyan-500 to-transparent mx-auto mb-3"></div>
            <div className="text-cyan-400/80 text-sm font-bold tracking-wider">
              TRADING DASHBOARD
            </div>
            <div className="text-gray-500 text-xs mt-1 font-mono">
              {currentDate}
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
