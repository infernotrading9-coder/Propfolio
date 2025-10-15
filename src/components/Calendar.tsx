import React from 'react';
import { DayEntry } from '../utils/calendarStorage';
import { NeonCard } from './NeonCard';
import { Rocket, TrendingDown, Minus, ChevronLeft, ChevronRight } from 'lucide-react';

const getAllDaysInMonth = (year: number, month: number): { date: string; dayOfWeek: number; isCurrentMonth: boolean }[] => {
  const days: { date: string; dayOfWeek: number; isCurrentMonth: boolean }[] = [];
  
  // Get first day of the month
  const firstDay = new Date(year, month, 1);
  
  // Get the first Monday of the calendar view
  const firstDayOfWeek = firstDay.getDay(); // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
  const mondayOffset = firstDayOfWeek === 0 ? 6 : firstDayOfWeek - 1; // Convert to Monday = 0
  
  // Calculate the start date (first Monday of calendar view)
  const startDate = new Date(year, month, 1 - mondayOffset);
  
  // Generate 42 days (6 weeks) starting from Monday
  for (let i = 0; i < 42; i++) {
    const currentDate = new Date(startDate);
    currentDate.setDate(startDate.getDate() + i);
    
    const iso = currentDate.toISOString().slice(0, 10);
    const dayOfWeek = currentDate.getDay();
    const isCurrentMonth = currentDate.getMonth() === month;
    
    days.push({ date: iso, dayOfWeek, isCurrentMonth });
  }
  
  return days;
};

