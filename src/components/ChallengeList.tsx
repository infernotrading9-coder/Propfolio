import React from 'react';
import { Challenge, PropFirm } from '../types';
import { Button } from './ui/Button';
import { CheckCircle2, Circle, XCircle, Pencil, ChevronLeft, ChevronRight, Settings, Flame } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { PhaseOutcomePrompt } from './PhaseOutcomePrompt';
import { ConfirmDialog } from './ui/ConfirmDialog';
import { apiClient } from '../utils/apiClient';
import { archiveFailedChallenge } from '../utils/calendarStorage';

export const ChallengeList: React.FC<{
  challenges: Challenge[];
  firms: PropFirm[];
  onEdit: (ch: Challenge) => void;
  onTogglePhase: (id: string, phase: 'phase1'|'phase2'|'phase3') => void;
  onChallengeUpdate: (challenge: Challenge) => void;
  calendar?: any;
  setCalendar?: (updater: (prev: any) => any) => void;
  buildingMode?: boolean;
  onAutomaticCalendarIntegration?: (challenge: Challenge, completedPhase: 'phase1'|'phase2'|'phase3') => Promise<void>;
  onFailLiveAccount?: (challengeId: string) => void;
}> = ({ challenges, firms, onEdit, onChallengeUpdate, calendar, setCalendar, buildingMode = false, onAutomaticCalendarIntegration, onFailLiveAccount }) => {
  const [loadingPhase] = React.useState<string | null>(null);
  const [currentPage, setCurrentPage] = React.useState(1);
  const [itemsPerPage, setItemsPerPage] = React.useState(5);
  const [showPageSizeSelector, setShowPageSizeSelector] = React.useState(false);
  const [failConfirm, setFailConfirm] = React.useState<{ id: string; phase: 'phase1'|'phase2'|'phase3'; date: string } | null>(null);
  const [loadingFailConfirm, setLoadingFailConfirm] = React.useState(false);
  
  // Phase outcome prompt state
  const [phasePromptOpen, setPhasePromptOpen] = React.useState(false);
  const [phasePromptChallengeId, setPhasePromptChallengeId] = React.useState<string | null>(null);
  const [phasePromptPhase, setPhasePromptPhase] = React.useState<'phase1'|'phase2'|'phase3'>('phase1');
  const [phasePromptPrevCompleted, setPhasePromptPrevCompleted] = React.useState<boolean>(false);
  
  const firmName = (id: string) => firms.find(f => f.id === id)?.name ?? 'Unknown';
  const getFinalPhaseForChallenge = (challenge: Challenge): 'phase1'|'phase2'|'phase3' => {
    if (challenge.totalPhases === 1) return 'phase1';
    if (challenge.totalPhases === 2) return 'phase2';
    return 'phase3';
  };
  
  const getTotalPayouts = (challenge: Challenge): number => {
    if (Array.isArray(challenge.payouts)) {
      return challenge.payouts.reduce((sum, p) => sum + p.amount, 0);
    }
    return typeof challenge.payouts === 'number' ? challenge.payouts : 0;
  };

  const handlePhaseToggle = async (challengeId: string, phase: 'phase1'|'phase2'|'phase3') => {
    const target = challenges.find(c => c.id === challengeId);
    if (!target) return;
    
    const wasCompleted = target.phases[phase].completed;
    const newCompletedState = !wasCompleted;
    
    // Update UI immediately for instant feedback
    const updatedChallenge = {
      ...target,
      phases: {
        ...target.phases,
        [phase]: { ...target.phases[phase], completed: newCompletedState }
      }
    };
    onChallengeUpdate(updatedChallenge);
    
    // If completing a phase, show outcome prompt (pass/fail + date)
    if (!wasCompleted && newCompletedState) {
      setPhasePromptChallengeId(challengeId);
      setPhasePromptPhase(phase);
      setPhasePromptPrevCompleted(wasCompleted);
      setPhasePromptOpen(true);
      return; // wait for prompt submission to persist
    }
    
    // For unchecking, proceed to update database
    try {
      await apiClient.markPhase(target.id, phase, newCompletedState);
      console.log('Phase updated in database');
    } catch (error) {
      console.error('Database update failed:', error);
      // Revert UI state on database error
      const revertedChallenge = {
        ...target,
        phases: {
          ...target.phases,
          [phase]: { ...target.phases[phase], completed: wasCompleted }
        }
      };
      onChallengeUpdate(revertedChallenge);
      alert('Failed to update phase. Please try again.');
    }
  };

  

  // Normalize challenges to avoid undefined entries and missing IDs
  const validChallenges = React.useMemo(() => (
    (challenges || []).filter((ch): ch is Challenge => !!ch && !!(ch as any).id)
  ), [challenges]);

  // Sort for numbering (oldest first for correct numbering)
  // Use startDate first, then createdAt for same-day challenges
  const sortedForNumbering = React.useMemo(() => {
    return [...validChallenges].sort((a, b) => {
      const aStart = a?.startDate ? new Date(a.startDate).getTime() : 0;
      const bStart = b?.startDate ? new Date(b.startDate).getTime() : 0;
      const dateCompare = aStart - bStart;
      if (dateCompare !== 0) return dateCompare;
      const aCreated = a?.createdAt ? new Date(a.createdAt).getTime() : 0;
      const bCreated = b?.createdAt ? new Date(b.createdAt).getTime() : 0;
      // If same startDate, sort by createdAt (oldest first for numbering)
      return aCreated - bCreated;
    });
  }, [validChallenges]);
  
  // Sort for display (active first, then LIVE within active, newest first by dates)
  const sortedForDisplay = React.useMemo(() => {
    const isLiveChallenge = (c: Challenge): boolean => {
      if (!c || c.status === 'failed') return false;
      const totalPhases = c.totalPhases || 3;
      if (totalPhases === 1) return !!c.phases.phase1?.completed;
      if (totalPhases === 2) return !!c.phases.phase1?.completed && !!c.phases.phase2?.completed;
      return !!c.phases.phase1?.completed && !!c.phases.phase2?.completed && !!c.phases.phase3?.completed;
    };
    return [...validChallenges].sort((a, b) => {
      const activeA = a?.status !== 'failed' ? 1 : 0;
      const activeB = b?.status !== 'failed' ? 1 : 0;
      if (activeA !== activeB) return activeB - activeA; // Active first, failed later
      const liveA = isLiveChallenge(a) ? 1 : 0;
      const liveB = isLiveChallenge(b) ? 1 : 0;
      if (liveA !== liveB) return liveB - liveA; // Within active, pin LIVE to top
      const aStart = a?.startDate ? new Date(a.startDate).getTime() : 0;
      const bStart = b?.startDate ? new Date(b.startDate).getTime() : 0;
      const dateCompare = bStart - aStart;
      if (dateCompare !== 0) return dateCompare;
      const aCreated = a?.createdAt ? new Date(a.createdAt).getTime() : 0;
      const bCreated = b?.createdAt ? new Date(b.createdAt).getTime() : 0;
      return bCreated - aCreated;
    });
  }, [validChallenges]);
  
  // Pagination calculations (ensure all Active appear on first page by expanding the first page size if needed)
  const activeCount = React.useMemo(() => sortedForDisplay.filter(c => c.status !== 'failed').length, [sortedForDisplay]);
  const firstPageSize = Math.max(itemsPerPage, activeCount);
  const totalPages = sortedForDisplay.length <= firstPageSize ? 1 : 1 + Math.ceil((sortedForDisplay.length - firstPageSize) / itemsPerPage);
  const startIndex = currentPage === 1 ? 0 : firstPageSize + (currentPage - 2) * itemsPerPage;
  const pageSize = currentPage === 1 ? firstPageSize : itemsPerPage;
  const endIndex = startIndex + pageSize;
  const paginatedChallenges = sortedForDisplay.slice(startIndex, endIndex);
  
  // Reset to page 1 if current page exceeds total pages
  React.useEffect(() => {
    if (currentPage > totalPages && totalPages > 0) {
      setCurrentPage(1);
    }
  }, [currentPage, totalPages]);
  
  const handlePageChange = (page: number) => {
    setCurrentPage(page);
  };
  
  const handlePageSizeChange = (size: number) => {
    setItemsPerPage(size);
    setCurrentPage(1); // Reset to first page when changing page size
    setShowPageSizeSelector(false);
  };
  
  // Close page size selector when clicking outside
  React.useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (!target.closest('.page-size-selector')) {
        setShowPageSizeSelector(false);
      }
    };
    
    if (showPageSizeSelector) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showPageSizeSelector]);
  
  return (
    <>
      {validChallenges.length === 0 ? (
        <div className="relative bg-gradient-to-br from-gray-900/80 to-gray-800/50 backdrop-blur-sm rounded-2xl p-12 border border-white/10">
          <div className="absolute inset-0 bg-gradient-to-r from-cyan-500/5 to-purple-500/5 rounded-2xl"></div>
          <div className="relative text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-gradient-to-br from-cyan-500/20 to-purple-500/20 border border-cyan-400/30 mb-4">
              <Circle className="w-8 h-8 text-cyan-400" />
            </div>
            <div className="text-xl font-bold text-white/80 mb-2">No challenges yet</div>
            <div className="text-sm text-white/50">Add your first trading challenge above to get started!</div>
          </div>
        </div>
      ) : (
      <div className="grid grid-cols-1 gap-3">
        <AnimatePresence mode="popLayout">
          {paginatedChallenges.map((c) => {
            if (!c || !c.id) return null;
            // Find the challenge number based on oldest-to-newest order (oldest = #1)
            const idx = sortedForNumbering.findIndex(sc => sc && sc.id === c.id);
            const challengeNumber = idx >= 0 ? idx + 1 : 0;
            
            // Check if challenge is LIVE (all phases completed) and not failed
            const isLive = (() => {
              if (c.status === 'failed') return false;
              const totalPhases = c.totalPhases || 3;
              if (totalPhases === 1) return !!c.phases.phase1?.completed;
              if (totalPhases === 2) return !!c.phases.phase1?.completed && !!c.phases.phase2?.completed;
              return !!c.phases.phase1?.completed && !!c.phases.phase2?.completed && !!c.phases.phase3?.completed;
            })();
            
            return (
            <motion.div
              key={c.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.98 }}
              transition={{ 
                duration: 0.2,
                ease: 'easeOut'
              }}
            >
              <div className={`group relative bg-gradient-to-br from-gray-900/90 to-gray-800/60 backdrop-blur-sm rounded-xl p-5 border transition-all duration-300 ${
                isLive 
                  ? 'border-emerald-400/40 shadow-[0_0_40px_rgba(16,185,129,0.25)] hover:border-emerald-400/60 hover:shadow-[0_0_50px_rgba(16,185,129,0.35)]'
                  : 'border-white/10 hover:border-cyan-400/30 hover:shadow-[0_0_30px_rgba(6,182,212,0.15)]'
              }`}>
                {/* Glow effect on hover */}
                <div className={`absolute inset-0 rounded-xl transition-all duration-300 ${
                  isLive
                    ? 'bg-gradient-to-r from-emerald-500/5 via-green-500/5 to-emerald-500/5 group-hover:from-emerald-500/10 group-hover:via-green-500/10 group-hover:to-emerald-500/10'
                    : 'bg-gradient-to-r from-cyan-500/0 via-purple-500/0 to-cyan-500/0 group-hover:from-cyan-500/5 group-hover:via-purple-500/5 group-hover:to-cyan-500/5'
                }`}></div>
                
                <div className="relative flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
                  {/* Left side - Challenge info */}
                  <div className="flex-1 space-y-2">
                    {/* Challenge number badge and title */}
                    <div className="flex items-center gap-3">
                      <span className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-gradient-to-br from-cyan-500/20 to-purple-500/20 border border-cyan-400/40 text-sm font-bold text-cyan-200 shadow-[0_0_15px_rgba(6,182,212,0.3)]">
                        {challengeNumber}
                      </span>
                      <div className="flex items-center gap-2">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-white font-bold text-lg">
                              {firmName(c.propFirmId || '')}
                            </span>
                            {/* LIVE Badge */}
                            {isLive && (
                              <span className="relative inline-flex items-center gap-1.5 px-3 py-1 bg-gradient-to-r from-emerald-500/30 to-green-500/30 border-2 border-emerald-400/60 rounded-full animate-pulse">
                                <Flame className="w-4 h-4 text-emerald-300 animate-bounce" />
                                <span className="text-emerald-200 font-black text-xs tracking-wider">LIVE</span>
                                <div className="absolute inset-0 rounded-full bg-emerald-400/20 blur-md animate-pulse"></div>
                              </span>
                            )}
                          </div>
                          <div className="text-cyan-300 text-sm font-semibold">
                            ${Number(c.accountSize || 0).toLocaleString()} Account
                          </div>
                        </div>
                      </div>
                    </div>
                    
                    {/* Stats row */}
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-white/60">
                      <span className="flex items-center gap-1">
                        <span className="text-white/40">Started:</span>
                        <span className="text-cyan-300/80 font-medium">{c.startDate || '—'}</span>
                      </span>
                      <span className="text-white/20">•</span>
                      <span className="flex items-center gap-1">
                        <span className="text-white/40">Cost:</span>
                        <span className="text-red-300/80 font-medium">${(typeof c.cost === 'number' ? c.cost : Number(c.cost || 0)).toFixed(2)}</span>
                      </span>
                      <span className="text-white/20">•</span>
                      <span className="flex items-center gap-1">
                        <span className="text-white/40">Payouts:</span>
                        <span className="text-green-300/80 font-medium">${getTotalPayouts(c).toFixed(2)}</span>
                      </span>
                    </div>
                  </div>
                  
                  {/* Right side - Phase buttons and Edit */}
                  <div className="flex items-center gap-2 flex-wrap">
                    {(['phase1','phase2','phase3'] as const).slice(0, c.totalPhases ?? 3).map((p) => {
                      const loadingKey = `${c.id}-${p}`;
                      const isLoading = loadingPhase === loadingKey;
                      const phase = c?.phases?.[p];
                      
                      // Ensure the phase object exists to avoid crashes
                      if (!phase) return null;
                      
                      // Determine the next required (incomplete) phase
                      const phaseOrder = (['phase1','phase2','phase3'] as const).slice(0, c.totalPhases ?? 3);
                      const nextIncomplete = phaseOrder.find(ph => !(c?.phases?.[ph]?.completed));
                      const isFailedThisPhase = c.status === 'failed' && nextIncomplete === p && !phase.completed;
                      const failedIndex = c.status === 'failed' && nextIncomplete ? phaseOrder.indexOf(nextIncomplete) : -1;
                      const currentIndexForP = phaseOrder.indexOf(p);
                      const disabledDueToFailure = c.status === 'failed' && currentIndexForP > failedIndex;
                      const isActiveNext = c.status !== 'failed' && nextIncomplete === p && !phase.completed;
                      
                      // Disable future phases if previous phases are not completed
                      // Phase 2 requires Phase 1 to be completed
                      // Phase 3 requires Phase 1 AND Phase 2 to be completed
                      let disabledDueToProgression = false;
                      if (p === 'phase2' && !c.phases.phase1.completed) {
                        disabledDueToProgression = true;
                      } else if (p === 'phase3' && (!c.phases.phase1.completed || !c.phases.phase2.completed)) {
                        disabledDueToProgression = true;
                      }
                      
                      const isDisabled = isLoading || disabledDueToFailure || disabledDueToProgression || c.status === 'failed';

                      return (
                        <Button
                          key={p}
                          size="sm"
                          variant={
                            c.status === 'failed'
                              ? (isFailedThisPhase ? 'danger' : 'secondary')
                              : (phase.completed ? 'success' : (isActiveNext ? 'primary' : 'ghost'))
                          }
                          onClick={() => handlePhaseToggle(c.id, p)}
                          loading={isLoading}
                          disabled={isDisabled}
                          leftIcon={isFailedThisPhase ? (
                            <XCircle className="w-4 h-4" />
                          ) : (phase.completed ? 
                            <CheckCircle2 className="w-4 h-4"/> : 
                            <Circle className="w-4 h-4"/>
                          )}
                          className={`text-xs ${isFailedThisPhase ? 'line-through decoration-red-400 decoration-2' : ''} ${isDisabled ? 'opacity-50 cursor-not-allowed' : ''} ${isActiveNext ? '!bg-gradient-to-r !from-purple-600 !to-purple-500' : ''}`}
                          title={
                            phase.completedAt 
                              ? `Completed on ${new Date(phase.completedAt).toLocaleDateString()}` 
                              : isFailedThisPhase 
                              ? 'Failed' 
                              : isActiveNext 
                              ? 'Active - Click to mark as completed' 
                              : disabledDueToProgression
                              ? 'Complete previous phases first'
                              : 'Click to mark as completed'
                          }
                          glow={isActiveNext}
                          style={isActiveNext ? { boxShadow: '0 0 25px rgba(168, 85, 247, 0.8), 0 0 50px rgba(168, 85, 247, 0.5), 0 0 75px rgba(168, 85, 247, 0.3)' } : undefined}
                        >
                          {p.replace('phase','Phase ')}{isActiveNext ? ' · Active' : ''}
                        </Button>
                      );
                    }).filter(Boolean)}
                    
                    {/* Fail button for live accounts */}
                    {isLive && c.status !== 'failed' && onFailLiveAccount && (
                      <Button
                        size="sm"
                        variant="danger"
                        onClick={() => onFailLiveAccount(c.id)}
                        leftIcon={<XCircle className="w-4 h-4"/>}
                        className="px-3 !bg-red-500/20 hover:!bg-red-500/30 border-red-500/50"
                        title="Mark live account as failed"
                      >
                        Fail
                      </Button>
                    )}
                    {isLive && c.status !== 'failed' && (
                      <Button
                        size="sm"
                        variant="success"
                        onClick={() => onEdit(c)}
                        className="px-3"
                        title="Open payout manager"
                      >
                        Add Payout
                      </Button>
                    )}
                    
                    {/* Reset button removed (now handled in Edit modal) */}
                    
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => onEdit(c)}
                      leftIcon={<Pencil className="w-4 h-4"/>}
                      className="px-3 !bg-white/5 hover:!bg-white/10 border-white/10 hover:border-white/20"
                      title="Edit Challenge"
                    >
                      Edit
                    </Button>
                  </div>
                </div>
              </div>
            </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
      )}
      
      {/* Pagination Controls */}
      {challenges.length > 0 && (
        <div className="flex flex-col sm:flex-row items-center justify-between mt-6 gap-4 bg-gradient-to-br from-gray-900/60 to-gray-800/40 backdrop-blur-sm rounded-xl p-4 border border-white/10">
          <div className="flex items-center gap-3 text-sm">
            <span className="text-white/60">Showing <span className="text-cyan-300 font-semibold">{startIndex + 1}-{Math.min(endIndex, sortedForDisplay.length)}</span> of <span className="text-cyan-300 font-semibold">{sortedForDisplay.length}</span> challenges</span>
            <div className="relative page-size-selector">
              <button
                onClick={() => setShowPageSizeSelector(!showPageSizeSelector)}
                className="flex items-center gap-2 px-3 py-1.5 bg-white/5 hover:bg-white/10 border border-white/10 hover:border-cyan-400/30 rounded-lg text-xs text-white/70 hover:text-white transition-all duration-200"
              >
                <Settings className="w-3 h-3" />
                {itemsPerPage} per page
              </button>
              {showPageSizeSelector && (
                <div className="absolute top-full left-0 mt-2 bg-gray-900/95 backdrop-blur-md border border-white/20 rounded-lg shadow-[0_0_30px_rgba(6,182,212,0.2)] z-10 overflow-hidden">
                  {[5, 10, 20, 50].map((size) => (
                    <button
                      key={size}
                      onClick={() => handlePageSizeChange(size)}
                      className={`block w-full px-4 py-2.5 text-left text-xs hover:bg-cyan-500/10 transition-colors ${
                        itemsPerPage === size ? 'bg-gradient-to-r from-cyan-500/20 to-purple-500/20 text-cyan-200 font-semibold' : 'text-white/70'
                      }`}
                    >
                      {size} per page
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
          
          {totalPages > 1 && (
            <div className="flex items-center gap-2">
              <button
                onClick={() => handlePageChange(currentPage - 1)}
                disabled={currentPage === 1}
                className="flex items-center gap-1.5 px-3 py-2 bg-white/5 hover:bg-white/10 disabled:bg-white/5 border border-white/10 hover:border-cyan-400/30 disabled:border-white/10 rounded-lg text-xs font-medium text-white/70 hover:text-white disabled:text-white/40 disabled:cursor-not-allowed transition-all duration-200"
              >
                <ChevronLeft className="w-4 h-4" />
                Previous
              </button>
              
              <div className="flex items-center gap-1.5">
                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                  let pageNum;
                  if (totalPages <= 5) {
                    pageNum = i + 1;
                  } else if (currentPage <= 3) {
                    pageNum = i + 1;
                  } else if (currentPage >= totalPages - 2) {
                    pageNum = totalPages - 4 + i;
                  } else {
                    pageNum = currentPage - 2 + i;
                  }
                  
                  // Safety check to ensure pageNum is valid
                  if (!pageNum || pageNum < 1 || pageNum > totalPages) {
                    return null;
                  }
                  
                  return (
                    <button
                      key={`page-${pageNum}`}
                      onClick={() => handlePageChange(pageNum)}
                      className={`min-w-[2.5rem] h-10 rounded-lg text-sm font-semibold transition-all duration-200 ${
                        currentPage === pageNum
                          ? 'bg-gradient-to-r from-cyan-500/30 to-purple-500/30 border border-cyan-400/50 text-cyan-200 shadow-[0_0_20px_rgba(6,182,212,0.3)]'
                          : 'bg-white/5 border border-white/10 text-white/60 hover:bg-white/10 hover:border-white/20 hover:text-white'
                      }`}
                    >
                      {pageNum}
                    </button>
                  );
                }).filter(Boolean)}
              </div>
              
              <button
                onClick={() => handlePageChange(currentPage + 1)}
                disabled={currentPage === totalPages}
                className="flex items-center gap-1.5 px-3 py-2 bg-white/5 hover:bg-white/10 disabled:bg-white/5 border border-white/10 hover:border-cyan-400/30 disabled:border-white/10 rounded-lg text-xs font-medium text-white/70 hover:text-white disabled:text-white/40 disabled:cursor-not-allowed transition-all duration-200"
              >
                Next
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      )}
      
      {/* Phase Outcome Prompt */}
      <PhaseOutcomePrompt
        open={phasePromptOpen}
        phase={phasePromptPhase}
        totalPhases={(challenges.find(c => c.id === phasePromptChallengeId)?.totalPhases || 3) as 1|2|3}
        requiresActivationFee={(() => {
          const ch = challenges.find(c => c.id === phasePromptChallengeId);
          if (!ch) return false;
          return !!ch.hasActivationFee && typeof ch.activationFeeAmount !== 'number' && getFinalPhaseForChallenge(ch) === phasePromptPhase;
        })()}
        onCancel={() => {
          if (!phasePromptChallengeId) return;
          // Revert UI toggle
          const target = challenges.find(c => c.id === phasePromptChallengeId);
          if (target) {
            const revertedChallenge = {
              ...target,
              phases: {
                ...target.phases,
                [phasePromptPhase]: { ...target.phases[phasePromptPhase], completed: phasePromptPrevCompleted }
              }
            };
            onChallengeUpdate(revertedChallenge);
          }
          setPhasePromptOpen(false);
          setPhasePromptChallengeId(null);
        }}
        onSubmit={async (outcome, date, activationFeeAmount) => {
          try {
            if (!phasePromptChallengeId) return;
            const ch = challenges.find(c => c.id === phasePromptChallengeId);
            if (!ch) return;

            if (outcome === 'failed') {
              setFailConfirm({ id: ch.id, phase: phasePromptPhase, date });
            } else {
              // Persist phase completion with selected date
              await apiClient.markPhase(ch.id, phasePromptPhase, true, date);
              const shouldAddActivationFee =
                !!ch.hasActivationFee &&
                typeof ch.activationFeeAmount !== 'number' &&
                getFinalPhaseForChallenge(ch) === phasePromptPhase;
              const normalizedActivationFee = shouldAddActivationFee ? Number(activationFeeAmount ?? 0) : undefined;
              const updatedCost = shouldAddActivationFee
                ? Number(((ch.initialCost ?? ch.cost ?? 0) + (normalizedActivationFee ?? 0)).toFixed(2))
                : ch.cost;
              // Passed: persist completion with selected date
              const passedChallenge = {
                ...ch,
                status: 'active' as const,
                initialCost: ch.initialCost ?? ch.cost,
                activationFeeAmount: shouldAddActivationFee ? normalizedActivationFee : ch.activationFeeAmount,
                cost: updatedCost,
                phases: {
                  ...ch.phases,
                  [phasePromptPhase]: { ...ch.phases[phasePromptPhase], completed: true, completedAt: date }
                }
              };
              if (shouldAddActivationFee) {
                await apiClient.updateChallenge(passedChallenge);
              }
              onChallengeUpdate(passedChallenge);
              
              // Passed phase -> ensure next calendar segment exists automatically
              if (!buildingMode && onAutomaticCalendarIntegration) {
                await onAutomaticCalendarIntegration(passedChallenge, phasePromptPhase);
              }
            }
          } catch (e) {
            console.error('Phase outcome handling failed:', e);
            alert('Failed to save phase outcome.');
          } finally {
            setPhasePromptOpen(false);
            setPhasePromptChallengeId(null);
          }
        }}
      />
      
      {/* Confirm fail (phase -> failed) */}
      <ConfirmDialog
        isOpen={!!failConfirm}
        title="Mark Challenge as Failed"
        message="Are you sure you want to mark this challenge as failed? This will lock the challenge and its phases will become uneditable."
        confirmText="Mark as Failed"
        cancelText="Cancel"
        variant="danger"
        loading={loadingFailConfirm}
        onConfirm={async () => {
          if (!failConfirm) return;
          const { id, phase } = failConfirm;
          const ch = challenges.find(c => c.id === id);
          if (!ch) { setFailConfirm(null); return; }
          try {
            setLoadingFailConfirm(true);
            // Ensure phase is not marked completed in backend
            await apiClient.markPhase(id, phase, false);
            // Update UI: set failed and clear phase completion
            const failedChallenge = {
              ...ch,
              status: 'failed' as const,
              phases: {
                ...ch.phases,
                [phase]: { ...ch.phases[phase], completed: false, completedAt: undefined }
              }
            };
            onChallengeUpdate(failedChallenge);
            // Persist status failed
            await apiClient.bulkUpdateStatus([id], 'failed');
            // Archive from calendar across all accounts
            if (setCalendar && calendar) {
              setCalendar((prev: any) => ({
                ...prev,
                accountData: prev.accountData.map((ad: any) => {
                  const copy = { ...ad, challengePhases: [...ad.challengePhases] };
                  try { archiveFailedChallenge(copy, id); } catch {}
                  return copy;
                })
              }));
            }
          } catch (e) {
            console.error('Confirm fail error:', e);
            alert('Failed to mark as failed. Please try again.');
          } finally {
            setLoadingFailConfirm(false);
            setFailConfirm(null);
          }
        }}
        onCancel={() => setFailConfirm(null)}
      />
      
      {/* Claim BOGO Modal removed (now handled in Edit modal) */}
      
      {/* Reset Modal removed (now handled in Edit modal) */}
    </>
  );
};
