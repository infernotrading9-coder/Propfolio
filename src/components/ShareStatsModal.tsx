import React, { useState } from 'react';
import { Challenge } from '../types';
import { ShareableStatsCard, type ShareStatKey } from './ShareableStatsCard';
import { X, Calendar, BarChart3 } from 'lucide-react';

interface ShareStatsModalProps {
  challenges: Challenge[];
  isOpen: boolean;
  onClose: () => void;
}

// Helper function to get week number (defined outside component to avoid hoisting issues)
const getWeekOfYear = (date: Date): number => {
  const startOfYear = new Date(date.getFullYear(), 0, 1);
  const pastDaysOfYear = (date.getTime() - startOfYear.getTime()) / 86400000;
  return Math.ceil((pastDaysOfYear + startOfYear.getDay() + 1) / 7);
};

export const ShareStatsModal: React.FC<ShareStatsModalProps> = ({ 
  challenges, 
  isOpen, 
  onClose 
}) => {
  const statOptions: { key: ShareStatKey; label: string }[] = [
    { key: 'capital', label: 'Capital Invested' },
    { key: 'payouts', label: 'Total Payouts' },
    { key: 'live', label: 'Funded Pass Rate' },
    { key: 'phase1', label: 'Phase 1 Pass' },
    { key: 'phase2', label: 'Phase 2 Pass' },
    { key: 'phase3', label: 'Phase 3 Pass' },
    { key: 'avgTime', label: 'Avg Time to Live' },
  ];
  const [timeframe, setTimeframe] = useState<'month' | 'week' | 'year' | 'all-time'>('month');
  const [selectedStats, setSelectedStats] = useState<ShareStatKey[]>(['capital', 'payouts']);
  const [selectedMonth, setSelectedMonth] = useState(() => {
    // Default to current month
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });
  const [selectedWeek, setSelectedWeek] = useState(() => {
    // Default to current week
    const now = new Date();
    const year = now.getFullYear();
    const weekOfYear = getWeekOfYear(now);
    return `${year}-W${String(weekOfYear).padStart(2, '0')}`;
  });
  const [selectedYear, setSelectedYear] = useState(() => {
    // Default to current year
    const now = new Date();
    return String(now.getFullYear());
  });

  // Generate available months and weeks
  const availableMonths = React.useMemo(() => {
    const currentDate = new Date();
    const months = [];
    
    // Generate last 12 months
    for (let i = 0; i < 12; i++) {
      const date = new Date(currentDate.getFullYear(), currentDate.getMonth() - i, 1);
      const monthStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      months.push(monthStr);
    }
    
    return months;
  }, []);
  
  const availableWeeks = React.useMemo(() => {
    const currentDate = new Date();
    const weeks = [];
    
    // Generate last 12 weeks
    for (let i = 0; i < 12; i++) {
      const date = new Date(currentDate.getTime() - (i * 7 * 24 * 60 * 60 * 1000));
      const year = date.getFullYear();
      const weekOfYear = getWeekOfYear(date);
      const weekStr = `${year}-W${String(weekOfYear).padStart(2, '0')}`;
      weeks.push(weekStr);
    }
    
    return weeks;
  }, []);
  
  const availableYears = React.useMemo(() => {
    const currentYear = new Date().getFullYear();
    const years = [];
    
    // Generate last 5 years
    for (let i = 0; i < 5; i++) {
      years.push(String(currentYear - i));
    }
    
    return years;
  }, []);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <div className="bg-[#020408] border border-white/10 rounded-2xl p-4 sm:p-6 max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-cyan-300 to-purple-300">
              Share Your Stats
            </h2>
            <p className="text-white/60 text-sm mt-1">
              Create a beautiful shareable image of your trading performance
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-white/10 rounded-lg transition-colors"
          >
            <X className="w-6 h-6 text-white/60 hover:text-white" />
          </button>
        </div>

        {/* Timeframe Selection */}
        <div className="mb-6">
          <label className="block text-sm font-medium text-white/80 mb-3">
            Choose Timeframe
          </label>
          <div className="flex flex-wrap gap-3">
            <button
              onClick={() => setTimeframe('month')}
              className={`flex items-center gap-2 px-4 py-3 rounded-lg border transition-all duration-300 ${
                timeframe === 'month'
                  ? 'bg-gradient-to-r from-cyan-500/20 to-purple-500/20 border-cyan-400/50 text-cyan-200'
                  : 'bg-white/5 border-white/10 text-white/70 hover:bg-white/10 hover:border-white/20'
              }`}
            >
              <Calendar className="w-4 h-4" />
              Monthly
            </button>
            
            <button
              onClick={() => setTimeframe('week')}
              className={`flex items-center gap-2 px-4 py-3 rounded-lg border transition-all duration-300 ${
                timeframe === 'week'
                  ? 'bg-gradient-to-r from-cyan-500/20 to-purple-500/20 border-cyan-400/50 text-cyan-200'
                  : 'bg-white/5 border-white/10 text-white/70 hover:bg-white/10 hover:border-white/20'
              }`}
            >
              <Calendar className="w-4 h-4" />
              Weekly
            </button>
            
            <button
              onClick={() => setTimeframe('year')}
              className={`flex items-center gap-2 px-4 py-3 rounded-lg border transition-all duration-300 ${
                timeframe === 'year'
                  ? 'bg-gradient-to-r from-cyan-500/20 to-purple-500/20 border-cyan-400/50 text-cyan-200'
                  : 'bg-white/5 border-white/10 text-white/70 hover:bg-white/10 hover:border-white/20'
              }`}
            >
              <BarChart3 className="w-4 h-4" />
              Yearly
            </button>
            
            <button
              onClick={() => setTimeframe('all-time')}
              className={`flex items-center gap-2 px-4 py-3 rounded-lg border transition-all duration-300 ${
                timeframe === 'all-time'
                  ? 'bg-gradient-to-r from-cyan-500/20 to-purple-500/20 border-cyan-400/50 text-cyan-200'
                  : 'bg-white/5 border-white/10 text-white/70 hover:bg-white/10 hover:border-white/20'
              }`}
            >
              <BarChart3 className="w-4 h-4" />
              All-Time
            </button>
          </div>
        </div>

        {/* Month Selection (only for monthly timeframe) */}
        {timeframe === 'month' && (
          <div className="mb-6">
            <label className="block text-sm font-medium text-white/80 mb-3">
              Select Month
            </label>
            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-white focus:border-cyan-400/50 focus:outline-none focus:ring-2 focus:ring-cyan-500/30"
            >
              {availableMonths.map(month => {
                // Parse year and month manually to avoid timezone issues
                const [year, monthNum] = month.split('-');
                const monthNames = [
                  'January', 'February', 'March', 'April', 'May', 'June',
                  'July', 'August', 'September', 'October', 'November', 'December'
                ];
                const formattedMonth = `${monthNames[parseInt(monthNum) - 1]} ${year}`;
                
                return (
                  <option key={month} value={month} className="bg-gray-800">
                    {formattedMonth}
                  </option>
                );
              })}
            </select>
          </div>
        )}
        
        {/* Year Selection (only for yearly timeframe) */}
        {timeframe === 'year' && (
          <div className="mb-6">
            <label className="block text-sm font-medium text-white/80 mb-3">
              Select Year
            </label>
            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(e.target.value)}
              className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-white focus:border-cyan-400/50 focus:outline-none focus:ring-2 focus:ring-cyan-500/30"
            >
              {availableYears.map(year => (
                <option key={year} value={year} className="bg-gray-800">
                  {year}
                </option>
              ))}
            </select>
          </div>
        )}
        
        {/* Week Selection (only for weekly timeframe) */}
        {timeframe === 'week' && (
          <div className="mb-6">
            <label className="block text-sm font-medium text-white/80 mb-3">
              Select Week
            </label>
            <select
              value={selectedWeek}
              onChange={(e) => setSelectedWeek(e.target.value)}
              className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-white focus:border-cyan-400/50 focus:outline-none focus:ring-2 focus:ring-cyan-500/30"
            >
              {availableWeeks.map(week => {
                const [year, weekPart] = week.split('-W');
                const formattedWeek = `Week ${parseInt(weekPart)} ${year}`;
                
                return (
                  <option key={week} value={week} className="bg-gray-800">
                    {formattedWeek}
                  </option>
                );
              })}
            </select>
          </div>
        )}

        <div className="mb-6">
          <label className="block text-sm font-medium text-white/80 mb-3">
            Choose Stats To Share
          </label>
          <div className="flex flex-wrap gap-2">
            {statOptions.map((option) => {
              const active = selectedStats.includes(option.key);
              return (
                <button
                  key={option.key}
                  onClick={() => {
                    setSelectedStats((prev) => {
                      if (prev.includes(option.key)) {
                        const next = prev.filter((k) => k !== option.key);
                        return next.length > 0 ? next : prev;
                      }
                      return [...prev, option.key];
                    });
                  }}
                  className={`px-3 py-2 rounded-lg border text-sm transition-all duration-300 ${
                    active
                      ? 'bg-gradient-to-r from-cyan-500/20 to-purple-500/20 border-cyan-400/50 text-cyan-200'
                      : 'bg-white/5 border-white/10 text-white/70 hover:bg-white/10 hover:border-white/20'
                  }`}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Preview Card */}
        <div className="flex justify-center overflow-x-auto pb-2">
          <ShareableStatsCard 
            challenges={challenges}
            timeframe={timeframe}
            selectedMonth={timeframe === 'month' ? selectedMonth : undefined}
            selectedWeek={timeframe === 'week' ? selectedWeek : undefined}
            selectedYear={timeframe === 'year' ? selectedYear : undefined}
            selectedStats={selectedStats}
          />
        </div>

      </div>
    </div>
  );
};
