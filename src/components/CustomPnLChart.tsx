import React, { useMemo, useState } from 'react';
import { NeonCard } from './NeonCard';
import { Challenge } from '../types';
import { Calendar, BarChart3, CreditCard } from 'lucide-react';

function getWeekNumber(date: Date): string {
  const year = date.getFullYear();
  const startOfYear = new Date(year, 0, 1);
  const days = Math.floor((date.getTime() - startOfYear.getTime()) / (24 * 60 * 60 * 1000));
  const weekNumber = Math.ceil((days + startOfYear.getDay() + 1) / 7);
  return `${year}-W${weekNumber.toString().padStart(2, '0')}`;
}

function getMonthKey(date: string): string {
  return date.slice(0, 7); // YYYY-MM
}

function getMonthName(monthKey: string): string {
  const [, monthNum] = monthKey.split('-');
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return monthNames[parseInt(monthNum) - 1];
}

function monthsBetween(startYm: string, endYm: string): string[] {
  const [sy, sm] = startYm.split('-').map(Number);
  const [ey, em] = endYm.split('-').map(Number);
  const result: string[] = [];
  let y = sy, m = sm;
  
  while (y < ey || (y === ey && m <= em)) {
    result.push(`${y.toString().padStart(4,'0')}-${m.toString().padStart(2,'0')}`);
    m += 1;
    if (m > 12) { m = 1; y += 1; }
  }
  return result;
}

function weeksBetween(startWeek: string, endWeek: string): string[] {
  const parseWeek = (week: string) => {
    const [year, weekStr] = week.split('-W');
    return { year: parseInt(year), week: parseInt(weekStr) };
  };

  const start = parseWeek(startWeek);
  const end = parseWeek(endWeek);
  const result: string[] = [];

  let currentYear = start.year;
  let currentWeek = start.week;

  while (currentYear < end.year || (currentYear === end.year && currentWeek <= end.week)) {
    result.push(`${currentYear}-W${currentWeek.toString().padStart(2, '0')}`);
    
    currentWeek++;
    if (currentWeek > 52) {
      currentWeek = 1;
      currentYear++;
    }
  }

  return result;
}

interface TooltipState {
  visible: boolean;
  x: number;
  y: number;
  data: {
    period: string;
    amount: number;
    costs: number;
    payouts: number;
    displayPeriod: string;
  } | null;
}

