import React from 'react';
import { motion } from 'framer-motion';
import { CheckSquare, Square, Settings, Trash2, CheckCircle, XCircle, Clock } from 'lucide-react';
import { Challenge, ChallengeStatus } from '../types';
import { NeonCard } from './NeonCard';

interface BulkActionsProps {
  challenges: Challenge[];
  selectedChallengeIds: Set<string>;
  onSelectAll: () => void;
  onDeselectAll: () => void;
  onBulkStatusChange: (challengeIds: string[], newStatus: ChallengeStatus) => void;
  buildingMode: boolean;
}

export const BulkActions: React.FC<BulkActionsProps> = ({
  challenges,
  selectedChallengeIds,
  onSelectAll,
  onDeselectAll,
  onBulkStatusChange,
  buildingMode
}) => {
  const [showStatusModal, setShowStatusModal] = React.useState(false);

  const selectedCount = selectedChallengeIds.size;
  const allSelected = challenges.length > 0 && selectedChallengeIds.size === challenges.length;
  const someSelected = selectedChallengeIds.size > 0;

  const handleStatusChange = (newStatus: ChallengeStatus) => {
    const selectedIds = Array.from(selectedChallengeIds);
    onBulkStatusChange(selectedIds, newStatus);
    setShowStatusModal(false);
  };

  if (!buildingMode || challenges.length === 0) return null;

  return (
    <>
      <NeonCard className="p-4 mb-6" glow="cyan">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            {/* Master checkbox */}
            <button
              onClick={allSelected ? onDeselectAll : onSelectAll}
              className="flex items-center gap-2 text-sm text-cyan-300 hover:text-cyan-200 transition-colors"
            >
              {allSelected ? (
                <CheckSquare className="w-4 h-4" />
              ) : (
                <Square className="w-4 h-4" />
              )}
              {allSelected ? 'Deselect All' : 'Select All'}
            </button>

            {/* Selected count */}
            {someSelected && (
              <div className="text-sm text-white/70">
                {selectedCount} challenge{selectedCount !== 1 ? 's' : ''} selected
              </div>
            )}
          </div>

          {/* Bulk actions */}
          {someSelected && (
            <div className="flex items-center gap-2">
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => setShowStatusModal(true)}
                className="flex items-center gap-2 px-3 py-2 rounded-lg bg-gradient-to-r from-purple-500/10 to-cyan-500/10 hover:from-purple-500/20 hover:to-cyan-500/20 border border-purple-400/50 hover:border-cyan-400/50 text-purple-200 hover:text-cyan-200 transition-all duration-300"
              >
                <Settings className="w-4 h-4" />
                Change Status
              </motion.button>

              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={onDeselectAll}
                className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/5 hover:bg-white/10 border border-white/20 hover:border-white/30 text-white/70 hover:text-white transition-all duration-300"
              >
                <Trash2 className="w-4 h-4" />
                Clear Selection
              </motion.button>
            </div>
          )}
        </div>
      </NeonCard>

      {/* Status Change Modal */}
      {showStatusModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.8, y: 50 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.8, y: 50 }}
            className="bg-[#0a0e17] border border-cyan-500/30 rounded-lg shadow-[0_0_30px_rgba(6,182,212,0.3)] p-6 w-full max-w-md"
          >
            <h3 className="text-xl font-bold text-white mb-4">
              Change Status for {selectedCount} Challenge{selectedCount !== 1 ? 's' : ''}
            </h3>
            
            <p className="text-white/70 mb-6 text-sm">
              Select the new status for all selected challenges:
            </p>

            <div className="space-y-3 mb-6">
              {/* Active Status */}
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => handleStatusChange('active')}
                className="w-full flex items-center gap-3 p-4 rounded-lg bg-gradient-to-r from-cyan-500/10 to-cyan-600/10 hover:from-cyan-500/20 hover:to-cyan-600/20 border border-cyan-400/30 hover:border-cyan-400/50 transition-all duration-300"
              >
                <Clock className="w-5 h-5 text-cyan-400" />
                <div className="text-left">
                  <div className="text-cyan-200 font-medium">Active</div>
                  <div className="text-cyan-300/70 text-sm">Mark as active challenges</div>
                </div>
              </motion.button>

              {/* Passed · Awaiting Activation Status */}
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => handleStatusChange('passed_inactive')}
                className="w-full flex items-center gap-3 p-4 rounded-lg bg-gradient-to-r from-amber-500/10 to-amber-600/10 hover:from-amber-500/20 hover:to-amber-600/20 border border-amber-400/30 hover:border-amber-400/50 transition-all duration-300"
              >
                <Clock className="w-5 h-5 text-amber-400" />
                <div className="text-left">
                  <div className="text-amber-200 font-medium">Passed · Awaiting Activation</div>
                  <div className="text-amber-300/70 text-sm">Passed, activation fee not paid yet</div>
                </div>
              </motion.button>

              {/* Passed Status */}
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => handleStatusChange('passed')}
                className="w-full flex items-center gap-3 p-4 rounded-lg bg-gradient-to-r from-emerald-500/10 to-emerald-600/10 hover:from-emerald-500/20 hover:to-emerald-600/20 border border-emerald-400/30 hover:border-emerald-400/50 transition-all duration-300"
              >
                <CheckCircle className="w-5 h-5 text-emerald-400" />
                <div className="text-left">
                  <div className="text-emerald-200 font-medium">Passed</div>
                  <div className="text-emerald-300/70 text-sm">Mark as successfully completed</div>
                </div>
              </motion.button>

              {/* Failed Status */}
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => handleStatusChange('failed')}
                className="w-full flex items-center gap-3 p-4 rounded-lg bg-gradient-to-r from-rose-500/10 to-rose-600/10 hover:from-rose-500/20 hover:to-rose-600/20 border border-rose-400/30 hover:border-rose-400/50 transition-all duration-300"
              >
                <XCircle className="w-5 h-5 text-rose-400" />
                <div className="text-left">
                  <div className="text-rose-200 font-medium">Failed</div>
                  <div className="text-rose-300/70 text-sm">Mark as failed/terminated</div>
                </div>
              </motion.button>
            </div>

            <div className="flex gap-3">
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => setShowStatusModal(false)}
                className="flex-1 px-4 py-2 rounded-lg bg-white/10 hover:bg-white/15 border border-white/20 hover:border-white/30 text-white/70 hover:text-white transition-all duration-300"
              >
                Cancel
              </motion.button>
            </div>
          </motion.div>
        </div>
      )}
    </>
  );
};