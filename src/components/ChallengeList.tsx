import React from 'react';
import { Challenge } from '../types';
import { NeonCard } from './NeonCard';
import { Button } from './ui/Button';
import { CheckCircle2, Circle, XCircle, Pencil, ChevronLeft, ChevronRight, Settings } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { PhaseOutcomePrompt } from './PhaseOutcomePrompt';
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
}> = ({ challenges, firms, onEdit, onTogglePhase, onChallengeUpdate, calendar, setCalendar, buildingMode = false, onAutomaticCalendarIntegration }) => {
  const [loadingPhase, setLoadingPhase] = React.useState<string | null>(null);
  const [currentPage, setCurrentPage] = React.useState(1);
  const [itemsPerPage, setItemsPerPage] = React.useState(5);
  const [showPageSizeSelector, setShowPageSizeSelector] = React.useState(false);
  
  // Phase outcome prompt state
  const [phasePromptOpen, setPhasePromptOpen] = React.useState(false);
  const [phasePromptChallengeId, setPhasePromptChallengeId] = React.useState<string | null>(null);
  const [phasePromptPhase, setPhasePromptPhase] = React.useState<'phase1'|'phase2'|'phase3'>('phase1');
  const [phasePromptPrevCompleted, setPhasePromptPrevCompleted] = React.useState<boolean>(false);
  
  const firmName = (id: string) => firms.find(f => f.id === id)?.name ?? 'Unknown';
  
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

  if (challenges.length === 0) {
    return (
      <NeonCard className="p-8" glow="purple">
        <div className="text-center text-white/60">
          <div className="mb-2 text-lg">No challenges yet</div>
          <div className="text-sm">Add your first trading challenge above to get started!</div>
        </div>
      </NeonCard>
    );
  }

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
  
  // Sort for display (newest first for display order)
  // Use startDate first, then createdAt for same-day challenges
  const sortedForDisplay = React.useMemo(() => {
    return [...validChallenges].sort((a, b) => {
      const aStart = a?.startDate ? new Date(a.startDate).getTime() : 0;
      const bStart = b?.startDate ? new Date(b.startDate).getTime() : 0;
      const dateCompare = bStart - aStart;
      if (dateCompare !== 0) return dateCompare;
      const aCreated = a?.createdAt ? new Date(a.createdAt).getTime() : 0;
      const bCreated = b?.createdAt ? new Date(b.createdAt).getTime() : 0;
      // If same startDate, sort by createdAt (newest first for display)
      return bCreated - aCreated;
    });
  }, [validChallenges]);
  
  // Pagination calculations (use display order)
  const totalPages = Math.ceil(sortedForDisplay.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
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
      <div className="grid grid-cols-1 gap-3">
        <AnimatePresence mode="popLayout">
          {paginatedChallenges.map((c, index) => {
            if (!c || !c.id) return null;
            // Find the challenge number based on oldest-to-newest order (oldest = #1)
            const idx = sortedForNumbering.findIndex(sc => sc && sc.id === c.id);
            const challengeNumber = idx >= 0 ? idx + 1 : 0;
            
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
              <NeonCard className="p-4" glow="purple" interactive>
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div className="flex-1">
                    <div className="text-white font-semibold drop-shadow-neon mb-1 flex items-center gap-3">
                      <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-purple-500/20 border border-purple-400/50 text-xs font-bold text-purple-200">
                        {challengeNumber}
                      </span>
                      {firmName(c.propFirmId || '')} · ${Number(c.accountSize || 0).toLocaleString()} Account
                    </div>
                    <div className="text-xs text-white/60">
                      Started {c.startDate || '—'} · Cost ${(typeof c.cost === 'number' ? c.cost : Number(c.cost || 0)).toFixed(2)} · Payouts ${getTotalPayouts(c).toFixed(2)}
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-2 flex-wrap">
                    {(['phase1','phase2','phase3'] as const).slice(0, c.totalPhases ?? 3).map((p, phaseIndex) => {
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

                      return (
                        <Button
                          key={p}
                          size="sm"
                          variant={isFailedThisPhase ? 'danger' : (phase.completed ? 'success' : (isActiveNext ? 'primary' : 'ghost'))}
                          onClick={() => handlePhaseToggle(c.id, p)}
                          loading={isLoading}
                          disabled={isLoading || disabledDueToFailure}
                          leftIcon={isFailedThisPhase ? (
                            <XCircle className="w-4 h-4" />
                          ) : (phase.completed ? 
                            <CheckCircle2 className="w-4 h-4"/> : 
                            <Circle className="w-4 h-4"/>
                          )}
                          className={`text-xs ${isFailedThisPhase ? 'line-through decoration-red-400 decoration-2' : ''} ${disabledDueToFailure ? 'opacity-50 cursor-not-allowed' : ''} ${isActiveNext ? '!bg-gradient-to-r !from-purple-600 !to-purple-500' : ''}`}
                          title={phase.completedAt ? `Completed on ${new Date(phase.completedAt).toLocaleDateString()}` : (isFailedThisPhase ? 'Failed' : (isActiveNext ? 'Active' : 'Click to mark as completed'))}
                          glow={isActiveNext}
                          style={isActiveNext ? { boxShadow: '0 0 25px rgba(168, 85, 247, 0.8), 0 0 50px rgba(168, 85, 247, 0.5), 0 0 75px rgba(168, 85, 247, 0.3)' } : undefined}
                        >
                          {p.replace('phase','Phase ')}{isActiveNext ? ' · Active' : ''}
                        </Button>
                      );
                    }).filter(Boolean)}
                    
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => onEdit(c)}
                      leftIcon={<Pencil className="w-4 h-4"/>}
                      className="px-3"
                      title="Edit Challenge"
                    >
                      Edit
                    </Button>
                    
                  </div>
                </div>
              </NeonCard>
            </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
      
      {/* Pagination Controls */}
      {challenges.length > 0 && (
        <div className="flex items-center justify-between mt-6 px-2">
          <div className="flex items-center gap-2 text-sm text-white/60">
            <span>Showing {startIndex + 1}-{Math.min(endIndex, challenges.length)} of {challenges.length} challenges</span>
            <div className="relative page-size-selector">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setShowPageSizeSelector(!showPageSizeSelector)}
                leftIcon={<Settings className="w-3 h-3" />}
                className="text-xs px-2 py-1"
              >
                {itemsPerPage} per page
              </Button>
              {showPageSizeSelector && (
                <div className="absolute top-full left-0 mt-1 bg-[#0a0e17] border border-white/10 rounded-md shadow-lg z-10">
                  {[5, 10, 20, 50].map((size) => (
                    <button
                      key={size}
                      onClick={() => handlePageSizeChange(size)}
                      className={`block w-full px-3 py-2 text-left text-xs hover:bg-white/5 first:rounded-t-md last:rounded-b-md ${
                        itemsPerPage === size ? 'bg-cyan-500/20 text-cyan-200' : 'text-white/70'
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
            <div className="flex items-center gap-1">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => handlePageChange(currentPage - 1)}
                disabled={currentPage === 1}
                leftIcon={<ChevronLeft className="w-4 h-4" />}
                className="px-2"
              >
                Previous
              </Button>
              
              <div className="flex items-center gap-1 mx-2">
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
                      className={`w-8 h-8 rounded-md text-xs font-medium transition-colors ${
                        currentPage === pageNum
                          ? 'bg-cyan-500/20 border border-cyan-400/50 text-cyan-200'
                          : 'bg-white/5 border border-white/10 text-white/70 hover:bg-white/10'
                      }`}
                    >
                      {pageNum}
                    </button>
                  );
                }).filter(Boolean)}
              </div>
              
              <Button
                size="sm"
                variant="ghost"
                onClick={() => handlePageChange(currentPage + 1)}
                disabled={currentPage === totalPages}
                rightIcon={<ChevronRight className="w-4 h-4" />}
                className="px-2"
              >
                Next
              </Button>
            </div>
          )}
        </div>
      )}
      
      {/* Phase Outcome Prompt */}
      <PhaseOutcomePrompt
        open={phasePromptOpen}
        phase={phasePromptPhase}
        totalPhases={(challenges.find(c => c.id === phasePromptChallengeId)?.totalPhases || 3) as 1|2|3}
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
        onSubmit={async (outcome, date) => {
          try {
            if (!phasePromptChallengeId) return;
            const ch = challenges.find(c => c.id === phasePromptChallengeId);
            if (!ch) return;

            // Persist phase completion with selected date
            await apiClient.markPhase(ch.id, phasePromptPhase, true, date);

            if (outcome === 'failed') {
              // Ensure phase is not marked completed
              const failedChallenge = {
                ...ch,
                status: 'failed' as const,
                phases: {
                  ...ch.phases,
                  [phasePromptPhase]: { ...ch.phases[phasePromptPhase], completed: false, completedAt: undefined }
                }
              };
              onChallengeUpdate(failedChallenge);

              // Mark challenge as failed
              await apiClient.bulkUpdateStatus([ch.id], 'failed');

              // Archive from calendar across all accounts
              if (setCalendar && calendar) {
                setCalendar((prev: any) => ({
                  ...prev,
                  accountData: prev.accountData.map((ad: any) => {
                    const copy = { ...ad, challengePhases: [...ad.challengePhases] };
                    try { archiveFailedChallenge(copy, ch.id); } catch {}
                    return copy;
                  })
                }));
              }
            } else {
              // Passed: persist completion with selected date
              const passedChallenge = {
                ...ch,
                status: 'active' as const,
                phases: {
                  ...ch.phases,
                  [phasePromptPhase]: { ...ch.phases[phasePromptPhase], completed: true, completedAt: date }
                }
              };
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
    </>
  );
};
