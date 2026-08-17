import React, { useMemo, useState, useEffect } from 'react';
import { NeonCard } from './NeonCard';
import { Challenge, PropFirm } from '../types';
import { PieChart, BarChart3, Target, Trophy, Sparkles } from 'lucide-react';

type ChartView = 'firmAnalysis' | 'strategyPerformance' | 'challengeType' | 'topPerformers';
type FirmView = 'exposure' | 'roi' | 'profit';
type ChallengeTypeView = 'phases' | 'evalType';

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
        @keyframes drift {
          0%, 100% { transform: translate3d(0, 0, 0) rotate(0deg); }
          30% { transform: translate3d(6px, -10px, 0) rotate(1deg); }
          65% { transform: translate3d(-4px, 8px, 0) rotate(-1deg); }
        }
        @keyframes thrusterPulse {
          0%, 100% { transform: scaleY(1) scaleX(1); opacity: 0.8; }
          50% { transform: scaleY(1.2) scaleX(0.92); opacity: 1; }
        }
        @keyframes starTrail {
          0% { opacity: 0.15; transform: translateX(0); }
          50% { opacity: 0.55; }
          100% { opacity: 0.15; transform: translateX(-10px); }
        }
      `;
      document.head.appendChild(style);
    }
  }, []);
  const [activeView, setActiveView] = useState<ChartView>('firmAnalysis');
  const [firmView, setFirmView] = useState<FirmView>('roi');
  const [challengeTypeView, setChallengeTypeView] = useState<ChallengeTypeView>('phases');
  const [isMobile, setIsMobile] = useState(false);
  
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  const formatCompactCurrency = React.useCallback((value: number) => {
    const absValue = Math.abs(value);
    if (absValue >= 1000000) return `$${(value / 1000000).toFixed(1)}M`;
    if (absValue >= 1000) return `$${Math.round(value / 1000)}K`;
    return `$${Math.round(value).toLocaleString()}`;
  }, []);

  const getFirmMeta = React.useCallback((firmName: string) => {
    const normalized = firmName.trim().toLowerCase();
    const match = firms.find((firm) => firm.name.trim().toLowerCase() === normalized);
    const firmType = match?.firmType;

    const firmProfiles: Array<{ test: (value: string) => boolean; logo: string; accent: string; glow: string; label: string; kind: string }> = [
      { test: value => value.includes('ftmo'), logo: 'FT', accent: '#f97316', glow: 'rgba(249,115,22,0.28)', label: 'FTMO', kind: 'target' },
      { test: value => value.includes('apex'), logo: 'AX', accent: '#22d3ee', glow: 'rgba(34,211,238,0.28)', label: 'Apex', kind: 'apex' },
      { test: value => value.includes('topstep') || value.includes('top step'), logo: 'TS', accent: '#60a5fa', glow: 'rgba(96,165,250,0.28)', label: 'Topstep', kind: 'steps' },
      { test: value => value.includes('funded'), logo: 'FD', accent: '#a855f7', glow: 'rgba(168,85,247,0.28)', label: 'Funded', kind: 'bolt' },
      { test: value => value.includes('5ers') || value.includes('the5%ers'), logo: '5%', accent: '#14b8a6', glow: 'rgba(20,184,166,0.28)', label: '5ers', kind: 'pentagon' },
      { test: value => value.includes('blue') || value.includes('blu'), logo: 'BL', accent: '#3b82f6', glow: 'rgba(59,130,246,0.28)', label: 'Blue', kind: 'wave' },
    ];
    const known = firmProfiles.find(entry => entry.test(normalized));

    const initials = firmName
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map(part => part[0]?.toUpperCase() || '')
      .join('') || firmName.slice(0, 2).toUpperCase();

    return {
      logo: known?.logo || initials,
      accent: known?.accent || (firmType === 'cfd' ? '#a855f7' : '#22d3ee'),
      glow: known?.glow || (firmType === 'cfd' ? 'rgba(168,85,247,0.28)' : 'rgba(34,211,238,0.28)'),
      label: known?.label || firmName,
      kind: known?.kind || 'initials',
      typeLabel: firmType ? firmType.toUpperCase() : 'FIRM'
    };
  }, [firms]);

  const renderFirmGlyph = React.useCallback((meta: ReturnType<typeof getFirmMeta>, size: 'sm' | 'md' = 'md') => {
    const glyphClass = size === 'sm' ? 'h-5 w-5' : 'h-6 w-6';
    const commonStroke = { stroke: meta.accent, strokeWidth: 2, fill: 'none', strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };

    switch (meta.kind) {
      case 'target':
        return (
          <svg viewBox="0 0 24 24" className={glyphClass}>
            <circle cx="12" cy="12" r="8" {...commonStroke} />
            <circle cx="12" cy="12" r="3.5" {...commonStroke} />
            <path d="M14 10 L19 5" {...commonStroke} />
            <path d="M17.5 5 H19 V6.5" {...commonStroke} />
          </svg>
        );
      case 'apex':
        return (
          <svg viewBox="0 0 24 24" className={glyphClass}>
            <path d="M4 18 L10.5 6 L13.5 11 L16 8 L20 18 Z" fill={`${meta.accent}22`} stroke={meta.accent} strokeWidth="2" strokeLinejoin="round" />
          </svg>
        );
      case 'steps':
        return (
          <svg viewBox="0 0 24 24" className={glyphClass}>
            <path d="M5 17 H9 V13 H13 V9 H19" {...commonStroke} />
            <path d="M16 6 H19 V9" {...commonStroke} />
          </svg>
        );
      case 'bolt':
        return (
          <svg viewBox="0 0 24 24" className={glyphClass}>
            <path d="M13 3 L6 13 H11 L9.5 21 L18 10.5 H13.5 L16 3 Z" fill={`${meta.accent}22`} stroke={meta.accent} strokeWidth="2" strokeLinejoin="round" />
          </svg>
        );
      case 'pentagon':
        return (
          <svg viewBox="0 0 24 24" className={glyphClass}>
            <path d="M12 3 L19 8 L16 19 H8 L5 8 Z" fill={`${meta.accent}18`} stroke={meta.accent} strokeWidth="2" strokeLinejoin="round" />
            <path d="M10 9.5 H14 L11 12.5 H14 L10 16" {...commonStroke} />
          </svg>
        );
      case 'wave':
        return (
          <svg viewBox="0 0 24 24" className={glyphClass}>
            <path d="M4 15 C7 10, 10 10, 13 15 C16 20, 19 20, 20 16" {...commonStroke} />
            <path d="M4 10 C7 5, 10 5, 13 10 C16 15, 19 15, 20 11" {...commonStroke} />
          </svg>
        );
      default:
        return <span className={size === 'sm' ? 'text-[10px] font-black' : 'text-xs font-black'}>{meta.logo}</span>;
    }
  }, [getFirmMeta]);
  

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
  }, [challenges, firms, selectedYear]);

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
  }, [challenges, firms, selectedYear]);

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

  // Challenge Type Performance Data (by phases)
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

  // Eval/Program Type Performance Data
  const evalTypeData = useMemo(() => {
    const validChallenges = challenges.filter(challenge => challenge && challenge.evalType?.trim());

    const groups: Record<string, Challenge[]> = {};
    validChallenges.forEach(c => {
      const key = c.evalType!.trim();
      if (!groups[key]) groups[key] = [];
      groups[key].push(c);
    });

    return Object.entries(groups).map(([name, group]) => {
      const totalCost = group.reduce((sum, c) => {
        const startYear = c?.startDate?.slice(0, 4);
        return sum + (startYear === selectedYear ? (c?.cost || 0) : 0);
      }, 0);
      const totalPayouts = group.reduce((sum, c) => {
        if (Array.isArray(c?.payouts)) {
          return sum + c.payouts.reduce((pSum, p) => {
            return p?.date?.slice(0, 4) === selectedYear ? pSum + (p?.amount || 0) : pSum;
          }, 0);
        }
        return sum + (typeof c?.payouts === 'number' ? c.payouts : 0);
      }, 0);
      const pnl = totalPayouts - totalCost;
      const roi = totalCost > 0 ? (pnl / totalCost) * 100 : 0;
      const profitableChallenges = group.filter(c => {
        const startYear = c?.startDate?.slice(0, 4);
        const payouts = Array.isArray(c?.payouts) 
          ? c.payouts.reduce((sum, p) => sum + (p?.date?.slice(0, 4) === selectedYear ? (p?.amount || 0) : 0), 0) 
          : (typeof c?.payouts === 'number' ? c.payouts : 0);
        const cost = startYear === selectedYear ? (c?.cost || 0) : 0;
        return payouts > cost;
      }).length;

      return {
        name,
        count: group.length,
        pnl,
        roi,
        totalCost,
        totalPayouts,
        avgCost: group.length > 0 ? totalCost / group.length : 0,
        profitableChallenges,
        profitableRate: group.length > 0 ? (profitableChallenges / group.length) * 100 : 0
      };
    }).sort((a, b) => b.roi - a.roi);
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
          evalType: challenge.evalType?.trim() || undefined,
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

  const insightCards = useMemo(() => {
    if (activeView === 'firmAnalysis') {
      const leader = (firmView === 'roi' ? firmROIData[0] : firmExposureData[0]) as any;
      const totalExposure = firmExposureData.reduce((sum, firm) => sum + firm.cost, 0);
      return [
        {
          label: 'Lead Firm',
          value: leader?.name || 'No data',
          detail: leader ? (firmView === 'roi' ? `${leader.roi.toFixed(1)}% ROI` : `${leader.percentage.toFixed(1)}% exposure`) : 'Add firms to compare',
          accent: firmView === 'roi' ? 'from-blue-500/25 to-cyan-500/10' : 'from-orange-500/25 to-amber-500/10'
        },
        {
          label: 'Tracked Firms',
          value: `${firmExposureData.length}`,
          detail: `${formatCompactCurrency(totalExposure)} deployed`,
          accent: 'from-violet-500/25 to-fuchsia-500/10'
        },
        {
          label: 'Best Payout Mix',
          value: firmProfitData[0] ? formatCompactCurrency(firmProfitData[0].payouts) : '$0',
          detail: firmProfitData[0] ? `${firmProfitData[0].name} generated the most payouts` : 'Waiting for payout data',
          accent: 'from-emerald-500/25 to-green-500/10'
        }
      ];
    }

    if (activeView === 'strategyPerformance') {
      const ranked = [...strategyData].sort((a, b) => b.roi - a.roi);
      const best = ranked[0];
      const avgPass = strategyData.length > 0 ? strategyData.reduce((sum, strategy) => sum + strategy.passRate, 0) / strategyData.length : 0;
      return [
        {
          label: 'Best Strategy',
          value: best?.name || 'No data',
          detail: best ? `${best.roi.toFixed(1)}% ROI across ${best.challenges} challenges` : 'Add strategy data to rank',
          accent: 'from-cyan-500/25 to-sky-500/10'
        },
        {
          label: 'Strategy Coverage',
          value: `${strategyData.length}`,
          detail: `${avgPass.toFixed(1)}% average pass rate`,
          accent: 'from-indigo-500/25 to-violet-500/10'
        },
        {
          label: 'Net PnL Leader',
          value: best ? formatCompactCurrency(best.pnl) : '$0',
          detail: best ? `${best.name} is setting the pace` : 'Waiting for results',
          accent: 'from-emerald-500/25 to-lime-500/10'
        }
      ];
    }

    if (activeView === 'challengeType') {
      const data = challengeTypeView === 'evalType' ? evalTypeData : challengeTypeData;
      const ranked = [...data].sort((a, b) => b.roi - a.roi);
      const best = ranked[0];
      const profitableTotal = data.reduce((sum, type) => sum + type.profitableChallenges, 0);
      const totalCount = data.reduce((sum, type) => sum + type.count, 0);
      return [
        {
          label: challengeTypeView === 'evalType' ? 'Top Program' : 'Top Type',
          value: best?.name || 'No data',
          detail: best ? `${best.roi.toFixed(1)}% ROI with ${best.profitableChallenges}/${best.count} profitable` : (challengeTypeView === 'evalType' ? 'Add Eval Types to compare programs' : 'Add challenge data to compare'),
          accent: challengeTypeView === 'evalType' ? 'from-fuchsia-500/25 to-pink-500/10' : 'from-amber-500/25 to-orange-500/10'
        },
        {
          label: 'Profitable Accounts',
          value: `${profitableTotal}/${totalCount || 0}`,
          detail: totalCount ? `${((profitableTotal / totalCount) * 100).toFixed(1)}% of tracked accounts` : 'Waiting for challenge results',
          accent: 'from-green-500/25 to-emerald-500/10'
        },
        {
          label: challengeTypeView === 'evalType' ? 'Capital by Program' : 'Capital by Type',
          value: formatCompactCurrency(data.reduce((sum, type) => sum + type.totalCost, 0)),
          detail: challengeTypeView === 'evalType' ? 'Combined spend across all programs' : 'Combined spend across all phase models',
          accent: challengeTypeView === 'evalType' ? 'from-purple-500/25 to-fuchsia-500/10' : 'from-purple-500/25 to-fuchsia-500/10'
        }
      ];
    }

    const topPerformer = topAccounts[0];
    const avgRoi = topAccounts.length > 0 ? topAccounts.reduce((sum, account) => sum + account.roi, 0) / topAccounts.length : 0;
    return [
      {
        label: '#1 Account',
        value: topPerformer ? `${topPerformer.firm} #${topPerformer.challengeNumber}` : 'No payouts yet',
        detail: topPerformer ? `${topPerformer.roi.toFixed(0)}% ROI on ${formatCompactCurrency(topPerformer.accountSize)}` : 'Complete funded accounts to rank them',
        accent: 'from-blue-500/25 to-cyan-500/10'
      },
      {
        label: 'Top 10 Payouts',
        value: formatCompactCurrency(topAccounts.reduce((sum, account) => sum + account.payouts, 0)),
        detail: `${topAccounts.length} ranked account${topAccounts.length === 1 ? '' : 's'} this year`,
        accent: 'from-emerald-500/25 to-green-500/10'
      },
      {
        label: 'Average ROI',
        value: `${avgRoi.toFixed(0)}%`,
        detail: 'Mean return across the leaderboard',
        accent: 'from-violet-500/25 to-fuchsia-500/10'
      }
    ];
  }, [activeView, challengeTypeData, firmExposureData, firmProfitData, firmROIData, firmView, formatCompactCurrency, strategyData, topAccounts]);

  const renderInsightStrip = () => (
    <div className="mb-5 grid grid-cols-1 gap-3 lg:grid-cols-3">
      {insightCards.map((card) => (
        <div
          key={`${activeView}-${card.label}`}
          className={`rounded-2xl border border-white/10 bg-gradient-to-br ${card.accent} p-4 shadow-[0_0_25px_rgba(15,23,42,0.22)] backdrop-blur-sm`}
        >
          <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-white/45">{card.label}</div>
          <div className="mt-2 text-lg font-bold text-white">{card.value}</div>
          <div className="mt-1 text-sm text-white/65">{card.detail}</div>
        </div>
      ))}
    </div>
  );


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
            {currentData.map((item) => {
              const meta = getFirmMeta(item.name);
              return (
              <div key={item.name} className="bg-white/5 rounded-xl p-3 border border-white/10">
                <div className="flex items-center justify-between mb-2 gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className="h-11 w-11 shrink-0 rounded-2xl border flex items-center justify-center"
                      style={{
                        color: meta.accent,
                        borderColor: `${meta.accent}66`,
                        background: `radial-gradient(circle at top, ${meta.glow} 0%, rgba(15,23,42,0.75) 72%)`,
                        boxShadow: `0 0 20px ${meta.glow}`
                      }}
                    >
                      {renderFirmGlyph(meta)}
                    </div>
                    <div className="min-w-0">
                      <div className="min-w-0 pr-1 text-sm font-semibold text-white break-words">{item.name}</div>
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] font-semibold tracking-[0.24em]" style={{ color: meta.accent }}>{meta.label.toUpperCase()}</span>
                        <span className="text-[10px] uppercase tracking-[0.22em] text-white/40">{meta.typeLabel}</span>
                      </div>
                    </div>
                  </div>
                  <span className="shrink-0 text-lg font-bold" style={{
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
            )})}
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
            {currentData.map((item, index) => {
              const meta = getFirmMeta(item.name);
              return (
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
                        background: `radial-gradient(circle at top, ${meta.glow} 0%, rgba(15,23,42,0.82) 72%)`,
                        borderColor: meta.accent,
                        boxShadow: `0 0 15px ${meta.glow}`,
                        filter: `drop-shadow(0 0 10px ${meta.glow})`
                      }}
                    >
                      {/* Animated background gradient */}
                      <div 
                        className="absolute inset-0 opacity-20 group-hover:opacity-40 transition-opacity duration-300"
                        style={{
                          background: `linear-gradient(135deg, ${meta.glow}, transparent, ${meta.accent}55)`
                        }}
                      />
                      
                      <div className="relative z-10" style={{ color: meta.accent }}>
                        {renderFirmGlyph(meta)}
                      </div>
                      
                      <div 
                        className="absolute -bottom-1 left-0 right-0 text-[9px] font-black text-center px-1 py-0.5 rounded-b-lg tracking-[0.18em]"
                        style={{
                          backgroundColor: meta.accent,
                          color: '#000'
                        }}
                      >
                        {meta.label.slice(0, 5).toUpperCase()}
                      </div>
                    </div>
                    
                    {/* Performance indicator ring */}
                    <div 
                      className="absolute -inset-1 rounded-xl animate-pulse opacity-30 group-hover:opacity-60 transition-opacity"
                      style={{ 
                        border: `2px solid ${meta.accent}`,
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
                      <span className="rounded-full border px-2 py-0.5 text-[10px] font-semibold tracking-[0.22em]" style={{ borderColor: `${meta.accent}55`, color: meta.accent, background: `${meta.accent}12` }}>
                        {meta.label.toUpperCase()}
                      </span>
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
                            <span className="font-medium">{formatCompactCurrency(item.cost)} invested</span>
                          </div>
                          <div className="flex items-center gap-2 text-xs">
                            <span className="text-cyan-400">📊</span>
                            <span>{item.count} challenges</span>
                            <span className="text-white/50">•</span>
                            <span className="text-green-400">{formatCompactCurrency(item.cost / item.count)} avg</span>
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-1">
                          <div className="flex items-center gap-2 text-xs">
                            <span className="text-orange-400">💰</span>
                            <span>{(() => {
                              const firmExposure = firmExposureData.find(f => f.name === item.name);
                              return formatCompactCurrency(firmExposure ? firmExposure.cost : (item as any).cost);
                            })()} cost</span>
                            <span className="text-white/50">•</span>
                            <span className="text-cyan-400">{item.count} challenges</span>
                          </div>
                          <div className="flex items-center gap-2 text-xs">
                            <span className="text-green-400">💎</span>
                            <span>{formatCompactCurrency((item as any).payouts)} earned</span>
                            <span className="text-white/50">•</span>
                            <span className={`${
                              (item as any).profit >= 0 ? 'text-green-400' : 'text-red-400'
                            }`}>
                              {((item as any).profit >= 0 ? '+' : '-')}{formatCompactCurrency(Math.abs((item as any).profit))} profit
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
            )})}          </div>
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
            {topAccounts.slice(0, 5).map((account, index) => {
              const meta = getFirmMeta(account.firm);
              return (
              <div 
                key={account.id} 
                className="bg-white/5 rounded-xl p-3 border border-white/10 cursor-pointer"
                onClick={() => setSelectedPerformer(selectedPerformer === account.id ? null : account.id)}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-bold text-yellow-400 bg-yellow-400/20 px-2 py-1 rounded">
                      #{index + 1}
                    </span>
                    <div
                      className="h-10 w-10 shrink-0 rounded-2xl border flex items-center justify-center"
                      style={{
                        color: meta.accent,
                        borderColor: `${meta.accent}66`,
                        background: `radial-gradient(circle at top, ${meta.glow} 0%, rgba(15,23,42,0.8) 72%)`,
                        boxShadow: `0 0 18px ${meta.glow}`
                      }}
                    >
                      {renderFirmGlyph(meta, 'sm')}
                    </div>
                    <div className="min-w-0">
                      <div className="text-white font-medium text-sm break-words">{account.firm}</div>
                      <div className="text-[11px] uppercase tracking-[0.2em]" style={{ color: meta.accent }}>
                        {meta.label} · {meta.typeLabel}
                      </div>
                      <div className="text-white/50 text-[11px]">
                        {formatCompactCurrency(account.accountSize)}
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
                  <span className="text-green-400">{formatCompactCurrency(account.profit)}</span>
                  <span className="text-white/60">Cost: {formatCompactCurrency(account.cost)}</span>
                </div>
                
                {selectedPerformer === account.id && (
                  <div className="mt-2 pt-2 border-t border-white/20 text-xs text-blue-400">
                    Challenge #{account.challengeNumber}
                  </div>
                )}
              </div>
            )})}
          </div>
        </div>
      );
    }

    // Desktop version - no scroll, bigger container
    return (
      <div>
        <div className="min-h-[500px] flex">
          <div className="w-96 flex items-center justify-center bg-black/20 rounded-l-lg border-r border-blue-500/30 overflow-hidden">
            <div className="relative w-full h-full p-5">
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(59,130,246,0.18),transparent_45%),radial-gradient(circle_at_bottom,rgba(168,85,247,0.12),transparent_40%)]" />
              <div className="absolute inset-0 opacity-60">
                <div className="absolute left-10 top-12 h-1.5 w-1.5 rounded-full bg-cyan-300" style={{ animation: 'starTrail 3.4s ease-in-out infinite' }} />
                <div className="absolute left-24 top-28 h-1 w-1 rounded-full bg-blue-200" style={{ animation: 'starTrail 4.1s ease-in-out infinite', animationDelay: '0.3s' }} />
                <div className="absolute right-16 top-20 h-2 w-2 rounded-full bg-fuchsia-300" style={{ animation: 'starTrail 3.8s ease-in-out infinite', animationDelay: '0.7s' }} />
                <div className="absolute right-10 bottom-24 h-1.5 w-1.5 rounded-full bg-amber-300" style={{ animation: 'starTrail 4.5s ease-in-out infinite', animationDelay: '1s' }} />
                <div className="absolute left-14 bottom-20 h-1 w-1 rounded-full bg-emerald-300" style={{ animation: 'starTrail 4s ease-in-out infinite', animationDelay: '1.2s' }} />
              </div>
              <div className="relative h-full w-full rounded-[28px] border border-white/10 bg-gradient-to-br from-slate-950/90 via-slate-950/70 to-blue-950/40 p-6 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
                <div className="absolute left-1/2 top-[18%] h-40 w-40 -translate-x-1/2 rounded-full bg-cyan-400/15 blur-3xl" />
                <div className="absolute left-1/2 top-[54%] h-32 w-32 -translate-x-1/2 rounded-full bg-fuchsia-500/10 blur-3xl" />
                <div className="relative flex h-full flex-col items-center justify-between">
                  <div className="text-center">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.3em] text-cyan-300/70">Launch Bay</div>
                    <div className="mt-2 text-xl font-semibold text-white">Top Account Command Ship</div>
                    <div className="mt-2 text-sm text-white/55">A faster, sharper flagship for your best performers.</div>
                  </div>
                  <div className="relative flex-1 w-full flex items-center justify-center" style={{ animation: 'drift 6s ease-in-out infinite' }}>
                    <div className="absolute inset-x-8 top-1/2 h-px bg-gradient-to-r from-transparent via-cyan-400/40 to-transparent" />
                    <svg width="300" height="320" viewBox="0 0 260 260" fill="none" className="relative z-10 drop-shadow-[0_0_24px_rgba(34,211,238,0.22)]">
                      <defs>
                        <linearGradient id="shipHull" x1="62" y1="52" x2="194" y2="198" gradientUnits="userSpaceOnUse">
                          <stop offset="0%" stopColor="#eef6ff" />
                          <stop offset="48%" stopColor="#94a3b8" />
                          <stop offset="100%" stopColor="#1e293b" />
                        </linearGradient>
                        <linearGradient id="shipCore" x1="130" y1="62" x2="130" y2="188" gradientUnits="userSpaceOnUse">
                          <stop offset="0%" stopColor="#67e8f9" />
                          <stop offset="100%" stopColor="#2563eb" />
                        </linearGradient>
                        <linearGradient id="wingGlow" x1="44" y1="130" x2="216" y2="130" gradientUnits="userSpaceOnUse">
                          <stop offset="0%" stopColor="#22d3ee" stopOpacity="0.15" />
                          <stop offset="50%" stopColor="#3b82f6" stopOpacity="0.4" />
                          <stop offset="100%" stopColor="#a855f7" stopOpacity="0.15" />
                        </linearGradient>
                        <linearGradient id="engineGlow" x1="130" y1="188" x2="130" y2="238" gradientUnits="userSpaceOnUse">
                          <stop offset="0%" stopColor="#fef08a" />
                          <stop offset="50%" stopColor="#fb923c" />
                          <stop offset="100%" stopColor="#ef4444" stopOpacity="0" />
                        </linearGradient>
                      </defs>
                      <ellipse cx="130" cy="134" rx="94" ry="20" fill="url(#wingGlow)" opacity="0.6" />
                      <path d="M130 34 L156 92 L130 206 L104 92 Z" fill="url(#shipHull)" stroke="#cbd5e1" strokeWidth="2.2" />
                      <path d="M130 52 L144 94 L130 168 L116 94 Z" fill="url(#shipCore)" opacity="0.95" />
                      <path d="M95 108 L46 136 L92 150 L118 140 Z" fill="#1e3a8a" stroke="#60a5fa" strokeWidth="2" />
                      <path d="M165 108 L214 136 L168 150 L142 140 Z" fill="#312e81" stroke="#818cf8" strokeWidth="2" />
                      <path d="M104 92 L80 118 L96 122 L118 112 Z" fill="#0f172a" stroke="#38bdf8" strokeWidth="1.8" />
                      <path d="M156 92 L180 118 L164 122 L142 112 Z" fill="#0f172a" stroke="#a78bfa" strokeWidth="1.8" />
                      <ellipse cx="130" cy="84" rx="16" ry="10" fill="#0f172a" stroke="#67e8f9" strokeWidth="2" />
                      <path d="M120 198 L130 226 L140 198 Z" fill="url(#engineGlow)" style={{ transformOrigin: '130px 198px', animation: 'thrusterPulse 0.7s ease-in-out infinite' }} />
                      <path d="M112 196 L118 218 L124 196 Z" fill="url(#engineGlow)" opacity="0.75" style={{ transformOrigin: '118px 196px', animation: 'thrusterPulse 0.85s ease-in-out infinite' }} />
                      <path d="M136 196 L142 218 L148 196 Z" fill="url(#engineGlow)" opacity="0.75" style={{ transformOrigin: '142px 196px', animation: 'thrusterPulse 0.8s ease-in-out infinite' }} />
                      <circle cx="130" cy="84" r="4" fill="#a5f3fc" />
                    </svg>
                  </div>
                  <div className="grid w-full grid-cols-3 gap-2">
                    <div className="rounded-2xl border border-cyan-400/20 bg-cyan-400/8 px-3 py-2 text-center">
                      <div className="text-[10px] uppercase tracking-[0.24em] text-cyan-300/60">Vector</div>
                      <div className="mt-1 text-sm font-semibold text-white">Precision</div>
                    </div>
                    <div className="rounded-2xl border border-blue-400/20 bg-blue-400/8 px-3 py-2 text-center">
                      <div className="text-[10px] uppercase tracking-[0.24em] text-blue-300/60">Drive</div>
                      <div className="mt-1 text-sm font-semibold text-white">Momentum</div>
                    </div>
                    <div className="rounded-2xl border border-fuchsia-400/20 bg-fuchsia-400/8 px-3 py-2 text-center">
                      <div className="text-[10px] uppercase tracking-[0.24em] text-fuchsia-300/60">Signal</div>
                      <div className="mt-1 text-sm font-semibold text-white">Edge</div>
                    </div>
                  </div>
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
                const meta = getFirmMeta(account.firm);
                
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
                        <div className="flex items-center gap-3 mb-1">
                          <div 
                            className="h-11 w-11 rounded-2xl flex-shrink-0 transition-all duration-300 group-hover:scale-110 border flex items-center justify-center"
                            style={{ 
                              color: meta.accent,
                              borderColor: `${meta.accent}66`,
                              background: `radial-gradient(circle at top, ${meta.glow} 0%, rgba(15,23,42,0.82) 72%)`,
                              boxShadow: `0 0 18px ${meta.glow}`,
                              filter: `drop-shadow(0 0 8px ${meta.glow})`
                            }}
                          >
                            {renderFirmGlyph(meta)}
                          </div>
                          <div className="min-w-0">
                            <div className="text-white font-bold text-sm truncate group-hover:text-white transition-colors">
                              {account.firm}
                            </div>
                            <div className="text-[10px] uppercase tracking-[0.24em]" style={{ color: meta.accent }}>
                              {meta.label} · {meta.typeLabel}
                            </div>
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
                        <div className="flex flex-wrap items-center gap-2 text-xs pl-14">
                          <span className="text-white/60">
                            {formatCompactCurrency(account.accountSize)}
                          </span>
                          {account.evalType && (
                            <span className="inline-flex items-center gap-1 rounded-full border border-fuchsia-400/30 bg-fuchsia-500/10 px-2 py-0.5 text-[10px] font-semibold text-fuchsia-200 shadow-[0_0_10px_rgba(217,70,239,0.12)]">
                              <Sparkles className="h-2.5 w-2.5" />
                              {account.evalType}
                            </span>
                          )}
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
                            +{formatCompactCurrency(account.profit)}
                          </span>
                        </div>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="text-orange-400">💰</span>
                            <span className="text-white/60">Cost:</span>
                          </div>
                          <span className="text-white/60">{formatCompactCurrency(account.cost)}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="text-blue-400">📊</span>
                            <span className="text-blue-400">Earned:</span>
                          </div>
                          <span className="text-blue-200 font-medium">{formatCompactCurrency(account.payouts)}</span>
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
    const isEval = challengeTypeView === 'evalType';
    const data = isEval ? evalTypeData : challengeTypeData;
    const emptyHint = isEval
      ? 'No program types yet. Add Eval Type when creating challenges to track performance here.'
      : 'No challenge type data available';

    // Sub-view toggle
    const toggle = (
      <div className="mb-5 flex justify-center">
        <div className="relative rounded-full border border-white/15 bg-black/35 p-0.5">
          <div
            className="absolute top-0.5 h-8 rounded-full transition-all duration-300 ease-out"
            style={{
              width: isEval ? '120px' : '96px',
              left: isEval ? '100px' : '2px',
              background: isEval
                ? 'linear-gradient(135deg, #d946ef, #a855f7)'
                : 'linear-gradient(135deg, #fb923c, #f97316)',
              boxShadow: isEval
                ? '0 0 15px rgba(217,70,239,0.35), 0 0 30px rgba(168,85,247,0.2)'
                : '0 0 15px rgba(251,146,60,0.35), 0 0 30px rgba(249,115,22,0.2)',
            }}
          />
          <div className="relative flex">
            <button
              onClick={() => setChallengeTypeView('phases')}
              className={`relative z-10 px-4 py-2 rounded-full text-xs font-bold uppercase tracking-wider transition-all duration-300 ${
                !isEval ? 'text-white' : 'text-white/60 hover:text-white/80'
              }`}
              style={{ textShadow: !isEval ? '0 1px 2px rgba(0,0,0,0.7)' : 'none' }}
            >
              Phases
            </button>
            <button
              onClick={() => setChallengeTypeView('evalType')}
              className={`relative z-10 px-4 py-2 rounded-full text-xs font-bold uppercase tracking-wider transition-all duration-300 flex items-center gap-1.5 ${
                isEval ? 'text-white' : 'text-white/60 hover:text-white/80'
              }`}
              style={{ textShadow: isEval ? '0 1px 2px rgba(0,0,0,0.7)' : 'none' }}
            >
              <Sparkles className="h-3 w-3" />
              Programs
            </button>
          </div>
        </div>
      </div>
    );

    if (data.length === 0) {
      return (
        <div className="h-64 flex flex-col items-center justify-center text-white/60">
          {toggle}
          <div className="text-center">
            {isEval ? (
              <Sparkles className="w-12 h-12 mx-auto mb-2 opacity-50 text-fuchsia-400" />
            ) : (
              <Target className="w-12 h-12 mx-auto mb-2 opacity-50" />
            )}
            <div>{emptyHint}</div>
          </div>
        </div>
      );
    }

    // Mobile card-based summary
    if (isMobile) {
      return (
        <div className="space-y-3">
          {toggle}
          <div className="text-center mb-4">
            <div className="text-white font-medium">
              {isEval ? 'Program / Eval Performance' : 'Challenge Type Performance'}
            </div>
            <div className="text-white/60 text-sm">
              {isEval ? 'Performance by eval type' : 'Performance by phase count'}
            </div>
          </div>
          
          <div className="space-y-2">
            {data.map((type) => (
              <div key={type.name} className="bg-white/5 rounded-lg p-3 border border-white/10">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-white font-medium flex items-center gap-2">
                    {isEval && <Sparkles className="h-3.5 w-3.5 text-fuchsia-400" />}
                    {type.name}{!isEval ? ' Challenges' : ''}
                  </span>
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

    const maxROI = Math.max(...data.map(c => Math.abs(c.roi)), 100);
    const chartWidth = 400;
    const barHeight = 50;
    const spacing = 80;
    const labelWidth = 160;

    return (
      <div className="w-full flex flex-col items-center">
        {toggle}
        <div className="min-h-[400px] flex items-center justify-center max-w-full w-full">
          <svg width="100%" viewBox={`0 0 ${chartWidth + labelWidth + 100} ${data.length * spacing + 60}`} height={data.length * spacing + 60} className="max-w-full" preserveAspectRatio="xMidYMid meet">
            {data.map((type, index) => {
              const barWidth = Math.abs(type.roi / maxROI) * chartWidth;
              const barY = 40 + index * spacing;
              const barX = labelWidth + 20;
              const color = isEval
                ? (type.roi >= 0 ? '#a855f7' : '#ec4899')
                : (type.roi >= 0 ? '#10b981' : '#ef4444');

              return (
                <g key={type.name}>
                  {/* Type name label on the left */}
                  <text
                    x={labelWidth - 10}
                    y={barY + barHeight/2 + 5}
                    textAnchor="end"
                    fill="white"
                    fontSize="13"
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
                    fill={isEval ? (type.pnl >= 0 ? '#a855f7' : '#ec4899') : (type.pnl >= 0 ? '#10b981' : '#ef4444')}
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
              y2={data.length * spacing + 30}
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
    <NeonCard glow="orange" className="p-3 sm:p-4 select-none caret-transparent">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h3 className="text-lg font-semibold text-white drop-shadow-neon">
          {getChartTitle()}
        </h3>
        
        <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:justify-end">
          <button
            onClick={() => setActiveView('firmAnalysis')}
            className={`flex items-center justify-center gap-2 px-3 py-2 rounded-md text-xs sm:text-sm font-medium transition-all duration-200 ${
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
            className={`flex items-center justify-center gap-2 px-3 py-2 rounded-md text-xs sm:text-sm font-medium transition-all duration-200 ${
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
            className={`flex items-center justify-center gap-2 px-3 py-2 rounded-md text-xs sm:text-sm font-medium transition-all duration-200 ${
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
            className={`flex items-center justify-center gap-2 px-3 py-2 rounded-md text-xs sm:text-sm font-medium transition-all duration-200 ${
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

      {renderInsightStrip()}

      {renderActiveChart()}
      
    </NeonCard>
  );
};
