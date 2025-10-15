import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Trophy, Archive, Clock, TrendingUp, Eye, EyeOff } from 'lucide-react';
import { NeonCard } from './NeonCard';
import { Button } from './ui/Button';
import { ChallengePhase } from '../utils/calendarStorage';

interface ActiveChallengesProps {
  activeChallenges: ChallengePhase[];
  archivedChallenges: ChallengePhase[];
  onArchive?: (phaseId: string) => void;
}

export const ActiveChallenges: React.FC<ActiveChallengesProps> = ({
  activeChallenges,
  archivedChallenges,
  onArchive
}) => {
  const [showArchived, setShowArchived] = useState(false);

  const getPhaseIcon = (phase: string) => {
    switch (phase) {
      case 'initial':
        return <Trophy className="w-4 h-4 text-cyan-400" />;
      case 'phase1':
        return <TrendingUp className="w-4 h-4 text-lime-400" />;
      case 'phase2':
        return <TrendingUp className="w-4 h-4 text-amber-400" />;
      case 'phase3':
        return <Trophy className="w-4 h-4 text-purple-400" />;
      default:
        return <Clock className="w-4 h-4 text-white/60" />;
    }
  };

  const getPhaseColor = (phase: string) => {
    switch (phase) {
      case 'initial':
        return 'border-cyan-400/50 bg-cyan-500/10';
      case 'phase1':
        return 'border-lime-400/50 bg-lime-500/10';
      case 'phase2':
        return 'border-amber-400/50 bg-amber-500/10';
      case 'phase3':
        return 'border-purple-400/50 bg-purple-500/10';
      default:
        return 'border-white/20 bg-white/5';
    }
  };

  const formatPhaseTitle = (phase: string) => {
    switch (phase) {
      case 'initial':
        return 'Phase 1';
      case 'phase1':
        return 'Phase 2';
      case 'phase2':
        return 'Phase 3';
      case 'phase3':
        return 'Live Account';
      default:
        return phase;
    }
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-white drop-shadow-neon">
          Active Challenges
        </h3>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setShowArchived(!showArchived)}
            leftIcon={showArchived ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          >
            {showArchived ? 'Hide' : 'Show'} Archived ({archivedChallenges.length})
          </Button>
        </div>
      </div>

      {/* Active Challenges */}
      {activeChallenges.length === 0 ? (
        <NeonCard glow="cyan" className="p-6 text-center">
          <div className="text-white/60">
            <Clock className="w-8 h-8 mx-auto mb-2 text-white/40" />
            <div className="text-sm">No active challenges</div>
            <div className="text-xs mt-1">Add challenges from your Prop Firm Dashboard to track them here</div>
          </div>
        </NeonCard>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <AnimatePresence mode="popLayout">
            {activeChallenges.map((challenge, index) => (
              <motion.div
                key={challenge.id}
                initial={{ opacity: 0, y: 20, scale: 0.9 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, x: -100, scale: 0.95 }}
                transition={{ 
                  duration: 0.3, 
                  delay: index * 0.05,
                  type: 'spring',
                  stiffness: 300
                }}
                layout
              >
                <NeonCard glow="cyan" className="p-4">
                  <div className="space-y-3">
                    {/* Challenge Header */}
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-2">
                        <div className={`p-2 rounded-lg border ${getPhaseColor(challenge.phase)}`}>
                          {getPhaseIcon(challenge.phase)}
                        </div>
                        <div>
                          <div className="text-sm font-medium text-white">
                            {challenge.firmName}
                          </div>
                          <div className="text-xs text-white/60">
                            #{challenge.challengeNumber} • ${(challenge.accountSize / 1000).toFixed(0)}K
                          </div>
                        </div>
                      </div>
                      {onArchive && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => onArchive(challenge.id)}
                          className="px-2 opacity-60 hover:opacity-100"
                          title="Archive this challenge"
                        >
                          <Archive className="w-3 h-3" />
                        </Button>
                      )}
                    </div>

                    {/* Phase Info */}
                    <div className={`p-3 rounded-lg border ${getPhaseColor(challenge.phase)}`}>
                      <div className="text-xs font-medium text-white mb-1">
                        Current: {formatPhaseTitle(challenge.phase)}
                      </div>
                      <div className="text-xs text-white/70">
                        {challenge.description}
                      </div>
                    </div>

                    {/* Timeline */}
                    <div className="text-xs text-white/50">
                      Added {new Date(challenge.createdAt).toLocaleDateString()}
                    </div>
                  </div>
                </NeonCard>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}

      {/* Archived Challenges */}
      <AnimatePresence>
        {showArchived && archivedChallenges.length > 0 && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.3 }}
          >
            <div className="border-t border-white/10 pt-4">
              <h4 className="text-sm font-medium text-white/70 mb-3 flex items-center gap-2">
                <Archive className="w-4 h-4" />
                Archived Challenges ({archivedChallenges.length})
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {archivedChallenges.map((challenge) => (
                  <div
                    key={challenge.id}
                    className="bg-white/5 border border-white/10 rounded-lg p-3 opacity-60"
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <div className="p-1 rounded bg-white/10">
                        {getPhaseIcon(challenge.phase)}
                      </div>
                      <div>
                        <div className="text-xs font-medium text-white/80">
                          {challenge.firmName}
                        </div>
                        <div className="text-xs text-white/50">
                          #{challenge.challengeNumber} • {formatPhaseTitle(challenge.phase)}
                        </div>
                      </div>
                    </div>
                    <div className="text-xs text-white/40">
                      Archived {challenge.archivedAt ? new Date(challenge.archivedAt).toLocaleDateString() : 'Unknown'}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};