import React, { useState, useEffect } from 'react';
import { todayLocalISO } from '../utils/dates';
import { motion, AnimatePresence } from 'framer-motion';
import { Calendar, X } from 'lucide-react';

interface PhaseDateModalProps {
  isOpen: boolean;
  title: string;
  onConfirm: (date: string) => void;
  onCancel: () => void;
  defaultDate?: string;
}

export const PhaseDateModal: React.FC<PhaseDateModalProps> = ({ isOpen, title, onConfirm, onCancel, defaultDate }) => {
  const [date, setDate] = useState<string>('');

  useEffect(() => {
    if (isOpen) {
      const today = todayLocalISO();
      setDate(defaultDate || today);
    }
  }, [isOpen, defaultDate]);

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50"
          onClick={onCancel}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ type: 'spring', stiffness: 280, damping: 22 }}
            className="bg-[#0b0f17] border border-white/15 rounded-xl p-6 w-full max-w-md shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-cyan-500/20 border border-cyan-400/40">
                  <Calendar className="w-5 h-5 text-cyan-300" />
                </div>
                <h3 className="text-lg font-semibold text-white">{title}</h3>
              </div>
              <button onClick={onCancel} className="p-2 text-white/60 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-4">
              <label className="block text-sm text-white/70">Select completion date</label>
              <input
                type="date"
                className="w-full bg-white/5 border border-white/10 rounded-md p-2 text-white"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
              <div className="flex justify-end gap-2 pt-2">
                <button
                  onClick={onCancel}
                  className="px-4 py-2 rounded-md bg-white/5 border border-white/10 text-white/80 hover:bg-white/10"
                >
                  Cancel
                </button>
                <button
                  onClick={() => onConfirm(date)}
                  className="px-4 py-2 rounded-md bg-gradient-to-r from-cyan-500 to-blue-600 text-white font-semibold hover:from-cyan-400 hover:to-blue-500"
                >
                  Save
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
