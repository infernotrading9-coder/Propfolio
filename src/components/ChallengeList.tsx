import React from 'react';
import { Challenge, PropFirm } from '../types';
import { NeonCard } from './NeonCard';
import { Button } from './ui/Button';
import { CheckCircle2, Circle, Pencil, ChevronLeft, ChevronRight, Settings } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export const ChallengeList: React.FC<{
  challenges: Challenge[];
  firms: PropFirm[];
  onEdit: (ch: Challenge) => void;
  onTogglePhase: (id: string, phase: 'phase1'|'phase2'|'phase3') => void;
}> = ({ challenges, firms, onEdit, onTogglePhase }) => {
  const [loadingPhase, setLoadingPhase] = React.useState<string | null>(null);
  const [currentPage, setCurrentPage] = React.useState(1);
  const [itemsPerPage, setItemsPerPage] = React.useState(5);
  const [showPageSizeSelector, setShowPageSizeSelector] = React.useState(false);
  
  const firmName = (id: string) => firms.find(f => f.id === id)?.name ?? 'Unknown';
  
  const getTotalPayouts = (challenge: Challenge): number => {
    if (Array.isArray(challenge.payouts)) {
      return challenge.payouts.reduce((sum, p) => sum + p.amount, 0);
    }
    return typeof challenge.payouts === 'number' ? challenge.payouts : 0;
  };

  const handlePhaseToggle = async (challengeId: string, phase: 'phase1'|'phase2'|'phase3') => {
    const loadingKey = `${challengeId}-${phase}`;
    setLoadingPhase(loadingKey);
    
    try {
      // Simulate network delay
      await new Promise(resolve => setTimeout(resolve, 400));
      onTogglePhase(challengeId, phase);
    } catch (error) {
      console.error('Phase toggle error:', error);
    } finally {
      setLoadingPhase(null);
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
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, x: -100, scale: 0.95 }}
              transition={{ 
                duration: 0.3, 
                delay: index * 0.05,
                ease: 'easeOut'
              }}
              layout
            >
              <NeonCard className="p-4" glow="purple" interactive>
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div className="flex-1">
                    <motion.div 
                      className="text-white font-semibold drop-shadow-neon mb-1 flex items-center gap-3"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: 0.1 }}
                    >
                      <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-purple-500/20 border border-purple-400/50 text-xs font-bold text-purple-200">
                        {challengeNumber}
                      </span>
                      {firmName(c.propFirmId || '')} · ${Number(c.accountSize || 0).toLocaleString()} Account
                    </motion.div>
                    <motion.div 
                      className="text-xs text-white/60"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: 0.2 }}
                    >
                      Started {c.startDate || '—'} · Cost ${(typeof c.cost === 'number' ? c.cost : Number(c.cost || 0)).toFixed(2)} · Payouts ${getTotalPayouts(c).toFixed(2)}
                    </motion.div>
                  </div>
                  
                  <div className="flex items-center gap-2 flex-wrap">
                    {(['phase1','phase2','phase3'] as const).slice(0, c.totalPhases ?? 3).map((p, phaseIndex) => {
                      const loadingKey = `${c.id}-${p}`;
                      const isLoading = loadingPhase === loadingKey;
                      const phase = c?.phases?.[p];
                      
                      // Ensure the phase object exists to avoid crashes
                      if (!phase) return null;
                      
                      return (
                        <motion.div
                          key={p}
                          initial={{ opacity: 0, scale: 0.8 }}
                          animate={{ opacity: 1, scale: 1 }}
                          transition={{ delay: 0.3 + phaseIndex * 0.1 }}
                        >
                          <Button
                            size="sm"
                            variant={phase.completed ? 'success' : 'ghost'}
                            onClick={() => handlePhaseToggle(c.id, p)}
                            loading={isLoading}
                            disabled={isLoading}
                            leftIcon={phase.completed ? 
                              <CheckCircle2 className="w-4 h-4"/> : 
                              <Circle className="w-4 h-4"/>
                            }
                            className="text-xs"
                            title={phase.completedAt ? `Completed on ${new Date(phase.completedAt).toLocaleDateString()}` : 'Click to mark as completed'}
                          >
                            {p.replace('phase','Phase ')}
                          </Button>
                        </motion.div>
                      );
                    }).filter(Boolean)}
                    
                    <motion.div
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: 0.6 }}
                    >
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
                    </motion.div>
                    
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
    </>
  );
};