export const CustomPnLChart: React.FC<{ challenges: Challenge[]; selectedYear: string }> = ({ challenges, selectedYear }) => {
  // Mobile detection
  const [isMobile, setIsMobile] = React.useState(false);
  
  // On mobile, force card mode and disable display mode toggle
  const [displayMode, setDisplayMode] = useState<'bar' | 'card'>('bar');
  const [timeMode, setTimeMode] = useState<'monthly' | 'weekly'>('monthly');
  const [tooltip, setTooltip] = useState<TooltipState>({ visible: false, x: 0, y: 0, data: null });

  // Mobile detection effect
  React.useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth <= 768);
    };
    
    checkMobile();
    window.addEventListener('resize', checkMobile);
    
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Add CSS animations for cards view with mobile optimizations
  // Remove heavy animations for snappier interactions

  const { data, hasData, dateRange, totalPnL } = useMemo(() => {
    if (challenges.length === 0) {
      return { data: [], hasData: false, dateRange: '', totalPnL: 0 };
    }


    if (timeMode === 'monthly') {
      // Calculate monthly PnL based on challenge start dates and payout dates
      // Filter out challenges without valid start dates
      const validChallenges = challenges.filter(c => c && c.startDate);
      if (validChallenges.length === 0) {
        return { data: [], hasData: false, dateRange: '', totalPnL: 0 };
      }
      
      const now = new Date();
      const currentYear = now.getFullYear();
      const selectedYearNum = parseInt(selectedYear, 10);
      const firstMonth = `${selectedYear}-01`;
      const lastMonth = selectedYearNum === currentYear ? `${selectedYear}-${String(now.getMonth()+1).padStart(2,'0')}` : `${selectedYear}-12`;
      const months = monthsBetween(firstMonth, lastMonth);

      const pnlByMonth: Record<string, { costs: number; payouts: number; pnl: number }> = {};

      // Initialize all months with zero values
      months.forEach(month => {
        pnlByMonth[month] = { costs: 0, payouts: 0, pnl: 0 };
      });

      // Add challenge costs based on start date
      validChallenges.forEach(challenge => {
        const startYear = challenge.startDate.slice(0, 4);
        if (startYear === selectedYear) {
          const challengeMonth = getMonthKey(challenge.startDate);
          if (pnlByMonth[challengeMonth]) {
            pnlByMonth[challengeMonth].costs += challenge.cost || 0;
          }
        }
      });

      // Add payouts based on payout dates
      validChallenges.forEach(challenge => {
        if (Array.isArray(challenge.payouts)) {
          challenge.payouts.forEach(payout => {
            const payoutYear = payout.date.slice(0, 4);
            if (payoutYear === selectedYear) {
              const payoutMonth = getMonthKey(payout.date);
              if (pnlByMonth[payoutMonth]) {
                pnlByMonth[payoutMonth].payouts += payout.amount;
              }
            }
          });
        }
      });

      // Calculate PnL for each month
      Object.keys(pnlByMonth).forEach(month => {
        const data = pnlByMonth[month];
        data.pnl = data.payouts - data.costs;
      });

      const rows = months.map(month => {
        const [, monthNum] = month.split('-');
        const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        const monthName = monthNames[parseInt(monthNum) - 1];
        
        return {
          period: month,
          amount: pnlByMonth[month].pnl,
          costs: pnlByMonth[month].costs,
          payouts: pnlByMonth[month].payouts,
          displayPeriod: monthName // Remove year since it's shown above
        };
      });

      const totalPnL = Object.values(pnlByMonth).reduce((sum, data) => sum + data.pnl, 0);
      const hasData = Object.values(pnlByMonth).some(d => d.costs > 0 || d.payouts > 0);

      return { 
        data: rows, 
        hasData, 
        dateRange: `${getMonthName(firstMonth)} → ${getMonthName(lastMonth)}`, // Remove years
        totalPnL 
      };

    } else {
      // Weekly view
      // Filter out challenges without valid start dates
      const validChallenges = challenges.filter(c => c && c.startDate);
      if (validChallenges.length === 0) {
        return { data: [], hasData: false, dateRange: '', totalPnL: 0 };
      }
      
      const now = new Date();
      const currentYear = now.getFullYear();
      const selectedYearNum = parseInt(selectedYear, 10);
      const startWeek = getWeekNumber(new Date(`${selectedYear}-01-01`));
      const endWeek = selectedYearNum === currentYear ? getWeekNumber(now) : getWeekNumber(new Date(`${selectedYear}-12-31`));
      const allWeeks = weeksBetween(startWeek, endWeek);
      const weeks = allWeeks.slice(-12);

      const pnlByWeek: Record<string, { costs: number; payouts: number; pnl: number }> = {};

      // Initialize all weeks with zero values
      weeks.forEach(week => {
        pnlByWeek[week] = { costs: 0, payouts: 0, pnl: 0 };
      });

      // Add challenge costs based on start date
      validChallenges.forEach(challenge => {
        const startYear = challenge.startDate.slice(0, 4);
        if (startYear === selectedYear) {
          const challengeWeek = getWeekNumber(new Date(challenge.startDate));
          if (pnlByWeek[challengeWeek]) {
            pnlByWeek[challengeWeek].costs += challenge.cost || 0;
          }
        }
      });

      // Add payouts based on payout dates
      validChallenges.forEach(challenge => {
        if (Array.isArray(challenge.payouts)) {
          challenge.payouts.forEach(payout => {
            const payoutYear = payout.date.slice(0, 4);
            if (payoutYear === selectedYear) {
              const payoutWeek = getWeekNumber(new Date(payout.date));
              if (pnlByWeek[payoutWeek]) {
                pnlByWeek[payoutWeek].payouts += payout.amount;
              }
            }
          });
        }
      });

      // Calculate PnL for each week
      Object.keys(pnlByWeek).forEach(week => {
        const data = pnlByWeek[week];
        data.pnl = data.payouts - data.costs;
      });

      const rows = weeks.map(week => {
        const weekNumber = week.replace(/^\d{4}-W/, '');
        return {
          period: week,
          amount: pnlByWeek[week].pnl,
          costs: pnlByWeek[week].costs,
          payouts: pnlByWeek[week].payouts,
          displayPeriod: `Week ${weekNumber}`
        };
      });

      const totalPnL = Object.values(pnlByWeek).reduce((sum, data) => sum + data.pnl, 0);
      const hasData = Object.values(pnlByWeek).some(d => d.costs > 0 || d.payouts > 0);

      return { 
        data: rows, 
        hasData, 
        dateRange: 'Last 12 weeks',
        totalPnL 
      };
    }
  }, [challenges, timeMode, selectedYear]);

  // Chart dimensions
  const chartWidth = 800;
  const chartHeight = 256;
  const margin = { top: 20, right: 20, bottom: 60, left: 100 }; // Increased left margin for Y-axis labels
  const innerWidth = chartWidth - margin.left - margin.right;
  const innerHeight = chartHeight - margin.top - margin.bottom;

  // Calculate scales
  const hasNegativeData = data.some(d => d.amount < 0);
  const maxPositive = Math.max(...data.map(d => d.amount), 100);
  const minNegative = hasNegativeData ? Math.min(...data.map(d => d.amount), 0) : 0;
  
  const yScale = (value: number) => {
    if (!hasNegativeData) {
      // When all data is positive, scale from 0 to maxPositive
      return innerHeight - (value / maxPositive) * innerHeight;
    } else {
      // When we have negative data, scale from minNegative to maxPositive
      const range = maxPositive - minNegative;
      return innerHeight - ((value - minNegative) / range) * innerHeight;
    }
  };

  const xScale = (index: number) => {
    if (data.length <= 1) return innerWidth / 2;
    // Add some padding on both sides to prevent bars from touching edges
    const paddingRatio = 0.1; // 10% padding on each side
    const usableWidth = innerWidth * (1 - paddingRatio * 2);
    const startX = innerWidth * paddingRatio;
    return startX + (index / (data.length - 1)) * usableWidth;
  };

  const barWidth = Math.min(Math.max(innerWidth / data.length * 0.8, 12), 60);

  return (
    <NeonCard glow="purple" className="p-4 relative">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-4">
          <div>
            <div className="text-lg font-bold text-white drop-shadow-neon-cyan mb-1">{new Date().getFullYear()}</div>
            <h3 className="text-lg font-semibold text-white drop-shadow-neon">
              {timeMode === 'monthly' ? 'Monthly' : 'Weekly'} PnL
            </h3>
          </div>
          <div className="text-right">
            <div className="text-sm text-white/70">Total PnL</div>
            <div className={`text-lg font-bold drop-shadow-neon ${
              totalPnL >= 0 ? 'text-lime-300 drop-shadow-neon-lime' : 'text-red-400'
            }`}>
              {totalPnL >= 0 ? '+' : ''}${totalPnL.toLocaleString(undefined, { maximumFractionDigits: 2 })}
            </div>
          </div>
        </div>
        
        {/* Only show toggles on desktop, mobile gets card view only */}
        {!isMobile ? (
          <div className="flex flex-col gap-3">
            {/* Main Display Mode Toggle - RED THEME */}
            <div className="flex justify-center">
              <div className="relative bg-black/60 rounded-xl p-1 border border-red-500/30" style={{
                boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.6), 0 0 20px rgba(239,68,68,0.1)'
              }}>
                {/* Sliding Background */}
                <div 
                  className="absolute top-1 h-10 rounded-lg transition-all duration-500 ease-out"
                  style={{
                  left: displayMode === 'card' ? '4px' : '50%',
                    width: displayMode === 'bar' ? 'calc(50% - 4px)' : 'calc(50% - 4px)',
                    background: 'linear-gradient(135deg, #dc2626, #ef4444, #f87171)',
                    boxShadow: '0 0 25px rgba(239, 68, 68, 0.6), 0 0 50px rgba(239, 68, 68, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.2)'
                  }}
                />
                
                {/* Toggle Buttons */}
                <div className="relative flex">
                  <button
                    onClick={() => setDisplayMode('card')}
                    className={`relative z-10 flex items-center gap-2 px-6 py-2.5 rounded-lg text-sm font-bold uppercase tracking-wider transition-all duration-500 ${
                      displayMode === 'card'
                        ? 'text-white shadow-lg'
                        : 'text-white/60 hover:text-white/80'
                    }`}
                    style={{
                      textShadow: displayMode === 'card' ? '0 2px 4px rgba(0,0,0,0.8)' : 'none'
                    }}
                  >
                    <CreditCard className="w-4 h-4" />
                    Stat Cards
                  </button>
                  
                  <button
                    onClick={() => setDisplayMode('bar')}
                    className={`relative z-10 flex items-center gap-2 px-6 py-2.5 rounded-lg text-sm font-bold uppercase tracking-wider transition-all duration-500 ${
                      displayMode === 'bar'
                        ? 'text-white shadow-lg'
                        : 'text-white/60 hover:text-white/80'
                    }`}
                    style={{
                      textShadow: displayMode === 'bar' ? '0 2px 4px rgba(0,0,0,0.8)' : 'none'
                    }}
                  >
                    <BarChart3 className="w-4 h-4" />
                    Bar Charts
                  </button>
                </div>
              </div>
            </div>
            
            {/* Time Period Toggle - Smaller, underneath */}
            <div className="flex justify-center">
              <div className="flex gap-1 bg-black/40 rounded-lg p-0.5 border border-white/10">
                <button
                  onClick={() => setTimeMode('monthly')}
                  className={`flex items-center gap-1.5 px-4 py-1.5 rounded-md text-xs font-medium transition-all duration-300 ${
                    timeMode === 'monthly'
                      ? 'bg-red-500/20 border border-red-400/50 text-red-200 shadow-lg'
                      : 'text-white/60 hover:text-white/80 hover:bg-white/5'
                  }`}
                  style={{
                    textShadow: timeMode === 'monthly' ? '0 0 10px rgba(239, 68, 68, 0.8)' : 'none',
                    boxShadow: timeMode === 'monthly' ? '0 0 15px rgba(239, 68, 68, 0.3)' : 'none'
                  }}
                >
                  <Calendar className="w-3 h-3" />
                  Monthly
                </button>
                <button
                  onClick={() => setTimeMode('weekly')}
                  className={`flex items-center gap-1.5 px-4 py-1.5 rounded-md text-xs font-medium transition-all duration-300 ${
                    timeMode === 'weekly'
                      ? 'bg-red-500/20 border border-red-400/50 text-red-200 shadow-lg'
                      : 'text-white/60 hover:text-white/80 hover:bg-white/5'
                  }`}
                  style={{
                    textShadow: timeMode === 'weekly' ? '0 0 10px rgba(239, 68, 68, 0.8)' : 'none',
                    boxShadow: timeMode === 'weekly' ? '0 0 15px rgba(239, 68, 68, 0.3)' : 'none'
                  }}
                >
                  <BarChart3 className="w-3 h-3" />
                  Weekly
                </button>
              </div>
            </div>
            
            {/* Info Text */}
            {timeMode === 'weekly' && (
              <div className="text-center">
                <div className="text-xs text-white/60">{dateRange}</div>
              </div>
            )}
          </div>
        ) : (
          /* Mobile-only time toggle - simpler design */
          <div className="flex justify-center">
            <div className="flex gap-1 bg-black/40 rounded-lg p-0.5 border border-white/10">
              <button
                onClick={() => setTimeMode('monthly')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all duration-300 ${
                  timeMode === 'monthly'
                    ? 'bg-red-500/20 border border-red-400/50 text-red-200'
                    : 'text-white/60 hover:text-white/80 hover:bg-white/5'
                }`}
              >
                <Calendar className="w-3 h-3" />
                Monthly
              </button>
              <button
                onClick={() => setTimeMode('weekly')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all duration-300 ${
                  timeMode === 'weekly'
                    ? 'bg-red-500/20 border border-red-400/50 text-red-200'
                    : 'text-white/60 hover:text-white/80 hover:bg-white/5'
                }`}
              >
                <BarChart3 className="w-3 h-3" />
                Weekly
              </button>
            </div>
            {/* Mobile info text */}
            {timeMode === 'weekly' && (
              <div className="text-center mt-2">
                <div className="text-xs text-white/60">{dateRange}</div>
              </div>
            )}
          </div>
        )}
      </div>
      
      {/* Cards View - Stunning Monthly Stats (forced on mobile) */}
      {(displayMode === 'card' || isMobile) ? (
        <div className="min-h-[400px] py-4">
          {!hasData ? (
            <div className="flex items-center justify-center h-64 text-white/60">
              <div className="text-center">
                <CreditCard className="w-16 h-16 mx-auto mb-4 opacity-30" />
                <div className="text-lg font-medium mb-2">No Monthly Data Yet</div>
                <div className="text-sm">Add challenges with costs and payouts to see monthly breakdowns!</div>
              </div>
            </div>
          ) : (
            <div className={`grid gap-4 ${
              isMobile 
                ? 'grid-cols-1 sm:grid-cols-2 gap-4' 
                : 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6'
            }`}>
              {data.filter(item => item.costs > 0 || item.payouts > 0).map((item) => {
                const pnl = item.payouts - item.costs;
                const pnlPositive = pnl >= 0;
                const hasActivity = item.costs > 0 || item.payouts > 0;
                
                if (!hasActivity) return null;
                
                return (
                  <div
                    key={item.period}
                    className="group relative perspective-1000 cursor-pointer select-none caret-transparent"
                  >
                    {/* Holographic Card Container - Simplified on mobile */}
                    <div className={`relative transform-gpu transition-all duration-700 ${
                      isMobile 
                        ? 'hover:scale-102' 
                        : 'hover:rotate-y-12 hover:rotate-x-6 hover:scale-105'
                    }`}>
                      {/* Glassmorphism Card */}
                      <div
                        className="relative overflow-hidden rounded-3xl backdrop-blur-xl transition-all duration-500"
                        style={{
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
                        }}
                      >
                        {/* Holographic Reflection Layer - Simplified on mobile */}
                        {!isMobile && (
                          <div 
                            className="absolute inset-0 opacity-0 group-hover:opacity-60 transition-opacity duration-700"
                            style={{
                              background: `conic-gradient(from 0deg at 50% 50%, 
                                transparent 0deg, 
                                rgba(255, 0, 150, 0.1) 60deg,
                                rgba(0, 255, 255, 0.1) 120deg,
                                rgba(255, 255, 0, 0.1) 180deg,
                                rgba(255, 0, 150, 0.1) 240deg,
                                rgba(0, 255, 255, 0.1) 300deg,
                                transparent 360deg
                              )`,
                              filter: 'blur(1px)',
                              animation: 'rotate 8s linear infinite'
                            }}
                          />
                        )}
                        
                        {/* Floating Particle System - Reduced on mobile */}
                        <div className="absolute inset-0 pointer-events-none overflow-hidden">
                          {[...Array(isMobile ? 4 : 12)].map((_, i) => (
                            <div
                              key={i}
                              className={`absolute w-1 h-1 rounded-full ${
                                pnlPositive ? 'bg-emerald-400' : 'bg-rose-400'
                              } ${isMobile ? 'opacity-40' : 'opacity-60'}`}
                              style={{
                                left: `${Math.random() * 100}%`,
                                top: `${Math.random() * 100}%`,
                                animation: `floatingParticle ${isMobile ? 6 : 3 + Math.random() * 4}s ease-in-out infinite ${i * 0.5}s`,
                                boxShadow: !isMobile ? (pnlPositive 
                                  ? '0 0 10px rgba(16, 185, 129, 0.8)'
                                  : '0 0 10px rgba(239, 68, 68, 0.8)') : 'none'
                              }}
                            />
                          ))}
                        </div>
                        
                        {/* Content Container with 3D effect and proper padding */}
                        <div className="relative p-6 sm:p-8 z-10 transform-gpu transition-transform duration-300 group-hover:translate-z-4">
                          {/* Liquid Morphing Header */}
                          <div className="relative mb-6">
                            {/* Liquid Background Blob - Simplified on mobile */}
                            <div 
                              className={`absolute -inset-2 rounded-2xl opacity-30 group-hover:opacity-50 transition-opacity duration-700`}
                              style={{
                                background: pnlPositive 
                                  ? 'radial-gradient(ellipse at center, rgba(16, 185, 129, 0.3) 0%, transparent 70%)'
                                  : 'radial-gradient(ellipse at center, rgba(239, 68, 68, 0.3) 0%, transparent 70%)',
                                filter: isMobile ? 'blur(10px)' : 'blur(20px)',
                                animation: isMobile ? 'none' : 'liquidMorph 4s ease-in-out infinite'
                              }}
                            />
                            
                            <div className="relative flex items-center justify-between">
                              <div className="flex-1">
                                {/* Period Title with Holographic Text */}
                                <h3 className="text-2xl font-black text-transparent bg-clip-text mb-1 group-hover:scale-105 transition-transform duration-300"
                                    style={{
                                      backgroundImage: pnlPositive 
                                        ? 'linear-gradient(45deg, #10b981, #34d399, #6ee7b7, #10b981)'
                                        : 'linear-gradient(45deg, #ef4444, #f87171, #fca5a5, #ef4444)',
                                      backgroundSize: '200% 200%',
                                      animation: 'gradientShift 3s ease infinite',
                                      filter: 'drop-shadow(0 0 8px rgba(255,255,255,0.3))'
                                    }}>
                                  {item.displayPeriod}
                                </h3>
                                
                                {/* Year Badge */}
                                <div className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium backdrop-blur-md transition-all duration-300 group-hover:scale-105"
                                     style={{
                                       background: 'rgba(255, 255, 255, 0.1)',
                                       border: '1px solid rgba(255, 255, 255, 0.2)'
                                     }}>
                                  <span className="text-white/70">{item.period.split('-')[0]}</span>
                                </div>
                              </div>
                              
                              {/* 3D Floating Status Orb - Simplified on mobile */}
                              <div className="relative">
                                <div className={`w-16 h-16 relative transform-gpu transition-all duration-500 ${
                                  isMobile 
                                    ? 'group-hover:scale-105' 
                                    : 'group-hover:rotate-12 group-hover:scale-110'
                                }`}>
                                  {/* Orb Glow - Reduced on mobile */}
                                  {!isMobile && (
                                    <div 
                                      className="absolute inset-0 rounded-full blur-md animate-pulse"
                                      style={{
                                        background: pnlPositive 
                                          ? 'radial-gradient(circle, rgba(16, 185, 129, 0.6) 0%, transparent 70%)'
                                          : 'radial-gradient(circle, rgba(239, 68, 68, 0.6) 0%, transparent 70%)'
                                      }}
                                    />
                                  )}
                                  
                                  {/* Main Orb */}
                                  <div 
                                    className="relative w-full h-full rounded-full flex items-center justify-center backdrop-blur-lg"
                                    style={{
                                      background: `linear-gradient(135deg, 
                                        rgba(255, 255, 255, 0.2) 0%,
                                        rgba(255, 255, 255, 0.1) 50%,
                                        rgba(255, 255, 255, 0.05) 100%
                                      )`,
                                      border: '2px solid rgba(255, 255, 255, 0.3)',
                                      boxShadow: `
                                        0 8px 32px ${pnlPositive ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)'},
                                        inset 0 1px 0 rgba(255, 255, 255, 0.3)
                                      `
                                    }}
                                  >
                                    {/* Holographic Icon */}
                                    <div className="relative">
                                      {pnlPositive ? (
                                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" className="filter drop-shadow-lg">
                                          <path d="M13 7h8v8" stroke="url(#greenGradient)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                                          <path d="M21 7l-8 8-4-4-6 6" stroke="url(#greenGradient)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                                          <defs>
                                            <linearGradient id="greenGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                                              <stop offset="0%" stopColor="#10b981">
                                                <animate attributeName="stop-color" values="#10b981;#34d399;#10b981" dur="2s" repeatCount="indefinite"/>
                                              </stop>
                                              <stop offset="100%" stopColor="#6ee7b7">
                                                <animate attributeName="stop-color" values="#6ee7b7;#10b981;#6ee7b7" dur="2s" repeatCount="indefinite"/>
                                              </stop>
                                            </linearGradient>
                                          </defs>
                                        </svg>
                                      ) : (
                                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" className="filter drop-shadow-lg">
                                          <path d="M3 17h8v-8" stroke="url(#redGradient)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                                          <path d="M3 17l8-8 4 4 6-6" stroke="url(#redGradient)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                                          <defs>
                                            <linearGradient id="redGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                                              <stop offset="0%" stopColor="#ef4444">
                                                <animate attributeName="stop-color" values="#ef4444;#f87171;#ef4444" dur="2s" repeatCount="indefinite"/>
                                              </stop>
                                              <stop offset="100%" stopColor="#fca5a5">
                                                <animate attributeName="stop-color" values="#fca5a5;#ef4444;#fca5a5" dur="2s" repeatCount="indefinite"/>
                                              </stop>
                                            </linearGradient>
                                          </defs>
                                        </svg>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>
                      
                          {/* Holographic Data Matrix */}
                          <div className="space-y-4">
                            {/* Net PnL Hero Section */}
                            <div className="relative text-center py-6 px-2">
                              {/* Energy Core Background */}
                              <div 
                                className="absolute inset-0 rounded-2xl opacity-20"
                                style={{
                                  background: pnlPositive 
                                    ? 'radial-gradient(ellipse at center, rgba(16, 185, 129, 0.4) 0%, transparent 60%)'
                                    : 'radial-gradient(ellipse at center, rgba(239, 68, 68, 0.4) 0%, transparent 60%)',
                                  filter: 'blur(15px)'
                                }}
                              />
                              
                              <div className="relative">
                                {/* PnL Label */}
                                <p className="text-sm text-white/60 font-medium uppercase tracking-[0.2em] mb-2">Net P&L</p>
                                
                                {/* Giant Holographic Number with proper sizing */}
                                <div className="relative overflow-visible px-1">
                                  <h2 className="text-3xl sm:text-4xl font-black text-transparent bg-clip-text group-hover:scale-105 transition-transform duration-500 leading-tight break-all"
                                      style={{
                                        backgroundImage: pnlPositive 
                                          ? 'linear-gradient(135deg, #10b981 0%, #34d399 50%, #6ee7b7 100%)'
                                          : 'linear-gradient(135deg, #ef4444 0%, #f87171 50%, #fca5a5 100%)',
                                        filter: `drop-shadow(0 0 20px ${pnlPositive ? 'rgba(16, 185, 129, 0.8)' : 'rgba(239, 68, 68, 0.8)'})`
                                      }}>
                                    {pnl >= 0 ? '+' : ''}${Math.round(pnl).toLocaleString()}
                                  </h2>
                                  
                                  {/* Scanning Line Effect */}
                                  <div 
                                    className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300"
                                    style={{
                                      background: `linear-gradient(90deg, transparent 0%, ${pnlPositive ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)'} 50%, transparent 100%)`,
                                      animation: 'scanLine 2s ease-in-out infinite'
                                    }}
                                  />
                                </div>
                                
                                {/* ROI Indicator with responsive sizing */}
                                {item.costs > 0 && (
                                  <div className="mt-3">
                                    <div className="inline-flex items-center px-3 sm:px-4 py-1.5 sm:py-2 rounded-full backdrop-blur-lg transition-all duration-300 group-hover:scale-105"
                                         style={{
                                           background: pnlPositive 
                                             ? 'linear-gradient(135deg, rgba(16, 185, 129, 0.2) 0%, rgba(16, 185, 129, 0.1) 100%)'
                                             : 'linear-gradient(135deg, rgba(239, 68, 68, 0.2) 0%, rgba(239, 68, 68, 0.1) 100%)',
                                           border: `1px solid ${pnlPositive ? 'rgba(16, 185, 129, 0.4)' : 'rgba(239, 68, 68, 0.4)'}`,
                                           boxShadow: `0 0 20px ${pnlPositive ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)'}`
                                         }}>
                                      <span className="text-xs sm:text-sm font-bold text-white/90 whitespace-nowrap">
                                        {((pnl / item.costs) * 100).toFixed(1)}% ROI
                                      </span>
                                    </div>
                                  </div>
                                )}
                              </div>
                            </div>
                            
                            {/* Data Bars Section */}
                            <div className="space-y-3">
                              {/* Cost Bar */}
                              <div className="relative">
                                <div className="flex items-center justify-between mb-2">
                                  <span className="text-xs text-white/60 font-medium uppercase tracking-wider">Costs</span>
                                  <span className="text-sm font-bold text-white/90">${Math.round(item.costs).toLocaleString()}</span>
                                </div>
                                <div className="relative h-2 rounded-full overflow-hidden backdrop-blur-md"
                                     style={{
                                       background: 'rgba(255, 255, 255, 0.1)'
                                     }}>
                                  <div 
                                    className="absolute left-0 top-0 h-full rounded-full transition-all duration-1000 group-hover:animate-pulse"
                                    style={{
                                      width: item.costs > 0 ? `${Math.min(100, (item.costs / Math.max(item.costs, item.payouts)) * 100)}%` : '0%',
                                      background: 'linear-gradient(90deg, #ef4444, #f87171, #fca5a5)',
                                      boxShadow: '0 0 15px rgba(239, 68, 68, 0.6)'
                                    }}
                                  />
                                </div>
                              </div>
                              
                              {/* Payout Bar */}
                              <div className="relative">
                                <div className="flex items-center justify-between mb-2">
                                  <span className="text-xs text-white/60 font-medium uppercase tracking-wider">Payouts</span>
                                  <span className="text-sm font-bold text-white/90">${Math.round(item.payouts).toLocaleString()}</span>
                                </div>
                                <div className="relative h-2 rounded-full overflow-hidden backdrop-blur-md"
                                     style={{
                                       background: 'rgba(255, 255, 255, 0.1)'
                                     }}>
                                  <div 
                                    className="absolute left-0 top-0 h-full rounded-full transition-all duration-1000 group-hover:animate-pulse"
                                    style={{
                                      width: item.payouts > 0 ? `${Math.min(100, (item.payouts / Math.max(item.costs, item.payouts)) * 100)}%` : '0%',
                                      background: 'linear-gradient(90deg, #10b981, #34d399, #6ee7b7)',
                                      boxShadow: '0 0 15px rgba(16, 185, 129, 0.6)'
                                    }}
                                  />
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : (
      <div className="h-64 flex items-center justify-center">
        <svg 
          width={chartWidth} 
          height={chartHeight}
          className="overflow-visible"
        >
          {/* Y axis */}
          <line 
            x1={margin.left} 
            y1={margin.top} 
            x2={margin.left} 
            y2={margin.top + innerHeight} 
            stroke="rgba(255,255,255,0.15)" 
            opacity="0"
          >
            <animate
              attributeName="opacity"
              from="0"
              to="1"
              dur="0.5s"
              begin="0.2s"
              fill="freeze"
            />
          </line>
          
          {/* X axis */}
          <line 
            x1={margin.left} 
            y1={margin.top + innerHeight} 
            x2={margin.left + innerWidth} 
            y2={margin.top + innerHeight} 
            stroke="rgba(255,255,255,0.15)" 
            opacity="0"
          >
            <animate
              attributeName="opacity"
              from="0"
              to="1"
              dur="0.5s"
              begin="0.2s"
              fill="freeze"
            />
          </line>

          {/* Bars with animations */}
          {data.map((item, index) => {
            const barX = margin.left + xScale(index) - barWidth / 2;
            
            const zeroY = yScale(0);
            const valueY = yScale(item.amount);
            const barY = margin.top + Math.min(zeroY, valueY);
            const barHeight = Math.max(Math.abs(valueY - zeroY), 2);
            const color = item.amount >= 0 ? '#22d3ee' : '#ef4444';
            const hoverColor = item.amount >= 0 ? '#06b6d4' : '#dc2626';
            const glowColor = item.amount >= 0 ? 'rgba(34, 211, 238, 0.3)' : 'rgba(239, 68, 68, 0.3)';
            
            return (
              <g key={index}>
                {/* Glow effect */}
                <rect
                  x={barX - 2}
                  y={barY - 2}
                  width={barWidth + 4}
                  height={barHeight + 4}
                  fill={glowColor}
                  rx={6}
                  ry={6}
                  opacity="0"
                  className="transition-opacity duration-300"
                  style={{
                    filter: 'blur(3px)'
                  }}
                />
                
                {/* Main bar */}
                <rect
                  x={barX}
                  y={barY}
                  width={barWidth}
                  height={barHeight}
                  fill={color}
                  rx={4}
                  ry={4}
                  className="transition-all duration-300 cursor-pointer"
                  style={{
                    filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.3))',
                    transform: 'translateY(0)',
                    transformOrigin: 'center bottom'
                  }}
                  onMouseEnter={(e) => {
                    // Use bar position relative to chart for consistent tooltip placement
                    const barCenterX = barX + barWidth / 2;
                    const tooltipX = margin.left + barCenterX;
                    const tooltipY = 20; // Fixed position above chart
                    
                    setTooltip({
                      visible: true,
                      x: tooltipX,
                      y: tooltipY,
                      data: item
                    });
                    
                    // Enhanced hover effects
                    e.currentTarget.style.fill = hoverColor;
                    e.currentTarget.style.transform = 'translateY(-2px) scale(1.05)';
                    e.currentTarget.style.filter = 'drop-shadow(0 4px 8px rgba(0,0,0,0.4))';
                    
                    // Show glow
                    const glow = e.currentTarget.previousElementSibling as SVGElement;
                    if (glow) {
                      glow.style.opacity = '1';
                    }
                    
                    // Show value label and make it jump up with the bar
                    const label = e.currentTarget.nextElementSibling as SVGElement;
                    if (label) {
                      label.style.opacity = '1';
                      label.style.transform = 'translateY(-12px)';
                    }
                  }}
                  onMouseLeave={(e) => {
                    setTooltip(prev => ({ ...prev, visible: false }));
                    
                    // Reset styles
                    e.currentTarget.style.fill = color;
                    e.currentTarget.style.transform = 'translateY(0) scale(1)';
                    e.currentTarget.style.filter = 'drop-shadow(0 2px 4px rgba(0,0,0,0.3))';
                    
                    // Hide glow
                    const glow = e.currentTarget.previousElementSibling as SVGElement;
                    if (glow) {
                      glow.style.opacity = '0';
                    }
                    
                    // Hide value label and reset position
                    const label = e.currentTarget.nextElementSibling as SVGElement;
                    if (label) {
                      label.style.opacity = '0';
                      label.style.transform = 'translateY(0)';
                    }
                  }}
                >
                  {/* Animated bar growth */}
                  <animate
                    attributeName="height"
                    from="0"
                    to={barHeight.toString()}
                    dur="0.8s"
                    begin="0s"
                    fill="freeze"
                  />
                  <animate
                    attributeName="y"
                    from={(margin.top + zeroY).toString()}
                    to={barY.toString()}
                    dur="0.8s"
                    begin="0s"
                    fill="freeze"
                  />
                  
                  {/* Neon breathing effect */}
                  <animate
                    attributeName="opacity"
                    values="0.8;1;0.8"
                    dur={item.amount >= 0 ? '2.5s' : '3.2s'}
                    repeatCount="indefinite"
                    begin="1s"
                  />
                </rect>
                
                {/* Value label on hover */}
                <text
                  x={barX + barWidth / 2}
                  y={item.amount >= 0 ? barY - 12 : barY + barHeight + 20}
                  textAnchor="middle"
                  fill={color}
                  fontSize="11"
                  fontWeight="bold"
                  opacity="0"
                  className="transition-all duration-200 pointer-events-none"
                  style={{
                    transform: 'translateY(0)'
                  }}
                >
                  ${Math.abs(item.amount).toLocaleString()}
                </text>
              </g>
            );
          })}

          {/* Y axis labels with animations */}
          {(() => {
            const ticks = !hasNegativeData 
              ? [0, maxPositive/4, maxPositive/2, (maxPositive*3)/4, maxPositive]
              : [minNegative, minNegative/2, 0, maxPositive/2, maxPositive];
            
            return ticks.map((value, i) => (
            <g key={i}>
              {/* Grid line */}
              <line
                x1={margin.left}
                y1={margin.top + yScale(value)}
                x2={margin.left + innerWidth}
                y2={margin.top + yScale(value)}
                stroke={value === 0 ? 'rgba(255, 255, 255, 0.25)' : 'rgba(255, 255, 255, 0.08)'}
                strokeWidth={value === 0 ? 2 : 1}
                strokeDasharray={value === 0 ? 'none' : '3,3'}
                opacity="0"
              >
                <animate
                  attributeName="opacity"
                  from="0"
                  to="1"
                  dur="1s"
                  begin={`${i * 0.1}s`}
                  fill="freeze"
                />
              </line>
              
              <text
                x={margin.left - 25}
                y={margin.top + yScale(value) + 4}
                textAnchor="end"
                fill="#94a3b8"
                fontSize="12"
                opacity="0"
              >
                ${value.toLocaleString()}
                <animate
                  attributeName="opacity"
                  from="0"
                  to="1"
                  dur="0.5s"
                  begin={`${0.8 + i * 0.05}s`}
                  fill="freeze"
                />
              </text>
            </g>
            ));
          })()}

          {/* X axis labels with stagger animation */}
          {data.map((item, index) => (
            <text
              key={index}
              x={margin.left + xScale(index)}
              y={margin.top + innerHeight + 35}
              textAnchor="middle"
              fill="#94a3b8"
              fontSize="12"
              transform={`rotate(-45, ${margin.left + xScale(index)}, ${margin.top + innerHeight + 35})`}
              opacity="0"
            >
              {item.displayPeriod}
              <animate
                attributeName="opacity"
                from="0"
                to="1"
                dur="0.4s"
                begin={`${1.2 + index * 0.05}s`}
                fill="freeze"
              />
            </text>
          ))}
        </svg>

        {/* Custom Tooltip */}
        {tooltip.visible && tooltip.data && (
          <div
            className="absolute pointer-events-none z-50 bg-[#0b0f17] border border-white/10 rounded-lg p-3 text-sm text-white shadow-xl"
            style={{
              left: tooltip.x,
              top: tooltip.y,
              transform: 'translateX(-50%)'
            }}
          >
            <div className="font-medium mb-1">{tooltip.data.displayPeriod}</div>
            <div className="space-y-1">
              <div className="text-lime-300">
                Payouts: ${Math.round(tooltip.data.payouts).toLocaleString()}
              </div>
              <div className="text-red-300">
                Costs: ${Math.round(tooltip.data.costs).toLocaleString()}
              </div>
              <div className={`font-bold ${tooltip.data.amount >= 0 ? 'text-lime-200' : 'text-red-200'}`}>
                PnL: {tooltip.data.amount >= 0 ? '+' : ''}${Math.round(tooltip.data.amount).toLocaleString()}
              </div>
            </div>
          </div>
        )}
      </div>
      )}
      
      {!hasData && (
        <div className="absolute inset-0 flex items-center justify-center bg-[#050810]/90 rounded-xl">
          <div className="text-center text-white/60">
            <div className="mb-2 text-lg">No PnL data yet</div>
            <div className="text-sm">Add challenges with costs and payouts to see your PnL!</div>
          </div>
        </div>
      )}
    </NeonCard>
  );
};