export const Calendar: React.FC<{
  entries: DayEntry[];
  onDayUpdate?: (date: string, followedRules: boolean | null) => void;
  isArchived?: boolean;
}> = ({ entries, onDayUpdate, isArchived = false }) => {
  const [cursor, setCursor] = React.useState(() => new Date());
  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const days = React.useMemo(() => getAllDaysInMonth(year, month), [year, month]);
  const byDate = React.useMemo(() => Object.fromEntries(entries.map(e => [e.date, e])), [entries]);
  
  const weekdays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  // Add CSS animations
  React.useEffect(() => {
    if (!document.getElementById('calendar-animations')) {
      const style = document.createElement('style');
      style.id = 'calendar-animations';
      style.textContent = `
        @keyframes fadeInUp {
          0% { opacity: 0; transform: translateY(20px); }
          100% { opacity: 1; transform: translateY(0); }
        }
        @keyframes shimmer {
          0% { background-position: -1000px 0; }
          100% { background-position: 1000px 0; }
        }
        .calendar-shimmer {
          background: linear-gradient(
            90deg,
            transparent,
            rgba(255, 255, 255, 0.1),
            transparent
          );
          background-size: 1000px 100%;
          animation: shimmer 3s infinite;
        }
      `;
      document.head.appendChild(style);
    }
  }, []);

  // Handle day click - cycle through: null -> true -> false -> null
  const handleDayClick = (date: string, currentStatus: boolean | null) => {
    if (!onDayUpdate) return;
    
    let newStatus: boolean | null;
    if (currentStatus === null) {
      newStatus = true; // No Trade -> Rules Followed
    } else if (currentStatus === true) {
      newStatus = false; // Rules Followed -> Rules Broken
    } else {
      newStatus = null; // Rules Broken -> No Trade
    }
    
    onDayUpdate(date, newStatus);
  };

  return (
    <NeonCard className={`p-6 relative overflow-hidden ${isArchived ? 'bg-gradient-to-br from-red-900/10 to-red-800/5' : ''}`} glow={isArchived ? "red" : "purple"}>
      {/* Animated background elements */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-purple-400/20 to-transparent animate-pulse" />
        <div className="absolute -top-10 -right-10 w-32 h-32 bg-purple-500/5 rounded-full blur-xl animate-pulse" />
        <div className="absolute -bottom-10 -left-10 w-24 h-24 bg-cyan-500/5 rounded-full blur-xl animate-pulse" style={{ animationDelay: '1s' }} />
      </div>
      
      {/* Header with enhanced navigation */}
      <div className="relative flex items-center justify-between mb-6">
        <button 
          className={`group flex items-center gap-2 px-4 py-2 rounded-lg transition-all duration-300 hover:scale-105 ${
            isArchived 
              ? 'bg-gradient-to-r from-red-500/10 to-red-600/10 hover:from-red-500/20 hover:to-red-600/20 border border-red-500/30 hover:border-red-400/50 hover:shadow-lg hover:shadow-red-500/20'
              : 'bg-gradient-to-r from-purple-500/10 to-purple-600/10 hover:from-purple-500/20 hover:to-purple-600/20 border border-purple-500/30 hover:border-purple-400/50 hover:shadow-lg hover:shadow-purple-500/20'
          }`}
          onClick={() => setCursor(new Date(year, month - 1, 1))}
        >
          <ChevronLeft className={`w-4 h-4 transition-colors ${
            isArchived 
              ? 'text-red-300 group-hover:text-red-200'
              : 'text-purple-300 group-hover:text-purple-200'
          }`} />
          <span className={`font-medium transition-colors ${
            isArchived 
              ? 'text-red-200 group-hover:text-white'
              : 'text-purple-200 group-hover:text-white'
          }`}>Prev</span>
        </button>
        
        <div className="text-center">
          <div className="text-2xl font-black text-transparent bg-clip-text bg-gradient-to-r from-purple-300 via-cyan-300 to-purple-300 mb-1 animate-pulse">
            {cursor.toLocaleString(undefined, { month: 'long', year: 'numeric' })}
          </div>
          <div className={`text-xs uppercase tracking-wider font-medium ${
            isArchived ? 'text-red-300/60' : 'text-white/60'
          }`}>
            {isArchived ? 'Archived Trading Calendar (Read-Only)' : 'Challenge Trading Calendar'}
          </div>
        </div>
        
        <button 
          className={`group flex items-center gap-2 px-4 py-2 rounded-lg transition-all duration-300 hover:scale-105 ${
            isArchived 
              ? 'bg-gradient-to-r from-red-500/10 to-red-600/10 hover:from-red-500/20 hover:to-red-600/20 border border-red-500/30 hover:border-red-400/50 hover:shadow-lg hover:shadow-red-500/20'
              : 'bg-gradient-to-r from-purple-500/10 to-purple-600/10 hover:from-purple-500/20 hover:to-purple-600/20 border border-purple-500/30 hover:border-purple-400/50 hover:shadow-lg hover:shadow-purple-500/20'
          }`}
          onClick={() => setCursor(new Date(year, month + 1, 1))}
        >
          <span className={`font-medium transition-colors ${
            isArchived 
              ? 'text-red-200 group-hover:text-white'
              : 'text-purple-200 group-hover:text-white'
          }`}>Next</span>
          <ChevronRight className={`w-4 h-4 transition-colors ${
            isArchived 
              ? 'text-red-300 group-hover:text-red-200'
              : 'text-purple-300 group-hover:text-purple-200'
          }`} />
        </button>
      </div>
      {/* Enhanced weekday headers */}
      <div className="relative grid grid-cols-7 gap-3 mb-6">
        {weekdays.map((day, index) => (
          <div 
            key={day} 
            className="relative text-center py-3 px-2 rounded-lg bg-gradient-to-br from-white/5 to-white/10 border border-white/10 backdrop-blur-sm"
            style={{ animationDelay: `${index * 0.1}s` }}
          >
            <div className="text-sm font-bold text-transparent bg-clip-text bg-gradient-to-r from-cyan-300 to-purple-300 uppercase tracking-wider">
              {day}
            </div>
            <div className="absolute inset-x-0 bottom-0 h-0.5 bg-gradient-to-r from-transparent via-purple-400/30 to-transparent" />
          </div>
        ))}
      </div>
      
      {/* Enhanced Calendar grid */}
      <div className="relative grid grid-cols-7 gap-3">
        {days.map((dayInfo, index) => {
          const { date: d, isCurrentMonth } = dayInfo;
          const status = byDate[d]?.followedRules ?? null;
          
          // Enhanced styling based on status
          const baseColor = status === true 
            ? 'bg-gradient-to-br from-emerald-500/20 to-lime-500/30 border-emerald-400/60 text-emerald-100 shadow-[0_0_20px_rgba(16,185,129,0.4)] hover:shadow-[0_0_30px_rgba(16,185,129,0.6)]' 
            : status === false 
            ? 'bg-gradient-to-br from-rose-500/20 to-red-500/30 border-rose-400/60 text-rose-100 shadow-[0_0_20px_rgba(239,68,68,0.4)] hover:shadow-[0_0_30px_rgba(239,68,68,0.6)]' 
            : 'bg-gradient-to-br from-white/5 to-white/10 border-white/20 text-white/70 hover:bg-gradient-to-br hover:from-white/10 hover:to-white/20 hover:border-white/30';
          
          const color = isCurrentMonth 
            ? baseColor 
            : 'bg-gradient-to-br from-white/3 to-white/5 border-white/10 text-white/30 opacity-60';
            
          const label = status === true ? 'Rules Followed' : status === false ? 'Rules Broken' : 'No Trade';
          const Icon = status === true ? Rocket : status === false ? TrendingDown : Minus;
          const dayNum = new Date(d).getDate();
          const today = new Date().toISOString().slice(0, 10);
          const isToday = d === today;
          
          return (
            <div 
              key={d} 
              className={`group relative rounded-xl border backdrop-blur-sm px-4 py-6 text-center min-h-[140px] transform-gpu transition-all duration-300 ${
                isCurrentMonth && onDayUpdate 
                  ? 'cursor-pointer hover:scale-105 hover:-translate-y-1 ' + color
                  : color
              } ${isToday && isCurrentMonth ? 'ring-2 ring-cyan-400/50 ring-offset-2 ring-offset-transparent' : ''}`}
              onClick={() => isCurrentMonth && handleDayClick(d, status)}
              title={isCurrentMonth && onDayUpdate ? `Click to change: ${label}` : ''}
              style={{
                animationDelay: `${index * 0.02}s`,
                animation: 'fadeInUp 0.6s ease-out forwards'
              }}
            >
              {/* Today indicator */}
              {isToday && isCurrentMonth && (
                <div className="absolute -top-1 -right-1 w-3 h-3 bg-cyan-400 rounded-full animate-pulse shadow-[0_0_10px_rgba(34,211,238,0.8)]" />
              )}
              
              {/* Hover glow effect */}
              <div className={`absolute inset-0 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none ${
                status === true 
                  ? 'bg-gradient-to-br from-emerald-400/10 to-lime-400/10 shadow-[inset_0_1px_0_rgba(255,255,255,0.1)]'
                  : status === false
                  ? 'bg-gradient-to-br from-rose-400/10 to-red-400/10 shadow-[inset_0_1px_0_rgba(255,255,255,0.1)]'
                  : 'bg-gradient-to-br from-white/10 to-white/5 shadow-[inset_0_1px_0_rgba(255,255,255,0.1)]'
              }`} />
              
              <div className="relative z-10">
                <div className={`text-2xl font-black mb-3 transition-all duration-300 group-hover:scale-110 ${
                  isToday && isCurrentMonth 
                    ? 'text-transparent bg-clip-text bg-gradient-to-r from-cyan-300 to-purple-300'
                    : ''
                }`}>
                  {dayNum}
                </div>
                
                {isCurrentMonth && (
                  <>
                    <div className="flex justify-center mb-2">
                      <div className={`p-2 rounded-full transition-all duration-300 group-hover:scale-110 ${
                        status === true 
                          ? 'bg-emerald-500/20 shadow-[0_0_15px_rgba(16,185,129,0.3)]'
                          : status === false
                          ? 'bg-rose-500/20 shadow-[0_0_15px_rgba(239,68,68,0.3)]'
                          : 'bg-white/10 shadow-[0_0_10px_rgba(255,255,255,0.1)]'
                      }`}>
                        <Icon className={`w-4 h-4 transition-all duration-300 ${
                          onDayUpdate ? 'group-hover:rotate-12 group-hover:scale-110' : ''
                        }`} />
                      </div>
                    </div>
                    
                    <div className="text-xs font-semibold leading-tight mb-1 opacity-90 group-hover:opacity-100 transition-opacity">
                      {label}
                    </div>
                  </>
                )}
              </div>
              
              {/* Status indicator bar */}
              {isCurrentMonth && status !== null && (
                <div className={`absolute bottom-0 left-0 right-0 h-1 rounded-b-xl transition-all duration-300 ${
                  status === true 
                    ? 'bg-gradient-to-r from-emerald-400 to-lime-400'
                    : 'bg-gradient-to-r from-rose-400 to-red-400'
                }`} />
              )}
            </div>
          );
        })}
      </div>
    </NeonCard>
  );
};