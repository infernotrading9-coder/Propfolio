import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { PlusCircle, Sparkles, X } from 'lucide-react';
import { ChallengeForm } from './ChallengeForm';
import { PropFirm, NewChallengeInput, Challenge, NewFirmInput } from '../types';

export const AddChallengeModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  firms: PropFirm[];
  defaultFirmId?: string | null;
  onSubmit: (input: NewChallengeInput | Challenge) => void;
  onAddFirm?: (input: NewFirmInput) => Promise<PropFirm>;
  buildingMode?: boolean;
}> = ({ isOpen, onClose, firms, defaultFirmId, onSubmit, onAddFirm, buildingMode = false }) => {
  
  const handleSubmit = (input: NewChallengeInput | Challenge) => {
    onSubmit(input);
    // Modal closing is now handled by parent component for better UX
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/70 backdrop-blur-sm z-40"
            onClick={onClose}
          />
          
          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.8, y: 50 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.8, y: 50 }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4"
          >
            <div className="w-full max-w-5xl max-h-[92vh] overflow-y-auto sm:max-h-[88vh]">
              <div className="relative overflow-hidden rounded-t-2xl border border-cyan-500/30 bg-[#0a0e17] shadow-[0_0_40px_rgba(6,182,212,0.28)] sm:rounded-2xl">
                <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-cyan-500/10 blur-3xl" />
                <div className="pointer-events-none absolute -left-20 bottom-0 h-48 w-48 rounded-full bg-purple-500/10 blur-3xl" />
                {/* Header */}
                <div className="sticky top-0 z-10 border-b border-white/10 bg-[#0a0e17]/95 px-4 py-4 backdrop-blur-sm sm:px-6">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <motion.div
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        className="mb-2 inline-flex items-center gap-2 rounded-full border border-cyan-400/20 bg-cyan-500/10 px-3 py-1 text-xs font-medium text-cyan-200"
                      >
                        <Sparkles className="h-3.5 w-3.5" />
                        Challenge Builder
                      </motion.div>
                      <motion.div
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        className="flex items-center gap-3"
                      >
                        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-500/20 to-blue-600/20 text-cyan-200">
                          <PlusCircle className="h-5 w-5" />
                        </div>
                        <div>
                          <h2 className="pr-3 text-lg font-bold text-white sm:text-2xl">
                            Add Challenge Batch
                          </h2>
                          <p className="text-sm text-white/55">
                            Create one account or a linked batch in one step.
                          </p>
                        </div>
                      </motion.div>
                    </div>
                  <motion.button
                    whileHover={{ scale: 1.1, rotate: 90 }}
                    whileTap={{ scale: 0.9 }}
                    onClick={onClose}
                    className="rounded-lg border border-white/10 bg-white/5 p-2 transition-colors hover:bg-white/10"
                  >
                    <X className="w-5 h-5 text-white/70" />
                  </motion.button>
                  </div>
                </div>
                
                {/* Content */}
                <motion.div 
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.1 }}
                  className="p-3 sm:p-5"
                >
                  <ChallengeForm
                    firms={firms}
                    defaultFirmId={defaultFirmId}
                    onSubmit={handleSubmit}
                    onAddFirm={onAddFirm}
                    buildingMode={buildingMode}
                  />
                </motion.div>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};
