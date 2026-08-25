import React from 'react';
import { todayLocalISO } from '../utils/dates';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle, XCircle, Calendar } from 'lucide-react';
import { Button } from './ui/Button';

interface PhaseCompletionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onComplete: (passed: boolean, date: string) => void;
  phaseName: string;
}

export const PhaseCompletionModal: React.FC<PhaseCompletionModalProps> = ({
  isOpen,
  onClose,
  onComplete,
  phaseName
}) => {
  const [step, setStep] = React.useState<'choice' | 'date'>('choice');
  const [passed, setPassed] = React.useState<boolean | null>(null);
  const [date, setDate] = React.useState(todayLocalISO());
  const [loading, setLoading] = React.useState(false);

  // Reset state when modal opens
  React.useEffect(() => {
    if (isOpen) {
      setStep('choice');
      setPassed(null);
      setDate(todayLocalISO());
      setLoading(false);
    }
  }, [isOpen]);

  const handleChoice = (didPass: boolean) => {
    setPassed(didPass);
    setStep('date');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (passed === null) return;
    
    setLoading(true);
    try {
      await onComplete(passed, date);
      onClose();
    } catch (error) {
      console.error('Error completing phase:', error);
      setLoading(false);
    }
  };

  const handleBack = () => {
    setStep('choice');
    setPassed(null);
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            transition={{ type: 'spring', damping: 25 }}
            className="bg-[#0a0e17] border border-white/20 rounded-xl shadow-2xl max-w-md w-full overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {step === 'choice' ? (
              <div className="p-6 space-y-6">
                <div className="text-center">
                  <h3 className="text-xl font-bold text-white mb-2">
                    Mark {phaseName} Complete
                  </h3>
                  <p className="text-sm text-white/60">
                    Did you pass or fail this phase?
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <button
                    onClick={() => handleChoice(true)}
                    className="group relative p-6 rounded-lg border-2 border-emerald-400/30 bg-emerald-500/10 hover:bg-emerald-500/20 hover:border-emerald-400/50 transition-all duration-300 hover:shadow-[0_0_30px_rgba(16,185,129,0.3)]"
                  >
                    <div className="flex flex-col items-center gap-3">
                      <div className="p-3 rounded-full bg-emerald-500/20 group-hover:bg-emerald-500/30 transition-colors">
                        <CheckCircle className="w-8 h-8 text-emerald-400" />
                      </div>
                      <div>
                        <div className="font-semibold text-emerald-200 mb-1">Passed</div>
                        <div className="text-xs text-emerald-300/70">Successfully completed</div>
                      </div>
                    </div>
                  </button>

                  <button
                    onClick={() => handleChoice(false)}
                    className="group relative p-6 rounded-lg border-2 border-rose-400/30 bg-rose-500/10 hover:bg-rose-500/20 hover:border-rose-400/50 transition-all duration-300 hover:shadow-[0_0_30px_rgba(239,68,68,0.3)]"
                  >
                    <div className="flex flex-col items-center gap-3">
                      <div className="p-3 rounded-full bg-rose-500/20 group-hover:bg-rose-500/30 transition-colors">
                        <XCircle className="w-8 h-8 text-rose-400" />
                      </div>
                      <div>
                        <div className="font-semibold text-rose-200 mb-1">Failed</div>
                        <div className="text-xs text-rose-300/70">Did not meet requirements</div>
                      </div>
                    </div>
                  </button>
                </div>

                <Button
                  variant="ghost"
                  onClick={onClose}
                  className="w-full"
                >
                  Cancel
                </Button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="p-6 space-y-6">
                <div className="text-center">
                  <div className="flex justify-center mb-3">
                    <div className={`p-3 rounded-full ${
                      passed ? 'bg-emerald-500/20' : 'bg-rose-500/20'
                    }`}>
                      {passed ? (
                        <CheckCircle className="w-8 h-8 text-emerald-400" />
                      ) : (
                        <XCircle className="w-8 h-8 text-rose-400" />
                      )}
                    </div>
                  </div>
                  <h3 className="text-xl font-bold text-white mb-2">
                    {passed ? 'Phase Passed!' : 'Phase Failed'}
                  </h3>
                  <p className="text-sm text-white/60">
                    When did you {passed ? 'complete' : 'fail'} this phase?
                  </p>
                </div>

                <div className="space-y-2">
                  <label className="text-sm text-white/80 flex items-center gap-2">
                    <Calendar className="w-4 h-4" />
                    Completion Date
                  </label>
                  <input
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    className="w-full px-4 py-3 rounded-lg bg-white/5 border border-white/10 focus:border-cyan-400/50 text-white focus:outline-none focus:ring-2 focus:ring-cyan-500/30 transition-colors"
                    required
                    disabled={loading}
                  />
                </div>

                <div className="flex gap-3">
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={handleBack}
                    className="flex-1"
                    disabled={loading}
                  >
                    Back
                  </Button>
                  <Button
                    type="submit"
                    variant={passed ? 'success' : 'danger'}
                    className="flex-1"
                    loading={loading}
                    disabled={loading}
                    glow
                  >
                    Confirm
                  </Button>
                </div>
              </form>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
