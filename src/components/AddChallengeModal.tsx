import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';
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
            <div className="w-full max-w-4xl max-h-[92vh] overflow-y-auto sm:max-h-[85vh]">
              <div className="relative rounded-t-2xl border border-cyan-500/30 bg-[#0a0e17] shadow-[0_0_30px_rgba(6,182,212,0.3)] sm:rounded-lg">
                {/* Header */}
                <div className="sticky top-0 z-10 flex items-center justify-between border-b border-white/10 bg-[#0a0e17]/95 p-4 backdrop-blur-sm">
                  <motion.h2 
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    className="pr-3 text-lg font-bold text-white sm:text-xl"
                  >
                    ✨ Add New Challenge
                  </motion.h2>
                  <motion.button
                    whileHover={{ scale: 1.1, rotate: 90 }}
                    whileTap={{ scale: 0.9 }}
                    onClick={onClose}
                    className="p-2 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 transition-colors"
                  >
                    <X className="w-5 h-5 text-white/70" />
                  </motion.button>
                </div>
                
                {/* Content */}
                <motion.div 
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.1 }}
                  className="p-3 sm:p-4"
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
