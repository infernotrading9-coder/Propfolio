import React from 'react';
import { Challenge, PropFirm } from '../types';
import { Button } from './ui/Button';
import { CheckCircle2, ChevronDown, ChevronLeft, ChevronRight, Circle, Flame, Layers3, Pencil, Settings, Users2, XCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { PhaseOutcomePrompt } from './PhaseOutcomePrompt';
import { ConfirmDialog } from './ui/ConfirmDialog';
import { apiClient } from '../utils/apiClient';
import { archiveFailedChallenge } from '../utils/calendarStorage';
import { ChallengeGroup, getFinalPhaseForChallenge, getNextIncompletePhase, groupChallengesByPurchase, isChallengeLive } from '../utils/challengeGroups';

type FailConfirmState = {
  ids: string[];
  phase: 'phase1' | 'phase2' | 'phase3';
  date: string;
};

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
}> = ({
  challenges,
  firms,
  onEdit,
  onChallengeUpdate,
  calendar,
  setCalendar,
  buildingMode = false,
  onAutomaticCalendarIntegration,
  onFailLiveAccount,
}) => {
  const [loadingPhase] = React.useState<string | null>(null);
  const [currentPage, setCurrentPage] = React.useState(1);
  const [itemsPerPage, setItemsPerPage] = React.useState(5);
  const [showPageSizeSelector, setShowPageSizeSelector] = React.useState(false);
  const [expandedGroupIds, setExpandedGroupIds] = React.useState<Set<string>>(new Set());
  const [selectedChallengeIds, setSelectedChallengeIds] = React.useState<Set<string>>(new Set());
  const [phasePromptOpen, setPhasePromptOpen] = React.useState(false);
  const [phasePromptChallengeIds, setPhasePromptChallengeIds] = React.useState<string[]>([]);
  const [phasePromptPhase, setPhasePromptPhase] = React.useState<'phase1'|'phase2'|'phase3'>('phase1');
  const [failConfirm, setFailConfirm] = React.useState<FailConfirmState | null>(null);
  const [loadingFailConfirm, setLoadingFailConfirm] = React.useState(false);

  const firmName = React.useCallback(
    (id: string) => firms.find((firm) => firm.id === id)?.name ?? 'Unknown',
    [firms]
  );

  const getTotalPayouts = React.useCallback((challenge: Challenge): number => {
    if (!Array.isArray(challenge.payouts)) {
      return typeof challenge.payouts === 'number' ? challenge.payouts : 0;
    }
    return challenge.payouts.reduce((sum, payout) => sum + payout.amount, 0);
  }, []);

  const validChallenges = React.useMemo(
    () => (challenges || []).filter((challenge): challenge is Challenge => Boolean(challenge?.id)),
    [challenges]
  );

  const sortedForNumbering = React.useMemo(() => {
    return [...validChallenges].sort((a, b) => {
      const aStart = a.startDate ? new Date(a.startDate).getTime() : 0;
      const bStart = b.startDate ? new Date(b.startDate).getTime() : 0;
      if (aStart !== bStart) return aStart - bStart;
      return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    });
  }, [validChallenges]);

  const sortedForDisplay = React.useMemo(() => {
    return [...validChallenges].sort((a, b) => {
      const activeA = a.status !== 'failed' ? 1 : 0;
      const activeB = b.status !== 'failed' ? 1 : 0;
      if (activeA !== activeB) return activeB - activeA;

      const liveA = isChallengeLive(a) ? 1 : 0;
      const liveB = isChallengeLive(b) ? 1 : 0;
      if (liveA !== liveB) return liveB - liveA;

      const aStart = a.startDate ? new Date(a.startDate).getTime() : 0;
      const bStart = b.startDate ? new Date(b.startDate).getTime() : 0;
      if (aStart !== bStart) return bStart - aStart;

      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
  }, [validChallenges]);

  const groupedForDisplay = React.useMemo(() => {
    return groupChallengesByPurchase(sortedForDisplay).sort((a, b) => {
      const activeA = a.challenges.some((challenge) => challenge.status !== 'failed') ? 1 : 0;
      const activeB = b.challenges.some((challenge) => challenge.status !== 'failed') ? 1 : 0;
      if (activeA !== activeB) return activeB - activeA;

      const liveA = a.challenges.some(isChallengeLive) ? 1 : 0;
      const liveB = b.challenges.some(isChallengeLive) ? 1 : 0;
      if (liveA !== liveB) return liveB - liveA;

      const newestA = Math.max(...a.challenges.map((challenge) => new Date(challenge.startDate || challenge.createdAt).getTime()));
      const newestB = Math.max(...b.challenges.map((challenge) => new Date(challenge.startDate || challenge.createdAt).getTime()));
      return newestB - newestA;
    });
  }, [sortedForDisplay]);

  const challengeNumberMap = React.useMemo(() => {
    return new Map(sortedForNumbering.map((challenge, index) => [challenge.id, index + 1]));
  }, [sortedForNumbering]);

  const activeGroupCount = React.useMemo(
    () => groupedForDisplay.filter((group) => group.challenges.some((challenge) => challenge.status !== 'failed')).length,
    [groupedForDisplay]
  );
  const firstPageSize = Math.max(itemsPerPage, activeGroupCount);
  const totalPages = groupedForDisplay.length <= firstPageSize ? 1 : 1 + Math.ceil((groupedForDisplay.length - firstPageSize) / itemsPerPage);
  const startIndex = currentPage === 1 ? 0 : firstPageSize + (currentPage - 2) * itemsPerPage;
  const pageSize = currentPage === 1 ? firstPageSize : itemsPerPage;
  const endIndex = startIndex + pageSize;
  const paginatedGroups = groupedForDisplay.slice(startIndex, endIndex);

  React.useEffect(() => {
    if (currentPage > totalPages && totalPages > 0) {
      setCurrentPage(1);
    }
  }, [currentPage, totalPages]);

  React.useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (!target.closest('.page-size-selector')) {
        setShowPageSizeSelector(false);
      }
    };

    if (!showPageSizeSelector) return;
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showPageSizeSelector]);

  const toggleGroupExpanded = (groupId: string) => {
    setExpandedGroupIds((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
  };

  const toggleChallengeSelection = (challengeId: string) => {
    setSelectedChallengeIds((prev) => {
      const next = new Set(prev);
      if (next.has(challengeId)) next.delete(challengeId);
      else next.add(challengeId);
      return next;
    });
  };

  const setSelectionForGroup = (group: ChallengeGroup, ids: string[]) => {
    setSelectedChallengeIds((prev) => {
      const next = new Set(prev);
      group.challenges.forEach((challenge) => next.delete(challenge.id));
      ids.forEach((id) => next.add(id));
      return next;
    });
  };

  const handlePhaseToggle = async (challengeId: string, phase: 'phase1'|'phase2'|'phase3') => {
    const challenge = validChallenges.find((item) => item.id === challengeId);
    if (!challenge) return;

    if (!challenge.phases[phase].completed) {
      setPhasePromptChallengeIds([challengeId]);
      setPhasePromptPhase(phase);
      setPhasePromptOpen(true);
      return;
    }

    try {
      await apiClient.markPhase(challengeId, phase, false);
      onChallengeUpdate({
        ...challenge,
        phases: {
          ...challenge.phases,
          [phase]: {
            ...challenge.phases[phase],
            completed: false,
            completedAt: undefined,
          },
        },
      });
    } catch (error) {
      console.error('Database update failed:', error);
      alert('Failed to update phase. Please try again.');
    }
  };

  const handleBulkPhaseAction = (challengeIds: string[]) => {
    const selected = validChallenges.filter((challenge) => challengeIds.includes(challenge.id));
    const nextPhases = selected
      .map((challenge) => getNextIncompletePhase(challenge))
      .filter((phase): phase is 'phase1'|'phase2'|'phase3' => Boolean(phase));

    if (selected.length === 0 || nextPhases.length !== selected.length || new Set(nextPhases).size !== 1) {
      alert('Select accounts that are on the same next phase.');
      return;
    }

    setPhasePromptChallengeIds(challengeIds);
    setPhasePromptPhase(nextPhases[0]);
    setPhasePromptOpen(true);
  };

  const renderPhaseButtons = (challenge: Challenge) => {
    return (['phase1', 'phase2', 'phase3'] as const).slice(0, challenge.totalPhases ?? 3).map((phaseName) => {
      const phase = challenge.phases?.[phaseName];
      if (!phase) return null;

      const loadingKey = `${challenge.id}-${phaseName}`;
      const isLoading = loadingPhase === loadingKey;
      const phaseOrder = (['phase1', 'phase2', 'phase3'] as const).slice(0, challenge.totalPhases ?? 3);
      const nextIncomplete = phaseOrder.find((phaseKey) => !challenge.phases?.[phaseKey]?.completed);
      const isFailedThisPhase = challenge.status === 'failed' && nextIncomplete === phaseName && !phase.completed;
      const failedIndex = challenge.status === 'failed' && nextIncomplete ? phaseOrder.indexOf(nextIncomplete) : -1;
      const currentIndex = phaseOrder.indexOf(phaseName);
      const disabledDueToFailure = challenge.status === 'failed' && currentIndex > failedIndex;
      const isActiveNext = challenge.status !== 'failed' && nextIncomplete === phaseName && !phase.completed;
      const disabledDueToProgression =
        (phaseName === 'phase2' && !challenge.phases.phase1.completed) ||
        (phaseName === 'phase3' && (!challenge.phases.phase1.completed || !challenge.phases.phase2.completed));
      const isDisabled = isLoading || disabledDueToFailure || disabledDueToProgression || challenge.status === 'failed';

      return (
        <Button
          key={phaseName}
          size="sm"
          variant={
            challenge.status === 'failed'
              ? (isFailedThisPhase ? 'danger' : 'secondary')
              : (phase.completed ? 'success' : (isActiveNext ? 'primary' : 'ghost'))
          }
          onClick={() => handlePhaseToggle(challenge.id, phaseName)}
          loading={isLoading}
          disabled={isDisabled}
          leftIcon={
            isFailedThisPhase
              ? <XCircle className="w-4 h-4" />
              : phase.completed
              ? <CheckCircle2 className="w-4 h-4" />
              : <Circle className="w-4 h-4" />
          }
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
          {phaseName.replace('phase', 'Phase ')}{isActiveNext ? ' · Active' : ''}
        </Button>
      );
    });
  };

  const renderGroupCard = (group: ChallengeGroup) => {
    const representative = group.challenges[0];
    const groupNumbers = group.challenges
      .map((challenge) => challengeNumberMap.get(challenge.id))
      .filter((value): value is number => typeof value === 'number')
      .sort((a, b) => a - b);
    const challengeNumberLabel = groupNumbers.length <= 1
      ? `${groupNumbers[0] ?? 0}`
      : `${groupNumbers[0]}-${groupNumbers[groupNumbers.length - 1]}`;
    const groupIsLive = group.challenges.some(isChallengeLive);
    const expandable = group.challenges.length > 1;
    const isExpanded = !expandable || expandedGroupIds.has(group.id);
    const totalCost = group.challenges.reduce((sum, challenge) => sum + Number(challenge.cost || 0), 0);
    const totalPayouts = group.challenges.reduce((sum, challenge) => sum + getTotalPayouts(challenge), 0);
    const selectedInGroup = group.challenges.filter((challenge) => selectedChallengeIds.has(challenge.id));
    const selectedIdsInGroup = selectedInGroup.map((challenge) => challenge.id);
    const actionableSelected = selectedInGroup.filter((challenge) => challenge.status !== 'failed');
    const selectedNextPhases = actionableSelected
      .map((challenge) => getNextIncompletePhase(challenge))
      .filter((phase): phase is 'phase1'|'phase2'|'phase3' => Boolean(phase));
    const canBulkUpdate = actionableSelected.length > 0 && selectedNextPhases.length === actionableSelected.length && new Set(selectedNextPhases).size === 1;

    return (
      <motion.div
        key={group.id}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.98 }}
        transition={{ duration: 0.2, ease: 'easeOut' }}
      >
        <div className={`relative rounded-xl border p-5 backdrop-blur-sm transition-all duration-300 ${
          groupIsLive
            ? 'border-emerald-400/40 bg-gradient-to-br from-gray-900/90 to-gray-800/60 shadow-[0_0_40px_rgba(16,185,129,0.25)] hover:border-emerald-400/60 hover:shadow-[0_0_50px_rgba(16,185,129,0.35)]'
            : 'border-white/10 bg-gradient-to-br from-gray-900/90 to-gray-800/60 hover:border-cyan-400/30 hover:shadow-[0_0_30px_rgba(6,182,212,0.15)]'
        }`}>
          <div className={`absolute inset-0 rounded-xl ${
            groupIsLive
              ? 'bg-gradient-to-r from-emerald-500/5 via-green-500/5 to-emerald-500/5'
              : 'bg-gradient-to-r from-cyan-500/0 via-purple-500/0 to-cyan-500/0 group-hover:from-cyan-500/5 group-hover:via-purple-500/5 group-hover:to-cyan-500/5'
          }`} />

          <div className="relative space-y-4">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-cyan-400/40 bg-gradient-to-br from-cyan-500/20 to-purple-500/20 text-sm font-bold text-cyan-200 shadow-[0_0_15px_rgba(6,182,212,0.3)]">
                    {challengeNumberLabel}
                  </span>
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-lg font-bold text-white">{firmName(representative.propFirmId)}</span>
                      {expandable && (
                        <span className="inline-flex items-center gap-1 rounded-full border border-cyan-400/30 bg-cyan-500/10 px-3 py-1 text-xs font-semibold text-cyan-200">
                          <Users2 className="h-3.5 w-3.5" />
                          {group.challenges.length} Accounts
                        </span>
                      )}
                      {group.label && (
                        <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium text-white/70">
                          {group.label}
                        </span>
                      )}
                      {groupIsLive && (
                        <span className="inline-flex items-center gap-1.5 rounded-full border-2 border-emerald-400/60 bg-gradient-to-r from-emerald-500/30 to-green-500/30 px-3 py-1">
                          <Flame className="h-4 w-4 text-emerald-300" />
                          <span className="text-xs font-black tracking-wider text-emerald-200">LIVE</span>
                        </span>
                      )}
                    </div>
                    <div className="text-sm font-semibold text-cyan-300">
                      ${Number(representative.accountSize || 0).toLocaleString()} Account{expandable ? ' Size' : ''}
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-white/60">
                  <span>Started: <span className="font-medium text-cyan-300/80">{representative.startDate || '—'}</span></span>
                  <span className="text-white/20">•</span>
                  <span>{expandable ? 'Total Cost' : 'Cost'}: <span className="font-medium text-red-300/80">${totalCost.toFixed(2)}</span></span>
                  <span className="text-white/20">•</span>
                  <span>Payouts: <span className="font-medium text-green-300/80">${totalPayouts.toFixed(2)}</span></span>
                  {expandable && (
                    <>
                      <span className="text-white/20">•</span>
                      <span>
                        Status: <span className="font-medium text-white/80">
                          {group.challenges.filter((challenge) => challenge.status !== 'failed').length} active / {group.challenges.filter(isChallengeLive).length} live / {group.challenges.filter((challenge) => challenge.status === 'failed').length} failed
                        </span>
                      </span>
                    </>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2">
                {expandable ? (
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => toggleGroupExpanded(group.id)}
                    leftIcon={<ChevronDown className={`h-4 w-4 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />}
                    className="px-3 !bg-white/5 hover:!bg-white/10 border-white/10 hover:border-white/20"
                  >
                    {isExpanded ? 'Hide Accounts' : 'Show Accounts'}
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => onEdit(representative)}
                    leftIcon={<Pencil className="w-4 h-4" />}
                    className="px-3 !bg-white/5 hover:!bg-white/10 border-white/10 hover:border-white/20"
                  >
                    Edit
                  </Button>
                )}
              </div>
            </div>

            {isExpanded && (
              <div className="space-y-4 border-t border-white/10 pt-4">
                {expandable && (
                  <div className="rounded-xl border border-white/10 bg-black/15 p-3">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                      <div className="flex flex-wrap items-center gap-2 text-sm text-white/70">
                        <span className="inline-flex items-center gap-2 rounded-full border border-cyan-400/20 bg-cyan-500/10 px-3 py-1 text-cyan-200">
                          <Layers3 className="h-3.5 w-3.5" />
                          {selectedInGroup.length} selected
                        </span>
                        <button
                          type="button"
                          onClick={() => setSelectionForGroup(group, group.challenges.filter((challenge) => challenge.status !== 'failed').map((challenge) => challenge.id))}
                          className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-white/75 transition hover:bg-white/10 hover:text-white"
                        >
                          Select All Active
                        </button>
                        <button
                          type="button"
                          onClick={() => setSelectionForGroup(group, [])}
                          className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-white/75 transition hover:bg-white/10 hover:text-white"
                        >
                          Clear
                        </button>
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        <Button size="sm" variant="primary" disabled={!canBulkUpdate} onClick={() => handleBulkPhaseAction(selectedIdsInGroup)}>
                          Pass Selected
                        </Button>
                        <Button
                          size="sm"
                          variant="danger"
                          disabled={!canBulkUpdate}
                          onClick={() => {
                            if (!canBulkUpdate) return;
                            setFailConfirm({
                              ids: selectedIdsInGroup,
                              phase: selectedNextPhases[0],
                              date: new Date().toISOString().slice(0, 10),
                            });
                          }}
                        >
                          Fail Selected
                        </Button>
                      </div>
                    </div>
                  </div>
                )}

                <div className="space-y-3">
                  {group.challenges.map((challenge) => {
                    const isLive = isChallengeLive(challenge);
                    const label = challenge.purchaseGroupIndex ? `Account ${challenge.purchaseGroupIndex}` : challenge.brokerName;

                    return (
                      <div key={challenge.id} className="rounded-xl border border-white/10 bg-black/20 p-4">
                        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                          <div className="flex items-start gap-3">
                            {expandable && (
                              <input
                                type="checkbox"
                                checked={selectedChallengeIds.has(challenge.id)}
                                onChange={() => toggleChallengeSelection(challenge.id)}
                                className="mt-1 h-4 w-4 rounded border-white/20 bg-white/5 text-cyan-400 focus:ring-cyan-500/40"
                              />
                            )}

                            <div className="space-y-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="text-sm font-semibold text-white">{label}</span>
                                {isLive && (
                                  <span className="rounded-full border border-emerald-400/40 bg-emerald-500/10 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-emerald-200">
                                    Live
                                  </span>
                                )}
                                {challenge.status === 'failed' && (
                                  <span className="rounded-full border border-red-400/40 bg-red-500/10 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-red-200">
                                    Failed
                                  </span>
                                )}
                              </div>

                              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-white/55">
                                <span>Cost: ${Number(challenge.cost || 0).toFixed(2)}</span>
                                <span>Payouts: ${getTotalPayouts(challenge).toFixed(2)}</span>
                                <span>Started: {challenge.startDate || '—'}</span>
                              </div>
                            </div>
                          </div>

                          <div className="flex flex-wrap items-center gap-2">
                            {renderPhaseButtons(challenge)}
                            {isLive && challenge.status !== 'failed' && onFailLiveAccount && (
                              <Button
                                size="sm"
                                variant="danger"
                                onClick={() => onFailLiveAccount(challenge.id)}
                                leftIcon={<XCircle className="w-4 h-4" />}
                                className="px-3 !bg-red-500/20 hover:!bg-red-500/30 border-red-500/50"
                              >
                                Fail
                              </Button>
                            )}
                            {isLive && challenge.status !== 'failed' && (
                              <Button size="sm" variant="success" onClick={() => onEdit(challenge)} className="px-3">
                                Add Payout
                              </Button>
                            )}
                            <Button
                              size="sm"
                              variant="secondary"
                              onClick={() => onEdit(challenge)}
                              leftIcon={<Pencil className="w-4 h-4" />}
                              className="px-3 !bg-white/5 hover:!bg-white/10 border-white/10 hover:border-white/20"
                            >
                              Edit
                            </Button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      </motion.div>
    );
  };

  return (
    <>
      {validChallenges.length === 0 ? (
        <div className="relative rounded-2xl border border-white/10 bg-gradient-to-br from-gray-900/80 to-gray-800/50 p-12 backdrop-blur-sm">
          <div className="absolute inset-0 rounded-2xl bg-gradient-to-r from-cyan-500/5 to-purple-500/5" />
          <div className="relative text-center">
            <div className="mb-4 inline-flex h-16 w-16 items-center justify-center rounded-full border border-cyan-400/30 bg-gradient-to-br from-cyan-500/20 to-purple-500/20">
              <Circle className="h-8 w-8 text-cyan-400" />
            </div>
            <div className="mb-2 text-xl font-bold text-white/80">No challenges yet</div>
            <div className="text-sm text-white/50">Add your first trading challenge above to get started!</div>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3">
          <AnimatePresence mode="popLayout">
            {paginatedGroups.map((group) => renderGroupCard(group))}
          </AnimatePresence>
        </div>
      )}

      {validChallenges.length > 0 && (
        <div className="mt-6 flex flex-col items-center justify-between gap-4 rounded-xl border border-white/10 bg-gradient-to-br from-gray-900/60 to-gray-800/40 p-4 backdrop-blur-sm sm:flex-row">
          <div className="flex items-center gap-3 text-sm">
            <span className="text-white/60">
              Showing <span className="font-semibold text-cyan-300">{startIndex + 1}-{Math.min(endIndex, groupedForDisplay.length)}</span> of <span className="font-semibold text-cyan-300">{groupedForDisplay.length}</span> challenge groups
            </span>
            <div className="page-size-selector relative">
              <button
                onClick={() => setShowPageSizeSelector(!showPageSizeSelector)}
                className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white/70 transition-all duration-200 hover:border-cyan-400/30 hover:bg-white/10 hover:text-white"
              >
                <Settings className="h-3 w-3" />
                {itemsPerPage} per page
              </button>
              {showPageSizeSelector && (
                <div className="absolute left-0 top-full z-10 mt-2 overflow-hidden rounded-lg border border-white/20 bg-gray-900/95 shadow-[0_0_30px_rgba(6,182,212,0.2)] backdrop-blur-md">
                  {[5, 10, 20, 50].map((size) => (
                    <button
                      key={size}
                      onClick={() => {
                        setItemsPerPage(size);
                        setCurrentPage(1);
                        setShowPageSizeSelector(false);
                      }}
                      className={`block w-full px-4 py-2.5 text-left text-xs transition-colors hover:bg-cyan-500/10 ${
                        itemsPerPage === size ? 'bg-gradient-to-r from-cyan-500/20 to-purple-500/20 font-semibold text-cyan-200' : 'text-white/70'
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
                onClick={() => setCurrentPage(currentPage - 1)}
                disabled={currentPage === 1}
                className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs font-medium text-white/70 transition-all duration-200 hover:border-cyan-400/30 hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:border-white/10 disabled:bg-white/5 disabled:text-white/40"
              >
                <ChevronLeft className="h-4 w-4" />
                Previous
              </button>
              <div className="flex items-center gap-1.5">
                {Array.from({ length: Math.min(5, totalPages) }, (_, index) => {
                  let pageNum = index + 1;
                  if (totalPages > 5) {
                    if (currentPage <= 3) pageNum = index + 1;
                    else if (currentPage >= totalPages - 2) pageNum = totalPages - 4 + index;
                    else pageNum = currentPage - 2 + index;
                  }

                  if (pageNum < 1 || pageNum > totalPages) return null;

                  return (
                    <button
                      key={`page-${pageNum}`}
                      onClick={() => setCurrentPage(pageNum)}
                      className={`h-10 min-w-[2.5rem] rounded-lg text-sm font-semibold transition-all duration-200 ${
                        currentPage === pageNum
                          ? 'border border-cyan-400/50 bg-gradient-to-r from-cyan-500/30 to-purple-500/30 text-cyan-200 shadow-[0_0_20px_rgba(6,182,212,0.3)]'
                          : 'border border-white/10 bg-white/5 text-white/60 hover:border-white/20 hover:bg-white/10 hover:text-white'
                      }`}
                    >
                      {pageNum}
                    </button>
                  );
                }).filter(Boolean)}
              </div>
              <button
                onClick={() => setCurrentPage(currentPage + 1)}
                disabled={currentPage === totalPages}
                className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs font-medium text-white/70 transition-all duration-200 hover:border-cyan-400/30 hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:border-white/10 disabled:bg-white/5 disabled:text-white/40"
              >
                Next
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>
      )}

      <PhaseOutcomePrompt
        open={phasePromptOpen}
        phase={phasePromptPhase}
        totalPhases={(validChallenges.find((challenge) => challenge.id === phasePromptChallengeIds[0])?.totalPhases || 3) as 1 | 2 | 3}
        accountCount={phasePromptChallengeIds.length}
        requiresActivationFee={validChallenges
          .filter((challenge) => phasePromptChallengeIds.includes(challenge.id))
          .some((challenge) => !!challenge.hasActivationFee && typeof challenge.activationFeeAmount !== 'number' && getFinalPhaseForChallenge(challenge) === phasePromptPhase)}
        onCancel={() => {
          setPhasePromptOpen(false);
          setPhasePromptChallengeIds([]);
        }}
        onSubmit={async (outcome, date, activationFeeAmount) => {
          try {
            const promptChallenges = validChallenges.filter((challenge) => phasePromptChallengeIds.includes(challenge.id));
            if (promptChallenges.length === 0) return;

            if (outcome === 'failed') {
              setFailConfirm({ ids: promptChallenges.map((challenge) => challenge.id), phase: phasePromptPhase, date });
              return;
            }

            for (const challenge of promptChallenges) {
              await apiClient.markPhase(challenge.id, phasePromptPhase, true, date);

              const shouldAddActivationFee =
                !!challenge.hasActivationFee &&
                typeof challenge.activationFeeAmount !== 'number' &&
                getFinalPhaseForChallenge(challenge) === phasePromptPhase;
              const normalizedActivationFee = shouldAddActivationFee ? Number(activationFeeAmount ?? 0) : undefined;
              const updatedCost = shouldAddActivationFee
                ? Number(((challenge.initialCost ?? challenge.cost ?? 0) + (normalizedActivationFee ?? 0)).toFixed(2))
                : challenge.cost;

              const passedChallenge: Challenge = {
                ...challenge,
                status: 'active',
                initialCost: challenge.initialCost ?? challenge.cost,
                activationFeeAmount: shouldAddActivationFee ? normalizedActivationFee : challenge.activationFeeAmount,
                cost: updatedCost,
                phases: {
                  ...challenge.phases,
                  [phasePromptPhase]: {
                    ...challenge.phases[phasePromptPhase],
                    completed: true,
                    completedAt: date,
                  },
                },
              };

              if (shouldAddActivationFee) {
                await apiClient.updateChallenge(passedChallenge);
              }

              onChallengeUpdate(passedChallenge);

              if (!buildingMode && onAutomaticCalendarIntegration) {
                await onAutomaticCalendarIntegration(passedChallenge, phasePromptPhase);
              }
            }

            setSelectedChallengeIds((prev) => {
              const next = new Set(prev);
              phasePromptChallengeIds.forEach((id) => next.delete(id));
              return next;
            });
          } catch (error) {
            console.error('Phase outcome handling failed:', error);
            alert('Failed to save phase outcome.');
          } finally {
            setPhasePromptOpen(false);
            setPhasePromptChallengeIds([]);
          }
        }}
      />

      <ConfirmDialog
        isOpen={!!failConfirm}
        title="Mark Challenge as Failed"
        message="Are you sure you want to mark this challenge as failed? This will lock the challenge and its phases."
        confirmText="Mark as Failed"
        cancelText="Cancel"
        variant="danger"
        loading={loadingFailConfirm}
        onConfirm={async () => {
          if (!failConfirm) return;

          const targetedChallenges = validChallenges.filter((challenge) => failConfirm.ids.includes(challenge.id));
          if (targetedChallenges.length === 0) {
            setFailConfirm(null);
            return;
          }

          try {
            setLoadingFailConfirm(true);

            for (const challenge of targetedChallenges) {
              await apiClient.markPhase(challenge.id, failConfirm.phase, false);
              onChallengeUpdate({
                ...challenge,
                status: 'failed',
                phases: {
                  ...challenge.phases,
                  [failConfirm.phase]: {
                    ...challenge.phases[failConfirm.phase],
                    completed: false,
                    completedAt: undefined,
                  },
                },
              });
            }

            await apiClient.bulkUpdateStatus(failConfirm.ids, 'failed');

            if (setCalendar && calendar) {
              setCalendar((prev: any) => ({
                ...prev,
                accountData: prev.accountData.map((accountData: any) => {
                  const copy = { ...accountData, challengePhases: [...accountData.challengePhases] };
                  failConfirm.ids.forEach((id) => {
                    try {
                      archiveFailedChallenge(copy, id);
                    } catch {}
                  });
                  return copy;
                }),
              }));
            }

            setSelectedChallengeIds((prev) => {
              const next = new Set(prev);
              failConfirm.ids.forEach((id) => next.delete(id));
              return next;
            });
          } catch (error) {
            console.error('Confirm fail error:', error);
            alert('Failed to mark as failed. Please try again.');
          } finally {
            setLoadingFailConfirm(false);
            setFailConfirm(null);
          }
        }}
        onCancel={() => setFailConfirm(null)}
      />
    </>
  );
};
