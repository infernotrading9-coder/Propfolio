import React, { useMemo, useState, useEffect } from 'react';
import { NeonCard } from './NeonCard';
import { Challenge, PropFirm } from '../types';
import { PieChart, BarChart3, Target, Trophy } from 'lucide-react';

type ChartView = 'firmAnalysis' | 'strategyPerformance' | 'challengeType' | 'topPerformers';
type FirmView = 'exposure' | 'roi' | 'profit';

export const AdditionalCharts: React.FC<{ 
  challenges: Challenge[];
  firms: PropFirm[];
  selectedYear: string;
}> = ({ challenges, firms, selectedYear }) => {
  
  // Add CSS animation for rocket float effect
  React.useEffect(() => {
    if (!document.getElementById('rocket-animations')) {
      const style = document.createElement('style');
      style.id = 'rocket-animations';
      style.textContent = `
        @keyframes float {
          0%, 100% { transform: translateY(0px) rotate(0deg); }
          25% { transform: translateY(-8px) rotate(1deg); }
          50% { transform: translateY(-5px) rotate(0deg); }
          75% { transform: translateY(-12px) rotate(-1deg); }
        }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @keyframes fadeInUp {
          from {
            opacity: 0;
            transform: translateY(20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `;
      document.head.appendChild(style);
    }
  }, []);
  const [activeView, setActiveView] = useState<ChartView>('firmAnalysis');
  const [firmView, setFirmView] = useState<FirmView>('roi');
  const [isMobile, setIsMobile] = useState(false);
  
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);
  

  // Firm Exposure Data (Pie Chart)
  const firmExposureData = useMemo(() => {
    const firmCosts: Record<string, { name: string; cost: number; count: number }> = {};
    
    // Filter out invalid challenges
    const validChallenges = challenges.filter(challenge => challenge && challenge.propFirmId);
    
    validChallenges.forEach(challenge => {
      const startYear = challenge.startDate?.slice(0, 4);
      if (startYear !== selectedYear) return;
      const firm = firms.find(f => f.id === challenge.propFirmId);
      const firmName = firm?.name || 'Unknown';
      
      if (!firmCosts[firmName]) {
        firmCosts[firmName] = { name: firmName, cost: 0, count: 0 };
      }
      
      firmCosts[firmName].cost += challenge.cost || 0;
      firmCosts[firmName].count += 1;
    });

    const totalCost = Object.values(firmCosts).reduce((sum, firm) => sum + firm.cost, 0);
    
    return Object.values(firmCosts)
      .map(firm => ({
        ...firm,
        percentage: totalCost > 0 ? (firm.cost / totalCost) * 100 : 0
      }))
      .sort((a, b) => b.cost - a.cost);
  }, [challenges, firms]);

  // Firm Profit Data (Pie Chart)
  const firmProfitData = useMemo(() => {
    const firmProfits: Record<string, { name: string; profit: number; count: number; cost: number; payouts: number }> = {};
    
    // Filter out invalid challenges
    const validChallenges = challenges.filter(challenge => challenge && challenge.propFirmId);
    
    validChallenges.forEach((challenge) => {
      const startYear = challenge.startDate?.slice(0, 4);
      if (startYear !== selectedYear) return;
      const firm = firms.find(f => f.id === challenge.propFirmId);
      const firmName = firm?.name || 'Unknown';
      
      const challengePayouts = Array.isArray(challenge.payouts) 
        ? challenge.payouts.reduce((sum, p) => sum + ((p?.date?.slice(0, 4) === selectedYear ? (p?.amount || 0) : 0)), 0) 
        : (typeof challenge.payouts === 'number' ? challenge.payouts : 0);
      
      // Only include challenges that actually have payouts for profit calculation
      if (challengePayouts > 0) {
        if (!firmProfits[firmName]) {
          firmProfits[firmName] = { name: firmName, profit: 0, count: 0, cost: 0, payouts: 0 };
        }
        
        const challengeProfit = challengePayouts - (challenge.cost || 0);
        
        firmProfits[firmName].profit += challengeProfit;
        firmProfits[firmName].cost += challenge.cost || 0;
        firmProfits[firmName].payouts += challengePayouts;
        firmProfits[firmName].count += 1;
      }
    });

    // Calculate total positive profit for percentage calculations
    const allFirms = Object.values(firmProfits);
    
    // Show all firms that have challenges with payouts
    const firmsWithChallenges = allFirms.filter(firm => firm.count > 0);
    
    if (firmsWithChallenges.length === 0) {
      return [];
    }
    
    // For percentage calculation, use absolute values or equal distribution
    const totalAbsoluteProfit = firmsWithChallenges.reduce((sum, firm) => sum + Math.abs(firm.profit), 0);
    
    const result = firmsWithChallenges
      .map(firm => ({
        ...firm,
        percentage: totalAbsoluteProfit > 0 
          ? (Math.abs(firm.profit) / totalAbsoluteProfit) * 100 
          : (100 / firmsWithChallenges.length) // Equal distribution if all profits are zero
      }))
      .sort((a, b) => b.profit - a.profit);
    
    return result;
  }, [challenges, firms]);

  // Firm ROI Data (Pie Chart)
  const firmROIData = useMemo(() => {
    const firmROIs: Record<string, { name: string; roi: number; count: number; cost: number; payouts: number; profit: number }> = {};
    
    // Filter out invalid challenges
    const validChallenges = challenges.filter(challenge => challenge && challenge.propFirmId);
    
    validChallenges.forEach((challenge) => {
      const startYear = challenge.startDate?.slice(0, 4);
      if (startYear !== selectedYear) return;
      const firm = firms.find(f => f.id === challenge.propFirmId);
      const firmName = firm?.name || 'Unknown';
      
      const challengePayouts = Array.isArray(challenge.payouts) 
        ? challenge.payouts.reduce((sum, p) => sum + ((p?.date?.slice(0, 4) === selectedYear ? (p?.amount || 0) : 0)), 0) 
        : (typeof challenge.payouts === 'number' ? challenge.payouts : 0);
      
      // Include all challenges for ROI calculation (both with and without payouts)
      if (!firmROIs[firmName]) {
        firmROIs[firmName] = { name: firmName, roi: 0, count: 0, cost: 0, payouts: 0, profit: 0 };
      }
      
      const challengeProfit = challengePayouts - (challenge.cost || 0);
      
      firmROIs[firmName].cost += challenge.cost || 0;
      firmROIs[firmName].payouts += challengePayouts;
      firmROIs[firmName].profit += challengeProfit;
      firmROIs[firmName].count += 1;
    });

    // Calculate ROI for each firm using same method as profit view
    const allFirms = Object.values(firmROIs).map(firm => {
      // Get the total cost from firmExposureData for consistency with profit view
      const firmExposure = firmExposureData.find(f => f.name === firm.name);
      const totalCost = firmExposure ? firmExposure.cost : firm.cost;
      
      return {
        ...firm,
        roi: totalCost > 0 ? (firm.profit / totalCost) * 100 : 0
      };
    });
    
    // Filter out firms with 0 ROI for better visualization, or include all if no positive ROI
    const firmsWithROI = allFirms.filter(firm => Math.abs(firm.roi) > 0.01);
    const dataToUse = (firmsWithROI.length > 0 ? firmsWithROI : allFirms)
      .sort((a, b) => b.roi - a.roi); // Rank by ROI % (descending)
    
    if (dataToUse.length === 0) {
      return [];
    }
    
    // For percentage calculation, use profit-weighted distribution
    const totalProfit = dataToUse.reduce((sum, firm) => sum + Math.max(0, firm.profit), 0);
    
    const result = dataToUse
      .map(firm => ({
        ...firm,
        percentage: totalProfit > 0 
          ? (Math.max(0, firm.profit) / totalProfit) * 100 
          : (100 / dataToUse.length) // Equal distribution if no profits
      }))
      .sort((a, b) => b.roi - a.roi); // Sort by ROI % descending
    
    return result;
  }, [challenges, firms, firmExposureData]);

  // Strategy Performance Data (using actual strategy field)
  const strategyData = useMemo(() => {
    // Group challenges by their actual strategy field
    const strategyGroups: Record<string, Challenge[]> = {};
    
    // Filter out invalid challenges
    const validChallenges = challenges.filter(challenge => challenge);
    
    validChallenges.forEach(challenge => {
      const strategyName = challenge.strategy?.trim() || 'No Strategy';
      if (!strategyGroups[strategyName]) {
        strategyGroups[strategyName] = [];
      }
      strategyGroups[strategyName].push(challenge);
    });

    const strategies = Object.entries(strategyGroups)
      .map(([name, challengeList]) => ({ name, challenges: challengeList }))
      .filter(s => s.challenges.length > 0)
      .sort((a, b) => b.challenges.length - a.challenges.length); // Sort by number of challenges

    return strategies.map(strategy => {
      const totalCost = strategy.challenges.reduce((sum, c) => {
        const startYear = c?.startDate?.slice(0, 4);
        return sum + (startYear === selectedYear ? (c?.cost || 0) : 0);
      }, 0);
      const totalPayouts = strategy.challenges.reduce((sum, c) => {
        if (Array.isArray(c?.payouts)) {
          return sum + c.payouts.reduce((pSum, p) => {
            return p?.date?.slice(0, 4) === selectedYear ? pSum + (p?.amount || 0) : pSum;
          }, 0);
        }
        return sum + (typeof c?.payouts === 'number' ? c.payouts : 0);
      }, 0);
      const pnl = totalPayouts - totalCost;
      const roi = totalCost > 0 ? (pnl / totalCost) * 100 : 0;

      return {
        name: strategy.name,
        pnl,
        roi,
        challenges: strategy.challenges.length,
        passRate: strategy.challenges.filter(c => {
          const startYear = c?.startDate?.slice(0, 4);
          return startYear === selectedYear &&
            c?.phases?.phase1?.completed && 
            c?.phases?.phase2?.completed && 
            c?.phases?.phase3?.completed;
        }).length / Math.max(1, strategy.challenges.filter(c => c?.startDate?.slice(0,4) === selectedYear).length) * 100
      };
    });
  }, [challenges, selectedYear]);

  // Challenge Type Performance Data
  const challengeTypeData = useMemo(() => {
    // Filter out invalid challenges first
    const validChallenges = challenges.filter(challenge => challenge);
    
    const types = [
      { name: '1 Phase', challenges: validChallenges.filter(c => c?.totalPhases === 1) },
      { name: '2 Phase', challenges: validChallenges.filter(c => c?.totalPhases === 2) },
      { name: '3 Phase', challenges: validChallenges.filter(c => c?.totalPhases === 3) },
    ].filter(t => t.challenges.length > 0);

    return types.map(type => {
      const totalCost = type.challenges.reduce((sum, c) => {
        const startYear = c?.startDate?.slice(0, 4);
        return sum + (startYear === selectedYear ? (c?.cost || 0) : 0);
      }, 0);
      const totalPayouts = type.challenges.reduce((sum, c) => {
        if (Array.isArray(c?.payouts)) {
          return sum + c.payouts.reduce((pSum, p) => {
            return p?.date?.slice(0, 4) === selectedYear ? pSum + (p?.amount || 0) : pSum;
          }, 0);
        }
        return sum + (typeof c?.payouts === 'number' ? c.payouts : 0);
      }, 0);
      const pnl = totalPayouts - totalCost;
      const roi = totalCost > 0 ? (pnl / totalCost) * 100 : 0;
      const profitableChallenges = type.challenges.filter(c => {
        const startYear = c?.startDate?.slice(0, 4);
        const payouts = Array.isArray(c?.payouts) 
          ? c.payouts.reduce((sum, p) => sum + (p?.date?.slice(0, 4) === selectedYear ? (p?.amount || 0) : 0), 0) 
          : (typeof c?.payouts === 'number' ? c.payouts : 0);
        const cost = startYear === selectedYear ? (c?.cost || 0) : 0;
        return payouts > cost;
      }).length;

      return {
        name: type.name,
        count: type.challenges.length,
        pnl,
        roi,
        totalCost,
        totalPayouts,
        avgCost: type.challenges.length > 0 ? totalCost / type.challenges.length : 0,
        profitableChallenges,
        profitableRate: type.challenges.length > 0 ? (profitableChallenges / type.challenges.length) * 100 : 0
      };
    });
  }, [challenges, selectedYear]);

  // State for selected top performer
  const [selectedPerformer, setSelectedPerformer] = useState<string | null>(null);

  // Calculate top performing accounts
  const topAccounts = useMemo(() => {
    // Filter out invalid challenges first
    const validChallenges = challenges.filter(challenge => challenge && challenge.id && challenge.propFirmId);
    
    // Create a sorted list of challenges by creation date to assign sequential numbers
    const sortedChallenges = [...validChallenges].sort((a, b) => 
      new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime()
    );
    
    const challengeNumbers = sortedChallenges.reduce((map, challenge, index) => {
      map[challenge.id] = index + 1;
      return map;
    }, {} as Record<string, number>);
    
    return validChallenges
      .map(challenge => {
        const firm = firms.find(f => f.id === challenge.propFirmId);
        const payouts = Array.isArray(challenge.payouts) 
          ? challenge.payouts.reduce((sum, p) => sum + (p?.date?.slice(0, 4) === selectedYear ? (p?.amount || 0) : 0), 0) 
          : (typeof challenge.payouts === 'number' ? challenge.payouts : 0);
        const cost = challenge.startDate?.slice(0, 4) === selectedYear ? (challenge.cost || 0) : 0;
        const profit = payouts - cost;
        const roi = cost > 0 ? (profit / cost) * 100 : 0;
        
        return {
          id: challenge.id,
          challengeNumber: challengeNumbers[challenge.id] || 0,
          firm: firm?.name || 'Unknown',
          accountSize: challenge.accountSize || 0,
          cost,
          payouts,
          profit,
          roi,
          hasPayouts: payouts > 0
        };
      })
      .filter(account => account.hasPayouts) // Only profitable accounts
      .sort((a, b) => b.roi - a.roi) // Sort by ROI descending
      .slice(0, 10); // Top 10 performers
  }, [challenges, firms, selectedYear]);


  const renderFirmAnalysisChart = () => {
    const hasExposureData = firmExposureData.length > 0;
    const hasProfitData = firmProfitData.length > 0;
    const hasROIData = firmROIData.length > 0;

    if (!hasExposureData && !hasProfitData && !hasROIData) {
      return (
        <div className="h-64 flex items-center justify-center text-white/60">
          <div className="text-center">
            <PieChart className="w-12 h-12 mx-auto mb-2 opacity-50" />
            <div>No firm data available</div>
            <div className="text-xs mt-1">Add challenges to see firm analysis</div>
          </div>
        </div>
      );
    }

    // Mobile card-based summary
    if (isMobile) {
      const currentData = firmView === 'exposure' ? firmExposureData : firmROIData;
      
      if (firmView === 'roi' && firmROIData.length === 0) {
        return (
          <div className="text-center py-8">
            <div className="text-blue-400 text-2xl mb-2">📊</div>
            <div className="text-white font-medium mb-2">No ROI Data Available</div>
            <div className="text-white/60 text-sm mb-4">Add challenges to calculate ROI</div>
            <button
              onClick={() => setFirmView('exposure')}
              className="px-3 py-2 bg-orange-500/20 border border-orange-400/50 text-orange-200 rounded text-sm"
            >
              View Cost Exposure
            </button>
          </div>
        );
      }
      
      return (
        <div className="space-y-3">
          {/* Mobile toggle - 2 column layout */}
          <div className="grid grid-cols-2 gap-2 mb-4">
            <button
              onClick={() => setFirmView('exposure')}
              className={`px-3 py-3 rounded text-sm font-medium transition-all ${
                firmView === 'exposure'
                  ? 'bg-orange-500/20 text-orange-200 border border-orange-400/50'
                  : 'bg-white/5 text-white/70 border border-white/10'
              }`}
            >
              <div className="text-xs opacity-70">💰</div>
              <div>Cost</div>
            </button>
            <button
              onClick={() => setFirmView('roi')}
              className={`px-3 py-3 rounded text-sm font-medium transition-all ${
                firmView === 'roi'
                  ? 'bg-blue-500/20 text-blue-200 border border-blue-400/50'
                  : 'bg-white/5 text-white/70 border border-white/10'
              }`}
              disabled={!hasROIData}
            >
              <div className="text-xs opacity-70">📊</div>
              <div>ROI</div>
            </button>
          </div>
          
          {/* Firm cards */}
          <div className="space-y-2">
            {currentData.map((item) => (
              <div key={item.name} className="bg-white/5 rounded-lg p-3 border border-white/10">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-white font-medium">{item.name}</span>
                  <span className="text-lg font-bold" style={{
                    color: firmView === 'exposure' ? '#fb923c' : '#3b82f6'
                  }}>
                    {firmView === 'roi'
                      ? `${(item as any).roi.toFixed(1)}%`
                      : `${item.percentage.toFixed(1)}%`}
                  </span>
                </div>
                {firmView === 'exposure' && (
                  <div className="flex justify-between text-sm">
                    <span className="text-white/60">Cost:</span>
                    <span className="text-white font-medium">
                      ${item.cost.toLocaleString()}
                    </span>
                  </div>
                )}
                <div className="flex justify-between text-sm">
                  <span className="text-white/60">Challenges:</span>
                  <span className="text-white/60">{item.count}</span>
                </div>
                {firmView === 'roi' && (
                  <div className="flex justify-between text-sm">
                    <span className="text-white/60">Total Invested:</span>
                    <span className="text-blue-400 font-medium">
                      ${(item as any).cost.toLocaleString()}
                    </span>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      );
    }

    // Desktop version - responsive container
    const currentData = firmView === 'exposure' ? firmExposureData : firmROIData;
    const colors = firmView === 'exposure' 
      ? ['#f97316', '#a855f7', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#84cc16']
      : ['#3b82f6', '#a855f7', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#84cc16'];
    
    
    if (firmView === 'roi' && firmROIData.length === 0) {
      return (
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="text-center">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-blue-500/10 border border-blue-500/20 flex items-center justify-center">
              <span className="text-blue-400 text-2xl">📊</span>
            </div>
            <div className="text-white font-medium mb-2">No ROI Data Available</div>
            <div className="text-white/60 text-sm mb-4">Add challenges to calculate return on investment</div>
            <button
              onClick={() => setFirmView('exposure')}
              className="px-4 py-2 bg-orange-500/20 border border-orange-400/50 text-orange-200 rounded-lg text-sm font-medium hover:bg-orange-500/30 transition-all duration-200"
            >
              View Cost Exposure Instead
            </button>
          </div>
        </div>
      );
    }
    
    const centerX = 120;
    const centerY = 120;
    const radius = 80;
    let startAngle = 0;

    return (
      <div className="w-full">
        <div className="flex items-start gap-6 min-h-[400px]">
          {/* Pie Chart */}
          <div className="flex-none">
            <svg width="240" height="240" className="overflow-visible">
              {currentData.map((item, index) => {
                const angle = (item.percentage / 100) * 2 * Math.PI;
                const endAngle = startAngle + angle;
                
                // Special case for 100% (full circle)
                let pathData;
                if (item.percentage >= 99.9) {
                  pathData = [
                    `M ${centerX} ${centerY - radius}`,
                    `A ${radius} ${radius} 0 1 1 ${centerX} ${centerY + radius}`,
                    `A ${radius} ${radius} 0 1 1 ${centerX} ${centerY - radius}`,
                    'Z'
                  ].join(' ');
                } else {
                  const x1 = centerX + Math.cos(startAngle) * radius;
                  const y1 = centerY + Math.sin(startAngle) * radius;
                  const x2 = centerX + Math.cos(endAngle) * radius;
                  const y2 = centerY + Math.sin(endAngle) * radius;
                  
                  const largeArcFlag = angle > Math.PI ? 1 : 0;
                  pathData = [
                    `M ${centerX} ${centerY}`,
                    `L ${x1} ${y1}`,
                    `A ${radius} ${radius} 0 ${largeArcFlag} 1 ${x2} ${y2}`,
                    'Z'
                  ].join(' ');
                }

                const labelX = centerX + Math.cos(startAngle + angle / 2) * (radius + 25);
                const labelY = centerY + Math.sin(startAngle + angle / 2) * (radius + 25);
                
                startAngle = endAngle;
                
                return (
                  <g key={item.name}>
                    <path
                      d={pathData}
                      fill={colors[index % colors.length]}
                      stroke={colors[index % colors.length]}
                      strokeWidth="1"
                      opacity="0.3"
                      style={{ filter: `blur(4px)` }}
                    />
                    <path
                      d={pathData}
                      fill={colors[index % colors.length]}
                      stroke={colors[index % colors.length]}
                      strokeWidth="2"
                      className="transition-all duration-300 hover:opacity-90 cursor-pointer"
                      style={{
                        filter: `drop-shadow(0 0 8px ${colors[index % colors.length]}40) drop-shadow(0 2px 4px rgba(0,0,0,0.3))`,
                        transformOrigin: `${centerX}px ${centerY}px`
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.transform = 'scale(1.05)';
                        e.currentTarget.style.filter = `drop-shadow(0 0 15px ${colors[index % colors.length]}80) drop-shadow(0 4px 8px rgba(0,0,0,0.4))`;
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.transform = 'scale(1)';
                        e.currentTarget.style.filter = `drop-shadow(0 0 8px ${colors[index % colors.length]}40) drop-shadow(0 2px 4px rgba(0,0,0,0.3))`;
                      }}
                    >
                      <title>{item.name}</title>
                      {!isMobile && (
                        <animate
                          attributeName="opacity"
                          from="0"
                          to="1"
                          dur="0.8s"
                          begin={`${index * 0.1}s`}
                          fill="freeze"
                        />
                      )}
                    </path>
                    
                    {item.percentage > 8 && (
                      <text
                        x={labelX}
                        y={labelY}
                        textAnchor="middle"
                        fill="white"
                        fontSize="11"
                        fontWeight="bold"
                        className="pointer-events-none"
                        opacity="0"
                      >
                        {item.percentage.toFixed(1)}%
                        {!isMobile && (
                          <animate
                            attributeName="opacity"
                            from="0"
                            to="1"
                            dur="0.5s"
                            begin={`${1 + index * 0.1}s`}
                            fill="freeze"
                          />
                        )}
                      </text>
                    )}
                  </g>
                );
              })}
            </svg>
          </div>
          
          {/* Toggle Switch - Compact Neon Style */}
          <div className="flex justify-center mx-6">
            <div className="relative bg-black/40 rounded-full p-0.5 border border-white/20" style={{
              boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.4), 0 0 15px rgba(255,255,255,0.03)'
            }}>
              {/* Sliding Background */}
              <div 
                className="absolute top-0.5 h-8 w-16 rounded-full transition-all duration-300 ease-out"
                style={{
                  left: firmView === 'exposure' ? '2px' : '66px',
                  background: firmView === 'exposure' 
                    ? 'linear-gradient(135deg, #fb923c, #f97316)'
                    : 'linear-gradient(135deg, #3b82f6, #2563eb)',
                  boxShadow: firmView === 'exposure'
                    ? '0 0 15px #fb923c60, 0 0 30px #fb923c30'
                    : '0 0 15px #3b82f660, 0 0 30px #3b82f630'
                }}
              />
              
              {/* Toggle Options */}
              <div className="relative flex">
                <button
                  onClick={() => setFirmView('exposure')}
                  className={`relative z-10 px-4 py-2 rounded-full text-xs font-bold uppercase tracking-wider transition-all duration-300 ${
                    firmView === 'exposure'
                      ? 'text-white'
                      : 'text-white/60 hover:text-white/80'
                  }`}
                  style={{
                    textShadow: firmView === 'exposure' 
                      ? '0 1px 2px rgba(0,0,0,0.7)'
                      : 'none'
                  }}
                >
                  Cost
                </button>
                
                <button
                  onClick={() => setFirmView('roi')}
                  disabled={!hasROIData}
                  className={`relative z-10 px-4 py-2 rounded-full text-xs font-bold uppercase tracking-wider transition-all duration-300 ${
                    firmView === 'roi'
                      ? 'text-white'
                      : hasROIData 
                      ? 'text-white/60 hover:text-white/80' 
                      : 'text-white/30 cursor-not-allowed'
                  }`}
                  style={{
                    textShadow: firmView === 'roi' 
                      ? '0 1px 2px rgba(0,0,0,0.7)'
                      : 'none'
                  }}
                >
                  ROI
                </button>
              </div>
            </div>
            
            {!hasROIData && (
              <div className="text-xs text-white/40 text-center mt-12 absolute">
                Add challenges to calculate ROI
              </div>
            )}
          </div>
          
          {/* Stats Legend - Enhanced with Animations */}
          <div className="flex-1 space-y-3 max-w-lg ml-auto py-4">
            {currentData.map((item, index) => (
              <div 
                key={item.name} 
                className="group relative bg-black/20 rounded-lg p-3 border border-white/5 hover:border-white/20 transition-all duration-300 hover:bg-white/5 cursor-pointer overflow-hidden"
                style={{
                  animationDelay: `${index * 0.1}s`,
                  animation: !isMobile ? 'fadeInUp 0.6s ease-out forwards' : 'none'
                }}
                onMouseEnter={(e) => {
                  if (!isMobile) {
                    e.currentTarget.style.transform = 'translateY(-2px) scale(1.02)';
                    e.currentTarget.style.boxShadow = `0 8px 25px ${colors[index % colors.length]}20, 0 0 20px ${colors[index % colors.length]}30`;
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isMobile) {
                    e.currentTarget.style.transform = 'translateY(0) scale(1)';
                    e.currentTarget.style.boxShadow = 'none';
                  }
                }}
              >
                {/* Animated Background Glow */}
                <div 
                  className="absolute inset-0 opacity-0 group-hover:opacity-10 transition-opacity duration-300 rounded-lg"
                  style={{
                    background: `radial-gradient(circle at 50% 50%, ${colors[index % colors.length]}40 0%, transparent 70%)`
                  }}
                />
                
                {/* Rank Badge */}
                <div className="absolute -top-1 -left-1">
                  <div 
                    className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold transition-all duration-300 group-hover:scale-110"
                    style={{
                      backgroundColor: colors[index % colors.length],
                      color: '#000',
                      boxShadow: `0 0 10px ${colors[index % colors.length]}60`,
                      filter: `drop-shadow(0 0 8px ${colors[index % colors.length]}40)`
                    }}
                  >
                    #{index + 1}
                  </div>
                </div>
                
                <div className="flex items-center gap-3 pl-2">
                  {/* Firm Badge with Logo */}
                  <div className="relative flex-shrink-0">
                    {/* Firm Badge Container */}
                    <div 
                      className="w-12 h-12 rounded-xl border-2 transition-all duration-300 group-hover:scale-110 flex items-center justify-center relative overflow-hidden"
                      style={{ 
                        backgroundColor: `${colors[index % colors.length]}20`,
                        borderColor: colors[index % colors.length],
                        boxShadow: `0 0 15px ${colors[index % colors.length]}40`,
                        filter: `drop-shadow(0 0 10px ${colors[index % colors.length]}30)`
                      }}
                    >
                      {/* Animated background gradient */}
                      <div 
                        className="absolute inset-0 opacity-20 group-hover:opacity-40 transition-opacity duration-300"
                        style={{
                          background: `linear-gradient(135deg, ${colors[index % colors.length]}60, transparent, ${colors[index % colors.length]}30)`
                        }}
                      />
                      
                      {/* Firm Logo/Icon based on name */}
                      <div className="relative z-10 font-bold text-xs text-center leading-tight">
                        {(() => {
                          const name = item.name.toLowerCase();
                          // Common prop firm logos/abbreviations
                          if (name.includes('ftmo')) return '🎯';
                          if (name.includes('myforexfunds') || name.includes('mff')) return '💎';
                          if (name.includes('funded') || name.includes('fnn')) return '🚀';
                          if (name.includes('apex')) return '⚡';
                          if (name.includes('topstep') || name.includes('top step')) return '👑';
                          if (name.includes('city') || name.includes('traders')) return '🏙️';
                          if (name.includes('blu') || name.includes('blue')) return '🔵';
                          if (name.includes('the5%ers') || name.includes('5ers')) return '📊';
                          if (name.includes('surge') || name.includes('trader')) return '📈';
                          if (name.includes('lux') || name.includes('luxury')) return '💰';
                          if (name.includes('smart') || name.includes('prop')) return '🧠';
                          if (name.includes('fast') || name.includes('track')) return '🏁';
                          if (name.includes('instant') || name.includes('funding')) return '⚡';
                          if (name.includes('nova') || name.includes('funding')) return '⭐';
                          if (name.includes('ea') || name.includes('electronic')) return '🤖';
                          // Default based on first letter
                          const firstLetter = item.name.charAt(0).toUpperCase();
                          return firstLetter;
                        })()} 
                      </div>
                      
                      {/* Firm Name Abbreviation */}
                      <div 
                        className="absolute -bottom-1 left-0 right-0 text-xs font-black text-center px-1 py-0.5 rounded-b-lg"
                        style={{
                          backgroundColor: colors[index % colors.length],
                          color: '#000'
                        }}
                      >
                        {item.name.length > 8 ? item.name.substring(0, 3) : item.name.substring(0, 4)}
                      </div>
                    </div>
                    
                    {/* Performance indicator ring */}
                    <div 
                      className="absolute -inset-1 rounded-xl animate-pulse opacity-30 group-hover:opacity-60 transition-opacity"
                      style={{ 
                        border: `2px solid ${colors[index % colors.length]}`,
                        animation: (firmView === 'roi' ? ((item as any).roi) : item.percentage) > 40 
                          ? 'spin 8s linear infinite' 
                          : 'pulse 2s ease-in-out infinite'
                      }}
                    />
                    
                    {/* Top performer crown */}
                    {index === 0 && (
                      <div className="absolute -top-2 -right-1 text-lg animate-bounce">
                        👑
                      </div>
                    )}
                  </div>
                  
                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <div className="text-white font-semibold truncate text-base group-hover:text-white transition-colors">
                        {item.name}
                      </div>
                      {/* Trending indicator */}
                      <div className="flex items-center space-x-1 opacity-70 group-hover:opacity-100 transition-opacity">
                        {(firmView === 'roi' ? ((item as any).roi) : item.percentage) > 30 && (
                          <span className="text-green-400 text-xs animate-pulse">🚀</span>
                        )}
                        {(firmView === 'roi' ? ((item as any).roi) : item.percentage) > 50 && (
                          <span className="text-yellow-400 text-xs animate-bounce">👑</span>
                        )}
                      </div>
                    </div>
                    
                    <div className="text-white/70 text-sm group-hover:text-white/90 transition-colors">
                      {firmView === 'exposure' ? (
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="text-blue-400">🎯</span>
                            <span className="font-medium">${item.cost.toLocaleString()} invested</span>
                          </div>
                          <div className="flex items-center gap-2 text-xs">
                            <span className="text-cyan-400">📊</span>
                            <span>{item.count} challenges</span>
                            <span className="text-white/50">•</span>
                            <span className="text-green-400">${(item.cost / item.count).toLocaleString()} avg</span>
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-1">
                          <div className="flex items-center gap-2 text-xs">
                            <span className="text-orange-400">💰</span>
                            <span>${(() => {
                              const firmExposure = firmExposureData.find(f => f.name === item.name);
                              return firmExposure ? firmExposure.cost.toLocaleString() : (item as any).cost.toLocaleString();
                            })()} cost</span>
                            <span className="text-white/50">•</span>
                            <span className="text-cyan-400">{item.count} challenges</span>
                          </div>
                          <div className="flex items-center gap-2 text-xs">
                            <span className="text-green-400">💎</span>
                            <span>${(item as any).payouts.toLocaleString()} earned</span>
                            <span className="text-white/50">•</span>
                            <span className={`${
                              (item as any).profit >= 0 ? 'text-green-400' : 'text-red-400'
                            }`}>
                              {(item as any).profit >= 0 ? '+$' : '-$'}{Math.abs((item as any).profit).toLocaleString()} profit
                            </span>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                  
                  {/* Percentage Badge */}
                  <div className="text-right flex-shrink-0 ml-2">
                    <div 
                      className="font-black text-xl transition-all duration-300 group-hover:scale-110"
                      style={{
                        color: firmView === 'exposure' 
                          ? colors[index % colors.length] 
                          : '#3b82f6',
                        textShadow: `0 0 15px ${firmView === 'exposure' 
                          ? colors[index % colors.length] 
                          : '#3b82f6'}80`,
                        filter: `drop-shadow(0 0 10px ${firmView === 'exposure' 
                          ? colors[index % colors.length] 
                          : '#3b82f6'}60)`
                      }}
                    >
                      {firmView === 'roi'
                        ? `${(item as any).roi.toFixed(1)}%`
                        : `${item.percentage.toFixed(1)}%`}
                    </div>
                    
                    {/* Performance indicator */}
                    <div className="mt-1">
                      {firmView === 'exposure' ? (
                        item.percentage > 40 ? (
                          <div className="text-blue-400 text-xs font-medium animate-pulse">🚀 Primary</div>
                        ) : item.percentage > 20 ? (
                          <div className="text-cyan-400 text-xs font-medium">⭐ Strategic</div>
                        ) : (
                          <div className="text-purple-400 text-xs font-medium">🔸 Diversified</div>
                        )
                      ) : (
                        (item as any).roi > 40 ? (
                          <div className="text-green-400 text-xs font-medium animate-pulse">📈 Dominant</div>
                        ) : (item as any).roi > 20 ? (
                          <div className="text-yellow-400 text-xs font-medium">⚡ Strong</div>
                        ) : (
                          <div className="text-blue-400 text-xs font-medium">💪 Active</div>
                        )
                      )}
                    </div>
                  </div>
                </div>
                
                {/* Bottom shine effect */}
                <div 
                  className="absolute bottom-0 left-0 right-0 h-px opacity-0 group-hover:opacity-60 transition-opacity duration-300"
                  style={{
                    background: `linear-gradient(90deg, transparent, ${colors[index % colors.length]}80, transparent)`
                  }}
                />
              </div>
            ))}          </div>
        </div>
      </div>
    );
  };

  const renderTopPerformersChart = () => {
    if (topAccounts.length === 0) {
      return (
        <div className="h-64 flex items-center justify-center text-white/60">
          <div className="text-center">
            <span className="text-6xl mb-4 block">💰</span>
            <div className="text-lg font-medium mb-2">No Profitable Accounts Yet</div>
            <div className="text-sm">Complete challenges with payouts to see your top performers!</div>
          </div>
        </div>
      );
    }

    // Mobile simplified version
    if (isMobile) {
      return (
        <div className="space-y-3">
          <div className="flex items-center gap-2 mb-4">
            <Trophy size={24} className="text-blue-400" fill="none" />
            <span className="text-white font-medium">Top Performers</span>
          </div>
          
          <div className="space-y-2">
            {topAccounts.slice(0, 5).map((account, index) => (
              <div 
                key={account.id} 
                className="bg-white/5 rounded-lg p-3 border border-white/10 cursor-pointer"
                onClick={() => setSelectedPerformer(selectedPerformer === account.id ? null : account.id)}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-yellow-400 bg-yellow-400/20 px-2 py-1 rounded">
                      #{index + 1}
                    </span>
                    <div>
                      <div className="text-white font-medium text-sm">{account.firm}</div>
                      <div className="text-white/60 text-xs">
                        ${account.accountSize?.toLocaleString()}
                      </div>
                    </div>
                  </div>
                  <div className={`font-bold text-sm px-2 py-1 rounded ${
                    account.roi >= 1000 ? 'text-green-400 bg-green-400/20' : 
                    account.roi >= 500 ? 'text-yellow-400 bg-yellow-400/20' : 'text-orange-400 bg-orange-400/20'
                  }`}>
                    {account.roi.toFixed(0)}%
                  </div>
                </div>
                
                <div className="flex justify-between text-xs">
                  <span className="text-green-400">${account.profit.toLocaleString()}</span>
                  <span className="text-white/60">Cost: ${account.cost.toLocaleString()}</span>
                </div>
                
                {selectedPerformer === account.id && (
                  <div className="mt-2 pt-2 border-t border-white/20 text-xs text-blue-400">
                    Challenge #{account.challengeNumber}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      );
    }

    // Desktop version - no scroll, bigger container
    return (
      <div>
        <div className="min-h-[500px] flex">
          <div className="w-96 flex items-center justify-center bg-black/20 rounded-l-lg border-r border-blue-500/30 overflow-hidden">
            <div className="relative w-full h-full flex items-center justify-center p-4">
              {/* Modern Space Shuttle/Rocket - Clean and Futuristic */}
              <div className="relative w-full h-full flex items-center justify-center">
                {/* Rocket with gentle hover animation */}
                <div className="relative hover:scale-105 transition-transform duration-500" style={{
                  animation: 'float 4s ease-in-out infinite'
                }}>
                  <svg width="320" height="400" viewBox="0 0 200 320" fill="none" className="relative z-10">
                    {/* Main body - chunky retro style */}
                    <rect x="70" y="80" width="60" height="140" rx="8" 
                          fill="url(#retroBodyGradient)" stroke="#ff6b35" strokeWidth="2" opacity="0.9">
                      <animate attributeName="fill" 
                               values="url(#retroBodyGradient);url(#retroBodyGradientAlt);url(#retroBodyGradient)" 
                               dur="4s" repeatCount="indefinite"/>
                    </rect>
                    
                    {/* Rounded dome top */}
                    <ellipse cx="100" cy="80" rx="30" ry="25" 
                             fill="url(#domeGradient)" stroke="#ff6b35" strokeWidth="2" opacity="0.95"/>
                    
                    {/* Control tower/bridge */}
                    <rect x="85" y="65" width="30" height="20" rx="15" 
                          fill="url(#bridgeGradient)" stroke="#ffa726" strokeWidth="1.5">
                      <animate attributeName="opacity" 
                               values="0.8;1;0.8" dur="2.5s" repeatCount="indefinite"/>
                    </rect>
                    
                    {/* Large circular windows */}
                    <circle cx="100" cy="100" r="12" 
                            fill="#26c6da" stroke="#ff6b35" strokeWidth="2" opacity="0.8">
                      <animate attributeName="fill" 
                               values="#26c6da;#4dd0e1;#00acc1;#26c6da" dur="3s" repeatCount="indefinite"/>
                    </circle>
                    <circle cx="100" cy="130" r="8" 
                            fill="#4dd0e1" stroke="#ff6b35" strokeWidth="1.5" opacity="0.7">
                      <animate attributeName="fill" 
                               values="#4dd0e1;#26c6da;#4dd0e1" dur="2s" repeatCount="indefinite"/>
                    </circle>
                    
                    {/* Side boosters - chunky cylinders */}
                    <rect x="40" y="160" width="20" height="60" rx="10" 
                          fill="url(#boosterGradient)" stroke="#ff8a50" strokeWidth="1.5"/>
                    <rect x="140" y="160" width="20" height="60" rx="10" 
                          fill="url(#boosterGradient)" stroke="#ff8a50" strokeWidth="1.5"/>
                    
                    {/* Landing legs/stabilizers */}
                    <path d="M70 200 L45 240 L55 245 L70 220 Z" 
                          fill="url(#legGradient)" stroke="#ff6b35" strokeWidth="1.5" opacity="0.85"/>
                    <path d="M130 200 L155 240 L145 245 L130 220 Z" 
                          fill="url(#legGradient)" stroke="#ff6b35" strokeWidth="1.5" opacity="0.85"/>
                    
                    {/* Decorative panels and vents */}
                    <rect x="75" y="150" width="50" height="8" rx="4" 
                          fill="#ffb74d" opacity="0.6">
                      <animate attributeName="opacity" values="0.4;0.9;0.4" dur="2.2s" repeatCount="indefinite"/>
                    </rect>
                    <rect x="80" y="170" width="40" height="6" rx="3" 
                          fill="#ffb74d" opacity="0.6">
                      <animate attributeName="opacity" values="0.6;1;0.6" dur="1.8s" repeatCount="indefinite"/>
                    </rect>
                    <rect x="85" y="185" width="30" height="4" rx="2" 
                          fill="#ffb74d" opacity="0.6">
                      <animate attributeName="opacity" values="0.3;0.8;0.3" dur="2.5s" repeatCount="indefinite"/>
                    </rect>
                    
                    {/* Antenna and communication dish */}
                    <line x1="100" y1="55" x2="100" y2="35" stroke="#ff8a50" strokeWidth="2"/>
                    <circle cx="100" cy="35" r="4" fill="#ffa726" stroke="#ff6b35" strokeWidth="1">
                      <animate attributeName="r" values="4;6;4" dur="1.5s" repeatCount="indefinite"/>
                      <animate attributeName="fill" values="#ffa726;#ffcc02;#ffa726" dur="1.5s" repeatCount="indefinite"/>
                    </circle>
                    
                    {/* Spinning radar dish */}
                    <g transform="translate(100, 75)">
                      <ellipse cx="0" cy="0" rx="8" ry="3" 
                               fill="#42a5f5" stroke="#ff6b35" strokeWidth="1" opacity="0.7">
                        <animateTransform attributeName="transform" type="rotate" 
                                        values="0;360" dur="3s" repeatCount="indefinite"/>
                      </ellipse>
                    </g>
                    
                    {/* Floating energy orbs around rocket */}
                    <g opacity="0.7">
                      <circle cx="140" cy="120" r="3" fill="#ff9800">
                        <animateTransform attributeName="transform" type="rotate" 
                                        values="0 100 150;360 100 150" dur="6s" repeatCount="indefinite"/>
                        <animate attributeName="opacity" values="0.4;1;0.4" dur="2s" repeatCount="indefinite"/>
                      </circle>
                      <circle cx="60" cy="140" r="2.5" fill="#ffc107">
                        <animateTransform attributeName="transform" type="rotate" 
                                        values="360 100 150;0 100 150" dur="8s" repeatCount="indefinite"/>
                        <animate attributeName="opacity" values="0.6;1;0.6" dur="1.5s" repeatCount="indefinite"/>
                      </circle>
                      <circle cx="120" cy="80" r="2" fill="#ff5722">
                        <animateTransform attributeName="transform" type="rotate" 
                                        values="0 100 150;360 100 150" dur="10s" repeatCount="indefinite"/>
                        <animate attributeName="opacity" values="0.3;0.9;0.3" dur="3s" repeatCount="indefinite"/>
                      </circle>
                    </g>
                    
                    <defs>
                      <linearGradient id="retroBodyGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stopColor="rgba(255, 107, 53, 0.3)"/>
                        <stop offset="50%" stopColor="rgba(255, 152, 0, 0.2)"/>
                        <stop offset="100%" stopColor="rgba(255, 183, 77, 0.4)"/>
                      </linearGradient>
                      <linearGradient id="retroBodyGradientAlt" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stopColor="rgba(255, 152, 0, 0.4)"/>
                        <stop offset="50%" stopColor="rgba(255, 183, 77, 0.2)"/>
                        <stop offset="100%" stopColor="rgba(255, 107, 53, 0.3)"/>
                      </linearGradient>
                      <linearGradient id="domeGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stopColor="rgba(255, 183, 77, 0.5)"/>
                        <stop offset="100%" stopColor="rgba(255, 107, 53, 0.6)"/>
                      </linearGradient>
                      <linearGradient id="bridgeGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stopColor="rgba(255, 167, 38, 0.6)"/>
                        <stop offset="100%" stopColor="rgba(255, 204, 2, 0.8)"/>
                      </linearGradient>
                      <linearGradient id="boosterGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                        <stop offset="0%" stopColor="rgba(255, 138, 80, 0.4)"/>
                        <stop offset="100%" stopColor="rgba(255, 107, 53, 0.6)"/>
                      </linearGradient>
                      <linearGradient id="legGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stopColor="rgba(255, 107, 53, 0.5)"/>
                        <stop offset="100%" stopColor="rgba(255, 183, 77, 0.7)"/>
                      </linearGradient>
                    </defs>
                  </svg>
                  
                  {/* Retro Rocket Exhaust */}
                  <div className="absolute bottom-[-45px] left-1/2 transform -translate-x-1/2 z-0">
                    <svg width="140" height="100" viewBox="0 0 90 70" fill="none">
                      {/* Main exhaust plume - chunky and wide */}
                      <path d="M45 10 Q35 25 25 50 Q35 45 45 45 Q55 45 65 50 Q55 25 45 10" 
                            fill="url(#retroExhaustMain)" opacity="0.9">
                        <animate attributeName="d" 
                                 values="M45 10 Q35 25 25 50 Q35 45 45 45 Q55 45 65 50 Q55 25 45 10;
                                         M45 10 Q30 20 20 45 Q40 40 45 40 Q50 40 70 45 Q60 20 45 10;
                                         M45 10 Q40 30 30 55 Q40 50 45 50 Q50 50 60 55 Q50 30 45 10;
                                         M45 10 Q35 25 25 50 Q35 45 45 45 Q55 45 65 50 Q55 25 45 10" 
                                 dur="0.6s" repeatCount="indefinite"/>
                      </path>
                      
                      {/* Side booster exhaust streams */}
                      <ellipse cx="25" cy="15" rx="8" ry="30" 
                               fill="url(#retroExhaustSide)" opacity="0.7">
                        <animate attributeName="ry" values="30;40;30" dur="0.8s" repeatCount="indefinite"/>
                        <animate attributeName="opacity" values="0.7;0.4;0.7" dur="0.8s" repeatCount="indefinite"/>
                      </ellipse>
                      <ellipse cx="65" cy="15" rx="8" ry="30" 
                               fill="url(#retroExhaustSide)" opacity="0.7">
                        <animate attributeName="ry" values="30;40;30" dur="0.8s" repeatCount="indefinite"/>
                        <animate attributeName="opacity" values="0.7;0.4;0.7" dur="0.8s" repeatCount="indefinite"/>
                      </ellipse>
                      
                      {/* Hot exhaust particles and sparks */}
                      <circle cx="40" cy="55" r="2.5" fill="#ff6b35" opacity="0.8">
                        <animate attributeName="cy" values="55;35;55" dur="1s" repeatCount="indefinite"/>
                        <animate attributeName="opacity" values="0.8;0.2;0.8" dur="1s" repeatCount="indefinite"/>
                        <animate attributeName="r" values="2.5;1;2.5" dur="1s" repeatCount="indefinite"/>
                      </circle>
                      <circle cx="50" cy="60" r="2" fill="#ff9800" opacity="0.9">
                        <animate attributeName="cy" values="60;25;60" dur="0.7s" repeatCount="indefinite"/>
                        <animate attributeName="opacity" values="0.9;0.1;0.9" dur="0.7s" repeatCount="indefinite"/>
                      </circle>
                      <circle cx="30" cy="50" r="1.5" fill="#ffb74d" opacity="0.6">
                        <animate attributeName="cy" values="50;30;50" dur="1.3s" repeatCount="indefinite"/>
                        <animate attributeName="opacity" values="0.6;0.1;0.6" dur="1.3s" repeatCount="indefinite"/>
                      </circle>
                      <circle cx="60" cy="52" r="1.8" fill="#ff5722" opacity="0.7">
                        <animate attributeName="cy" values="52;28;52" dur="0.9s" repeatCount="indefinite"/>
                        <animate attributeName="opacity" values="0.7;0.1;0.7" dur="0.9s" repeatCount="indefinite"/>
                      </circle>
                      
                      {/* Glowing exhaust core */}
                      <ellipse cx="45" cy="25" rx="6" ry="15" 
                               fill="#ffcc02" opacity="0.6">
                        <animate attributeName="ry" values="15;20;15" dur="0.3s" repeatCount="indefinite"/>
                        <animate attributeName="opacity" values="0.6;0.9;0.6" dur="0.3s" repeatCount="indefinite"/>
                      </ellipse>
                      
                      <defs>
                        <linearGradient id="retroExhaustMain" x1="0%" y1="0%" x2="0%" y2="100%">
                          <stop offset="0%" stopColor="#ffcc02" stopOpacity="0.9"/>
                          <stop offset="30%" stopColor="#ff9800" stopOpacity="0.8"/>
                          <stop offset="70%" stopColor="#ff6b35" stopOpacity="0.7"/>
                          <stop offset="100%" stopColor="#ff5722" stopOpacity="0.5"/>
                        </linearGradient>
                        <linearGradient id="retroExhaustSide" x1="0%" y1="0%" x2="0%" y2="100%">
                          <stop offset="0%" stopColor="#ffa726" stopOpacity="0.8"/>
                          <stop offset="50%" stopColor="#ff6b35" stopOpacity="0.6"/>
                          <stop offset="100%" stopColor="#ff5722" stopOpacity="0.4"/>
                        </linearGradient>
                      </defs>
                    </svg>
                  </div>
                  
                  {/* Glowing aura around rocket */}
                  <div className="absolute inset-0 rounded-full opacity-20" style={{
                    background: 'radial-gradient(circle, #3b82f6 0%, transparent 70%)',
                    animation: 'pulse 2s ease-in-out infinite'
                  }} />
                  
                  {/* Trailing sparkles */}
                  <div className="absolute top-1/2 left-[-20px] w-2 h-2 bg-blue-400 rounded-full opacity-60" style={{
                    animation: 'ping 1s ease-out infinite'
                  }} />
                  <div className="absolute top-1/3 right-[-15px] w-1.5 h-1.5 bg-yellow-400 rounded-full opacity-70" style={{
                    animation: 'ping 1.5s ease-out infinite',
                    animationDelay: '0.5s'
                  }} />
                  <div className="absolute top-2/3 left-[-10px] w-1 h-1 bg-green-400 rounded-full opacity-50" style={{
                    animation: 'ping 2s ease-out infinite',
                    animationDelay: '1s'
                  }} />
                </div>
              </div>
            </div>
          </div>
          
          <div className="flex-1 ml-12">
            <div className={`${
              topAccounts.length > 6 
                ? 'max-h-[380px] overflow-y-auto pr-2 space-y-3' 
                : 'grid grid-cols-2 gap-3 content-start'
            }`}>
              {topAccounts.map((account, index) => {
                const colors = ['#3b82f6', '#a855f7', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#84cc16'];
                const cardColor = colors[index % colors.length];
                
                return (
                  <div 
                    key={account.id} 
                    className={`group relative bg-black/20 rounded-lg p-4 border border-white/5 hover:border-white/20 transition-all duration-300 hover:bg-white/5 cursor-pointer overflow-hidden ${
                      topAccounts.length > 4 ? 'mb-3' : ''
                    }`}
                    style={{
                      animationDelay: `${index * 0.1}s`,
                      animation: !isMobile ? 'fadeInUp 0.6s ease-out forwards' : 'none'
                    }}
                    onClick={() => setSelectedPerformer(selectedPerformer === account.id ? null : account.id)}
                    onMouseEnter={(e) => {
                      if (!isMobile) {
                        e.currentTarget.style.transform = 'translateY(-2px) scale(1.02)';
                        e.currentTarget.style.boxShadow = `0 8px 25px ${cardColor}20, 0 0 20px ${cardColor}30`;
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!isMobile) {
                        e.currentTarget.style.transform = 'translateY(0) scale(1)';
                        e.currentTarget.style.boxShadow = 'none';
                      }
                    }}
                  >
                    {/* Animated Background Glow */}
                    <div 
                      className="absolute inset-0 opacity-0 group-hover:opacity-10 transition-opacity duration-300 rounded-lg"
                      style={{
                        background: `radial-gradient(circle at 50% 50%, ${cardColor}40 0%, transparent 70%)`
                      }}
                    />
                    
                    {/* Rank Badge */}
                    <div className="absolute -top-1 -right-1">
                      <div 
                        className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all duration-300 group-hover:scale-110"
                        style={{
                          backgroundColor: cardColor,
                          color: '#000',
                          boxShadow: `0 0 10px ${cardColor}60`,
                          filter: `drop-shadow(0 0 8px ${cardColor}40)`
                        }}
                      >
                        #{index + 1}
                      </div>
                    </div>
                    
                    {/* Trophy indicator for top 3 */}
                    {index < 3 && (
                      <div className="absolute top-2 left-2">
                        <div className={`text-lg animate-bounce ${
                          index === 0 ? 'text-yellow-400' : index === 1 ? 'text-gray-300' : 'text-orange-400'
                        }`}>
                          {index === 0 ? '🥇' : index === 1 ? '🥈' : '🥉'}
                        </div>
                      </div>
                    )}
                    
                    <div className="relative z-10 pt-2">
                      {/* Firm Name with Animation */}
                      <div className="mb-3">
                        <div className="flex items-center gap-2 mb-1">
                          <div 
                            className="w-3 h-3 rounded-full flex-shrink-0 transition-all duration-300 group-hover:scale-125"
                            style={{ 
                              backgroundColor: cardColor,
                              boxShadow: `0 0 8px ${cardColor}60`,
                              filter: `drop-shadow(0 0 6px ${cardColor}40)`
                            }}
                          />
                          <div className="text-white font-bold text-sm truncate group-hover:text-white transition-colors">
                            {account.firm}
                          </div>
                          {/* Performance indicators */}
                          <div className="flex items-center space-x-1 opacity-70 group-hover:opacity-100 transition-opacity">
                            {account.roi >= 1000 && (
                              <span className="text-green-400 text-xs animate-pulse">🚀</span>
                            )}
                            {account.roi >= 500 && (
                              <span className="text-yellow-400 text-xs animate-bounce">👑</span>
                            )}
                          </div>
                        </div>
                        <div className="text-white/60 text-xs pl-5">
                          ${account.accountSize?.toLocaleString()}
                        </div>
                      </div>
                      
                      {/* ROI Badge with Challenge Number */}
                      <div className="mb-3 flex items-center gap-3">
                        <div 
                          className={`inline-block font-black text-sm px-3 py-2 rounded-lg border transition-all duration-300 group-hover:scale-105 ${
                            account.roi >= 1000 
                              ? 'text-green-200 bg-green-500/20 border-green-400/50' 
                              : account.roi >= 500 
                              ? 'text-yellow-200 bg-yellow-500/20 border-yellow-400/50' 
                              : 'text-orange-200 bg-orange-500/20 border-orange-400/50'
                          }`}
                          style={{
                            textShadow: account.roi >= 1000 
                              ? '0 0 10px #22c55e' 
                              : account.roi >= 500 
                              ? '0 0 10px #f59e0b' 
                              : '0 0 10px #f97316',
                            boxShadow: account.roi >= 1000 
                              ? '0 0 15px #22c55e40' 
                              : account.roi >= 500 
                              ? '0 0 15px #f59e0b40' 
                              : '0 0 15px #f9731640'
                          }}
                        >
                          {account.roi.toFixed(0)}% ROI
                        </div>
                        
                        <div className="flex items-center gap-2">
                          <span className="text-cyan-400">🏆</span>
                          <span className="font-medium text-blue-400 text-sm">Challenge #{account.challengeNumber}</span>
                        </div>
                      </div>
                      
                      {/* Stats with Icons and Colors */}
                      <div className="text-xs space-y-2">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="text-green-400">💎</span>
                            <span className="text-green-400 font-medium">Profit:</span>
                          </div>
                          <span 
                            className="text-white font-bold transition-all duration-300 group-hover:scale-110"
                            style={{
                              textShadow: '0 0 10px #22c55e80',
                              filter: 'drop-shadow(0 0 8px #22c55e60)'
                            }}
                          >
                            +${account.profit.toLocaleString()}
                          </span>
                        </div>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="text-orange-400">💰</span>
                            <span className="text-white/60">Cost:</span>
                          </div>
                          <span className="text-white/60">${account.cost.toLocaleString()}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="text-blue-400">📊</span>
                            <span className="text-blue-400">Earned:</span>
                          </div>
                          <span className="text-blue-200 font-medium">${account.payouts.toLocaleString()}</span>
                        </div>
                      </div>
                      
                    </div>
                    
                    {/* Bottom shine effect */}
                    <div 
                      className="absolute bottom-0 left-0 right-0 h-px opacity-0 group-hover:opacity-60 transition-opacity duration-300"
                      style={{
                        background: `linear-gradient(90deg, transparent, ${cardColor}80, transparent)`
                      }}
                    />
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderStrategyBarChart = () => {
    if (strategyData.length === 0) {
      return (
        <div className="h-64 flex items-center justify-center text-white/60">
          <div className="text-center">
            <BarChart3 className="w-12 h-12 mx-auto mb-2 opacity-50" />
            <div>No strategy data available</div>
          </div>
        </div>
      );
    }

    // Mobile card-based summary
    if (isMobile) {
      return (
        <div className="space-y-3">
          <div className="text-center mb-4">
            <div className="text-white font-medium">Strategy Performance</div>
            <div className="text-white/60 text-sm">ROI by trading strategy</div>
          </div>
          
          <div className="space-y-2">
            {strategyData.map((strategy) => (
              <div key={strategy.name} className="bg-white/5 rounded-lg p-3 border border-white/10">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-white font-medium">{strategy.name}</span>
                  <span className={`text-lg font-bold ${
                    strategy.roi >= 0 ? 'text-green-400' : 'text-red-400'
                  }`}>
                    {strategy.roi >= 0 ? '+' : ''}{strategy.roi.toFixed(1)}%
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-white/60">PnL:</span>
                    <span className={`font-medium ${
                      strategy.pnl >= 0 ? 'text-green-400' : 'text-red-400'
                    }`}>
                      {strategy.pnl >= 0 ? '+' : ''}${strategy.pnl.toLocaleString()}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-white/60">Challenges:</span>
                    <span className="text-white/60">{strategy.challenges}</span>
                  </div>
                </div>
                <div className="mt-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-white/60">Pass Rate:</span>
                    <span className="text-blue-400">{strategy.passRate.toFixed(1)}%</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      );
    }

    const maxROI = Math.max(...strategyData.map(s => Math.abs(s.roi)), 100);
    const chartHeight = 200;
    const barWidth = 60;
    const spacing = 80;

    return (
      <div className="w-full flex justify-center">
        <div className="min-h-[400px] flex items-center justify-center max-w-full">
          <svg width="100%" viewBox={`0 0 ${strategyData.length * spacing + 100} ${chartHeight + 80}`} height={chartHeight + 80} className="max-w-full" preserveAspectRatio="xMidYMid meet">
            {strategyData.map((strategy, index) => {
              const barHeight = Math.abs(strategy.roi / maxROI) * (chartHeight - 40);
              const barX = 50 + index * spacing;
              const barY = strategy.roi >= 0 ? chartHeight/2 - barHeight : chartHeight/2;
              const color = strategy.roi >= 0 ? '#10b981' : '#ef4444';

              return (
                <g key={strategy.name}>
                  <rect
                    x={barX}
                    y={barY}
                    width={Math.max(barWidth, 2)}
                    height={barHeight}
                    fill={color}
                    rx="4"
                    className="transition-all duration-300 hover:opacity-80"
                    style={{ filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.3))' }}
                  >
                    {!isMobile && (
                      <animate
                        attributeName="height"
                        from="0"
                        to={Math.max(barHeight, 2).toString()}
                        dur="0.8s"
                        begin={`${index * 0.1}s`}
                        fill="freeze"
                      />
                    )}
                  </rect>

                  <text
                    x={barX + barWidth/2}
                    y={strategy.roi >= 0 ? barY - 8 : barY + barHeight + 16}
                    textAnchor="middle"
                    fill={color}
                    fontSize="12"
                    fontWeight="bold"
                    opacity="0"
                  >
                    {strategy.roi.toFixed(1)}%
                    <animate
                      attributeName="opacity"
                      from="0"
                      to="1"
                      dur="0.5s"
                      begin={`${0.5 + index * 0.1}s`}
                      fill="freeze"
                    />
                  </text>

                  <text
                    x={barX + barWidth/2}
                    y={chartHeight + 30}
                    textAnchor="middle"
                    fill="#94a3b8"
                    fontSize="11"
                    opacity="0"
                  >
                    {strategy.name}
                    <animate
                      attributeName="opacity"
                      from="0"
                      to="1"
                      dur="0.5s"
                      begin={`${1 + index * 0.1}s`}
                      fill="freeze"
                    />
                  </text>

                  <text
                    x={barX + barWidth/2}
                    y={chartHeight + 45}
                    textAnchor="middle"
                    fill="#64748b"
                    fontSize="10"
                    opacity="0"
                  >
                    {strategy.challenges} challenges
                    <animate
                      attributeName="opacity"
                      from="0"
                      to="1"
                      dur="0.5s"
                      begin={`${1.2 + index * 0.1}s`}
                      fill="freeze"
                    />
                  </text>
                </g>
              );
            })}

            <line
              x1="40"
              y1={chartHeight/2}
              x2={strategyData.length * spacing + 60}
              y2={chartHeight/2}
              stroke="rgba(255,255,255,0.2)"
              strokeWidth="1"
              strokeDasharray="3,3"
            />
          </svg>
        </div>
      </div>
    );
  };

  const renderChallengeTypeChart = () => {
    if (challengeTypeData.length === 0) {
      return (
        <div className="h-64 flex items-center justify-center text-white/60">
          <div className="text-center">
            <Target className="w-12 h-12 mx-auto mb-2 opacity-50" />
            <div>No challenge type data available</div>
          </div>
        </div>
      );
    }

    // Mobile card-based summary
    if (isMobile) {
      return (
        <div className="space-y-3">
          <div className="text-center mb-4">
            <div className="text-white font-medium">Challenge Type Performance</div>
            <div className="text-white/60 text-sm">Performance by phase count</div>
          </div>
          
          <div className="space-y-2">
            {challengeTypeData.map((type) => (
              <div key={type.name} className="bg-white/5 rounded-lg p-3 border border-white/10">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-white font-medium">{type.name} Challenges</span>
                  <span className={`text-lg font-bold ${
                    type.roi >= 0 ? 'text-green-400' : 'text-red-400'
                  }`}>
                    {type.roi >= 0 ? '+' : ''}{type.roi.toFixed(1)}%
                  </span>
                </div>
                
                <div className="grid grid-cols-2 gap-2 text-sm mb-2">
                  <div className="bg-white/5 rounded p-2">
                    <div className="text-white/60 text-xs">Invested</div>
                    <div className="text-white font-medium">${type.totalCost.toLocaleString()}</div>
                  </div>
                  <div className="bg-white/5 rounded p-2">
                    <div className="text-white/60 text-xs">PnL</div>
                    <div className={`font-medium ${
                      type.pnl >= 0 ? 'text-green-400' : 'text-red-400'
                    }`}>
                      {type.pnl >= 0 ? '+' : ''}${type.pnl.toLocaleString()}
                    </div>
                  </div>
                </div>
                
                <div className="flex justify-between text-sm">
                  <div>
                    <span className="text-white/60">Total: </span>
                    <span className="text-white">{type.count} challenges</span>
                  </div>
                  <div>
                    <span className="text-white/60">Profitable: </span>
                    <span className="text-blue-400">{type.profitableChallenges}/{type.count}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      );
    }

    const maxROI = Math.max(...challengeTypeData.map(c => Math.abs(c.roi)), 100);
    const chartWidth = 400;
    const barHeight = 50;
    const spacing = 80;
    const labelWidth = 120;

    return (
      <div className="w-full flex justify-center">
        <div className="min-h-[400px] flex items-center justify-center max-w-full">
          <svg width="100%" viewBox={`0 0 ${chartWidth + labelWidth + 100} ${challengeTypeData.length * spacing + 60}`} height={challengeTypeData.length * spacing + 60} className="max-w-full" preserveAspectRatio="xMidYMid meet">
            {challengeTypeData.map((type, index) => {
              const barWidth = Math.abs(type.roi / maxROI) * chartWidth;
              const barY = 40 + index * spacing;
              const barX = labelWidth + 20;
              const color = type.roi >= 0 ? '#10b981' : '#ef4444';

              return (
                <g key={type.name}>
                  {/* Type name label on the left */}
                  <text
                    x={labelWidth - 10}
                    y={barY + barHeight/2 + 5}
                    textAnchor="end"
                    fill="white"
                    fontSize="14"
                    fontWeight="bold"
                    opacity="0"
                  >
                    {type.name}
                    {!isMobile && (
                      <animate
                        attributeName="opacity"
                        from="0"
                        to="1"
                        dur="0.5s"
                        begin={`${0.5 + index * 0.1}s`}
                        fill="freeze"
                      />
                    )}
                  </text>

                  {/* Horizontal bar */}
                  <rect
                    x={barX}
                    y={barY}
                    width={Math.max(barWidth, 2)}
                    height={barHeight}
                    fill={color}
                    rx="6"
                    className="transition-all duration-300 hover:opacity-80"
                    style={{ filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.3))' }}
                  >
                    {!isMobile && (
                      <animate
                        attributeName="width"
                        from="0"
                        to={Math.max(barWidth, 2).toString()}
                        dur="0.8s"
                        begin={`${index * 0.1}s`}
                        fill="freeze"
                      />
                    )}
                  </rect>

                  {/* ROI percentage at the end of bar */}
                  <text
                    x={barX + barWidth + 10}
                    y={barY + barHeight/2 + 5}
                    textAnchor="start"
                    fill={color}
                    fontSize="12"
                    fontWeight="bold"
                    opacity="0"
                  >
                    {type.roi >= 0 ? '+' : ''}{type.roi.toFixed(1)}%
                    {!isMobile && (
                      <animate
                        attributeName="opacity"
                        from="0"
                        to="1"
                        dur="0.5s"
                        begin={`${0.7 + index * 0.1}s`}
                        fill="freeze"
                      />
                    )}
                  </text>

                  {/* Additional stats below the bar */}
                  <text
                    x={barX}
                    y={barY + barHeight + 15}
                    textAnchor="start"
                    fill="#94a3b8"
                    fontSize="10"
                    opacity="0"
                  >
                    ${type.totalCost.toLocaleString()} invested
                    {!isMobile && (
                      <animate
                        attributeName="opacity"
                        from="0"
                        to="1"
                        dur="0.5s"
                        begin={`${1 + index * 0.1}s`}
                        fill="freeze"
                      />
                    )}
                  </text>

                  <text
                    x={barX + 150}
                    y={barY + barHeight + 15}
                    textAnchor="start"
                    fill={type.pnl >= 0 ? '#10b981' : '#ef4444'}
                    fontSize="10"
                    fontWeight="bold"
                    opacity="0"
                  >
                    {type.pnl >= 0 ? '+' : ''}${type.pnl.toLocaleString()} PnL
                    {!isMobile && (
                      <animate
                        attributeName="opacity"
                        from="0"
                        to="1"
                        dur="0.5s"
                        begin={`${1.2 + index * 0.1}s`}
                        fill="freeze"
                      />
                    )}
                  </text>

                  <text
                    x={barX + 280}
                    y={barY + barHeight + 15}
                    textAnchor="start"
                    fill="#60a5fa"
                    fontSize="10"
                    opacity="0"
                  >
                    {type.profitableChallenges}/{type.count} profitable
                    {!isMobile && (
                      <animate
                        attributeName="opacity"
                        from="0"
                        to="1"
                        dur="0.5s"
                        begin={`${1.4 + index * 0.1}s`}
                        fill="freeze"
                      />
                    )}
                  </text>
                </g>
              );
            })}

            {/* Zero line (vertical) */}
            <line
              x1={labelWidth + 20}
              y1="30"
              x2={labelWidth + 20}
              y2={challengeTypeData.length * spacing + 30}
              stroke="rgba(255,255,255,0.2)"
              strokeWidth="1"
              strokeDasharray="3,3"
            />
          </svg>
        </div>
      </div>
    );
  };

  const getChartTitle = () => {
    switch (activeView) {
      case 'firmAnalysis':
        return 'Firm Analysis';
      case 'topPerformers':
        return 'Top Performing Accounts';
      case 'strategyPerformance':
        return 'Strategy Performance (ROI %)';
      case 'challengeType':
        return 'Performance by Challenge Type';
    }
  };

  const renderActiveChart = () => {
    switch (activeView) {
      case 'firmAnalysis':
        return renderFirmAnalysisChart();
      case 'topPerformers':
        return renderTopPerformersChart();
      case 'strategyPerformance':
        return renderStrategyBarChart();
      case 'challengeType':
        return renderChallengeTypeChart();
    }
  };

  return (
    <NeonCard glow="orange" className="p-4 select-none caret-transparent">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-white drop-shadow-neon">
          {getChartTitle()}
        </h3>
        
        <div className="flex gap-1">
          <button
            onClick={() => setActiveView('firmAnalysis')}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-all duration-200 ${
              activeView === 'firmAnalysis'
                ? 'bg-orange-500/20 border border-orange-400/50 text-orange-200 animate-border-glow drop-shadow-neon'
                : 'bg-white/5 border border-white/10 text-white/70 hover:text-white hover:border-white/20'
            }`}
          >
            <PieChart className="w-4 h-4" />
            Firms
          </button>
          
          <button
            onClick={() => setActiveView('strategyPerformance')}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-all duration-200 ${
              activeView === 'strategyPerformance'
                ? 'bg-orange-500/20 border border-orange-400/50 text-orange-200 animate-border-glow drop-shadow-neon'
                : 'bg-white/5 border border-white/10 text-white/70 hover:text-white hover:border-white/20'
            }`}
          >
            <BarChart3 className="w-4 h-4" />
            Strategy
          </button>
          
          <button
            onClick={() => setActiveView('challengeType')}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-all duration-200 ${
              activeView === 'challengeType'
                ? 'bg-orange-500/20 border border-orange-400/50 text-orange-200 animate-border-glow drop-shadow-neon'
                : 'bg-white/5 border border-white/10 text-white/70 hover:text-white hover:border-white/20'
            }`}
          >
            <Target className="w-4 h-4" />
            Types
          </button>
          
          <button
            onClick={() => setActiveView('topPerformers')}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-all duration-200 ${
              activeView === 'topPerformers'
                ? 'bg-orange-500/20 border border-orange-400/50 text-orange-200 animate-border-glow drop-shadow-neon'
                : 'bg-white/5 border border-white/10 text-white/70 hover:text-white hover:border-white/20'
            }`}
          >
            <span className="w-4 h-4">🏆</span>
            Top Accounts
          </button>
        </div>
      </div>

      {renderActiveChart()}
      
    </NeonCard>
  );
};
