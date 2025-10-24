import React from 'react';
import { NeonCard } from './NeonCard';
import { Challenge } from '../types';
import { Trophy, TrendingUp, Clock, Calendar, CheckCircle, XCircle, CheckSquare, Square, Archive, ChevronDown, ChevronRight } from 'lucide-react';

interface ChallengeCardsProps {
  challenges: Challenge[];
  firms: Array<{id: string; name: string;}>;
  onChallengeClick: (challengeId: string) => void;
  buildingMode?: boolean;
  selectedChallengeIds?: Set<string>;
  onToggleSelection?: (challengeId: string) => void;
  onFailLiveAccount?: (challengeId: string) => void;
}

export const ChallengeCards: React.FC<ChallengeCardsProps> = ({
  challenges,
  firms,
  onChallengeClick,
  buildingMode = false,
  selectedChallengeIds = new Set(),
  onToggleSelection,
  onFailLiveAccount
}) => {
  const [showArchived, setShowArchived] = React.useState(false);
  
  // Show active and passed challenges (not failed ones in main view)
  const activeChallenges = challenges.filter(c => {
    const status = (c.status as any) ?? 'active';
    return status === 'active' || status === 'passed';
  });
  const archivedChallenges = challenges.filter(c => c.status === 'failed');

  const getFirmName = (firmId: string) => {
    const firm = firms.find(f => f.id === firmId);
    return firm?.name || 'Unknown Firm';
  };

  const getStatusInfo = (challenge: Challenge) => {
    if (challenge.status === 'passed') {
      return {
        icon: <CheckCircle className="w-4 h-4" />,
        color: 'text-emerald-400',
        bgColor: 'bg-emerald-500/20',
        borderColor: 'border-emerald-400/50',
        label: 'Passed'
      };
    }
    if (challenge.status === 'failed') {
      return {
        icon: <XCircle className="w-4 h-4" />,
        color: 'text-rose-400',
        bgColor: 'bg-rose-500/20',
        borderColor: 'border-rose-400/50',
        label: 'Failed'
      };
    }
    return {
      icon: <Clock className="w-4 h-4" />,
      color: 'text-cyan-400',
      bgColor: 'bg-cyan-500/20',
      borderColor: 'border-cyan-400/50',
      label: 'Active'
    };
  };

  const getCurrentPhase = (challenge: Challenge) => {
    if (!challenge.phases.phase1.completed) return { phase: 'Phase 1', progress: 0, icon: <Trophy className="w-4 h-4 text-cyan-400" /> };
    if (!challenge.phases.phase2.completed && challenge.totalPhases > 1) return { phase: 'Phase 2', progress: 33, icon: <TrendingUp className="w-4 h-4 text-lime-400" /> };
    if (!challenge.phases.phase3.completed && challenge.totalPhases > 2) return { phase: 'Phase 3', progress: 66, icon: <TrendingUp className="w-4 h-4 text-amber-400" /> };
    
    // Check if failed - show different icon and color for failed live accounts
    if (challenge.status === 'failed') {
      return { phase: 'Failed', progress: 100, icon: <XCircle className="w-4 h-4 text-red-400" /> };
    }
    
    return { phase: 'Live Account', progress: 100, icon: <Trophy className="w-4 h-4 text-purple-400" /> };
  };

  if (activeChallenges.length === 0 && archivedChallenges.length === 0) {
    return (
      <NeonCard glow="cyan" className="p-8 text-center">
        <div className="text-white/60">
          <Calendar className="w-16 h-16 mx-auto mb-4 opacity-30" />
          <div className="text-lg font-medium mb-2">No Challenges</div>
          <div className="text-sm">Add challenges from your Prop Firm Dashboard to track them here!</div>
        </div>
      </NeonCard>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-cyan-300 to-purple-300">
          Rule Calendars
        </h3>
        <div className="text-sm text-white/60">
          {activeChallenges.length} Active Challenge{activeChallenges.length !== 1 ? 's' : ''}
        </div>
      </div>

      {activeChallenges.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {activeChallenges.map((challenge, index) => {
          const firmName = getFirmName(challenge.propFirmId);
          const statusInfo = getStatusInfo(challenge);
          const currentPhase = getCurrentPhase(challenge);
          
          return (
            <div
              key={challenge.id}
              className={`group relative transform-gpu transition-all duration-300 ${
                buildingMode ? 'cursor-default' : 'cursor-pointer hover:scale-105 hover:-translate-y-2'
              }`}
              style={{
                animationDelay: `${index * 0.1}s`,
                animation: 'fadeInUp 0.8s ease-out forwards'
              }}
            >
              {/* Holographic Card Container */}
              <div
                onClick={() => {
                  if (buildingMode && onToggleSelection) {
                    onToggleSelection(challenge.id);
                  } else {
                    onChallengeClick(challenge.id);
                  }
                }}
                className={buildingMode ? 'cursor-pointer' : 'cursor-pointer'}
              >
                <NeonCard 
                  glow={selectedChallengeIds.has(challenge.id) ? "cyan" : "purple"} 
                  className={`relative overflow-hidden p-6 h-full ${
                    selectedChallengeIds.has(challenge.id) ? 'ring-2 ring-cyan-400/50' : ''
                  }`}
                >
                {/* Holographic Reflection Layer */}
                <div 
                  className="absolute inset-0 opacity-0 group-hover:opacity-40 transition-opacity duration-700 pointer-events-none"
                  style={{
                    background: `conic-gradient(from 0deg at 50% 50%, 
                      transparent 0deg, 
                      rgba(34, 211, 238, 0.1) 60deg,
                      rgba(168, 85, 247, 0.1) 120deg,
                      rgba(236, 72, 153, 0.1) 180deg,
                      rgba(34, 211, 238, 0.1) 240deg,
                      rgba(168, 85, 247, 0.1) 300deg,
                      transparent 360deg
                    )`,
                    filter: 'blur(1px)',
                    animation: 'rotate 8s linear infinite'
                  }}
                />

                {/* Floating Particles */}
                <div className="absolute inset-0 pointer-events-none overflow-hidden">
                  {[...Array(8)].map((_, i) => (
                    <div
                      key={i}
                      className="absolute w-1 h-1 rounded-full bg-cyan-400 opacity-40"
                      style={{
                        left: `${Math.random() * 100}%`,
                        top: `${Math.random() * 100}%`,
                        animation: `floatingParticle ${4 + Math.random() * 3}s ease-in-out infinite ${i * 0.5}s`,
                        boxShadow: '0 0 8px rgba(34, 211, 238, 0.6)'
                      }}
                    />
                  ))}
                </div>

                <div className="relative z-10 space-y-4">
                  {/* Header */}
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-3 flex-1 min-w-0">
                      {/* Selection checkbox for build mode */}
                      {buildingMode && onToggleSelection && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onToggleSelection(challenge.id);
                          }}
                          className="mt-1 p-1 rounded hover:bg-white/10 transition-colors"
                        >
                          {selectedChallengeIds.has(challenge.id) ? (
                            <CheckSquare className="w-4 h-4 text-cyan-400" />
                          ) : (
                            <Square className="w-4 h-4 text-white/60 hover:text-white/80" />
                          )}
                        </button>
                      )}
                      
                      <div className="flex-1 min-w-0">
                        <h4 className="text-lg font-bold text-white truncate group-hover:text-cyan-300 transition-colors">
                          {firmName}
                        </h4>
                        <p className="text-sm text-white/60 truncate">
                          ${(challenge.accountSize / 1000).toFixed(0)}K Account
                        </p>
                      </div>
                    </div>
                    <div className={`flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${statusInfo.bgColor} ${statusInfo.borderColor} border`}>
                      <span className={statusInfo.color}>{statusInfo.icon}</span>
                      <span className={statusInfo.color}>{statusInfo.label}</span>
                    </div>
                  </div>

                  {/* Current Phase */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        {currentPhase.icon}
                        <span className="text-sm font-medium text-white">
                          {currentPhase.phase}
                        </span>
                      </div>
                      <span className="text-xs text-white/60">
                        {currentPhase.progress}%
                      </span>
                    </div>

                    {/* Progress Bar */}
                    <div className="relative h-2 bg-white/10 rounded-full overflow-hidden">
                      <div 
                        className="absolute left-0 top-0 h-full rounded-full transition-all duration-1000 group-hover:animate-pulse"
                        style={{
                          width: `${currentPhase.progress}%`,
                          background: 'linear-gradient(90deg, #06b6d4, #8b5cf6, #ec4899)'
                        }}
                      />
                    </div>
                  </div>

                  {/* Strategy */}
                  {challenge.strategy && (
                    <div className="text-xs text-white/50 bg-white/5 rounded px-2 py-1 truncate">
                      Strategy: {challenge.strategy}
                    </div>
                  )}

                  {/* Footer */}
                  <div className="flex items-center justify-between pt-2 border-t border-white/10">
                    <div className="text-xs text-white/50">
                      Started {new Date(challenge.startDate).toLocaleDateString()}
                    </div>
                    <div className="flex items-center gap-2">
                      {/* Show fail button for live accounts */}
                      {currentPhase.phase === 'Live Account' && challenge.status !== 'failed' && onFailLiveAccount && !buildingMode && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onFailLiveAccount(challenge.id);
                          }}
                          className="px-2 py-1 rounded bg-red-500/20 hover:bg-red-500/30 border border-red-500/50 text-red-300 hover:text-red-200 text-xs transition-all duration-200"
                          title="Mark live account as failed"
                        >
                          ✕ Fail
                        </button>
                      )}
                      <div className="flex items-center gap-1 text-xs text-cyan-400 group-hover:text-cyan-300 transition-colors">
                        {buildingMode ? (
                          <span>{selectedChallengeIds.has(challenge.id) ? 'Selected' : 'Click to select'}</span>
                        ) : (
                          <>
                            <Calendar className="w-3 h-3" />
                            <span>Click to view</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Click Ripple Effect */}
                <div className="absolute inset-0 opacity-0 group-active:opacity-30 transition-opacity duration-150 pointer-events-none">
                  <div className="absolute inset-0 bg-gradient-to-br from-cyan-400/20 to-purple-400/20 rounded-lg" />
                </div>
                </NeonCard>
              </div>
            </div>
          );
        })}
        </div>
      ) : (
        <NeonCard glow="cyan" className="p-8 text-center">
          <div className="text-white/60">
            <Calendar className="w-16 h-16 mx-auto mb-4 opacity-30" />
            <div className="text-lg font-medium mb-2">No Active Challenges</div>
            <div className="text-sm">Add challenges from your Prop Firm Dashboard to track them here!</div>
          </div>
        </NeonCard>
      )}
      
      {/* Archived Challenges Section */}
      {archivedChallenges.length > 0 && (
        <div className="mt-8">
          <button
            onClick={() => setShowArchived(!showArchived)}
            className="flex items-center gap-3 w-full p-4 rounded-lg bg-gradient-to-r from-red-900/10 to-red-800/5 hover:from-red-900/20 hover:to-red-800/10 border border-red-500/20 hover:border-red-500/30 transition-all duration-300 mb-4"
          >
            <Archive className="w-5 h-5 text-red-400" />
            <h3 className="text-lg font-bold text-red-200 flex-1 text-left">
              Archived Challenges ({archivedChallenges.length})
            </h3>
            {showArchived ? (
              <ChevronDown className="w-5 h-5 text-red-400" />
            ) : (
              <ChevronRight className="w-5 h-5 text-red-400" />
            )}
          </button>
          
          {showArchived && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {archivedChallenges.map((challenge, index) => {
                const firmName = getFirmName(challenge.propFirmId);
                const statusInfo = getStatusInfo(challenge);
                const currentPhase = getCurrentPhase(challenge);
                
                return (
                  <div
                    key={challenge.id}
                    className="group relative opacity-75 transform-gpu transition-all duration-300"
                    style={{
                      animationDelay: `${index * 0.1}s`,
                      animation: 'fadeInUp 0.8s ease-out forwards'
                    }}
                  >
                    {/* Archived Challenge Card */}
                    <div
                      className="cursor-pointer"
                      onClick={() => onChallengeClick(challenge.id)}
                    >
                      <NeonCard
                        glow="red" 
                        className="relative overflow-hidden p-6 h-full bg-gradient-to-br from-red-900/10 to-red-800/5"
                      >
                        {/* Same card content but with archived styling */}
                        <div className="relative z-10 space-y-4">
                          {/* Header */}
                          <div className="flex items-start justify-between">
                            <div className="flex items-start gap-3 flex-1 min-w-0">
                              {/* Show archived icon instead of checkbox */}
                              <div className="mt-1 p-1">
                                <Archive className="w-4 h-4 text-red-400" />
                              </div>
                              
                              <div className="flex-1 min-w-0">
                                <h4 className="text-lg font-bold text-red-200 truncate">
                                  {firmName}
                                </h4>
                                <p className="text-sm text-red-300/60 truncate">
                                  ${(challenge.accountSize / 1000).toFixed(0)}K Account
                                </p>
                              </div>
                            </div>
                            <div className={`flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${statusInfo.bgColor} ${statusInfo.borderColor} border`}>
                              <span className={statusInfo.color}>{statusInfo.icon}</span>
                              <span className={statusInfo.color}>{statusInfo.label}</span>
                            </div>
                          </div>
                          
                          {/* Current Phase */}
                          <div className="space-y-3">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                {currentPhase.icon}
                                <span className="text-sm font-medium text-red-200">
                                  {currentPhase.phase}
                                </span>
                              </div>
                              <span className="text-xs text-red-300/60">
                                {currentPhase.progress}%
                              </span>
                            </div>
                            
                            {/* Progress Bar */}
                            <div className="relative h-2 bg-red-900/20 rounded-full overflow-hidden">
                              <div 
                                className="absolute left-0 top-0 h-full rounded-full"
                                style={{
                                  width: `${currentPhase.progress}%`,
                                  background: 'linear-gradient(90deg, #dc2626, #b91c1c)'
                                }}
                              />
                            </div>
                          </div>
                          
                          {/* Strategy */}
                          {challenge.strategy && (
                            <div className="text-xs text-red-300/50 bg-red-900/20 rounded px-2 py-1 truncate">
                              Strategy: {challenge.strategy}
                            </div>
                          )}
                          
                          {/* Footer */}
                          <div className="flex items-center justify-between pt-2 border-t border-red-800/20">
                            <div className="text-xs text-red-300/50">
                              Started {new Date(challenge.startDate).toLocaleDateString()}
                            </div>
                            <div className="flex items-center gap-1 text-xs text-red-400 hover:text-red-300 transition-colors">
                              <Calendar className="w-3 h-3" />
                              <span>View history</span>
                            </div>
                          </div>
                        </div>
                      </NeonCard>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
};