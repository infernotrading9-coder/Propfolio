import React from 'react';

/**
 * The dashboard's monthly / weekly P&L card — the holographic one with the
 * Net P&L hero, the ROI pill and the Costs / Payouts bars.
 *
 * EXTRACTED, NOT REWRITTEN. This markup is the verbatim body of the card that
 * used to live inline in `CustomPnLChart.tsx`, moved here so BOTH surfaces
 * render the same component. Daniel asked for the Instant tab to show "the
 * exact same monthly P&L cards from the dashboard" — sharing the component is
 * the only way that stays true after the next tweak to either side. Drift
 * between two copies of a card is exactly the failure that produced three
 * divergent copies of the personal-trade maths in Oct 2026.
 *
 * It is PRESENTATIONAL ONLY: it takes costs and payouts and prints them. No
 * totals are derived here beyond `pnl = payouts - costs`, which is the same
 * subtraction the dashboard has always done inside the card.
 *
 * The parent decides which periods to show — the dashboard and the Instant tab
 * both drop any period with no costs and no payouts.
 */
export interface PnLPeriodCardItem {
  /** 'YYYY-MM' monthly, 'YYYY-MM-DD' weekly. The year badge reads period.split('-')[0]. */
  period: string;
  /** 'Nov' monthly, 'Nov 9–15' weekly — the year is shown separately. */
  displayPeriod: string;
  costs: number;
  payouts: number;
}

export const PnLPeriodCard: React.FC<{ item: PnLPeriodCardItem; isMobile: boolean }> = ({
  item,
  isMobile,
}) => {
  const pnl = item.payouts - item.costs;
  const pnlPositive = pnl >= 0;

  return (
    <div className="group relative perspective-1000 cursor-pointer select-none caret-transparent">
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
};

export default PnLPeriodCard;
