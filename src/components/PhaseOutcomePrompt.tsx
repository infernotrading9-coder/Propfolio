import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle, XCircle, Calendar as CalendarIcon } from 'lucide-react';

interface PhaseOutcomePromptProps {
  open: boolean;
  phase: 'phase1' | 'phase2' | 'phase3';
  totalPhases: 1 | 2 | 3;
  accountCount?: number;
  requiresActivationFee?: boolean;
  onCancel: () => void;
  onSubmit: (outcome: 'passed' | 'failed', date: string, activationFeeAmount?: number) => void;
}

export const PhaseOutcomePrompt: React.FC<PhaseOutcomePromptProps> = ({ open, phase, totalPhases, accountCount = 1, requiresActivationFee = false, onCancel, onSubmit }) => {
  const [outcome, setOutcome] = React.useState<'passed' | 'failed'>('passed');
  const [date, setDate] = React.useState<string>(() => new Date().toISOString().slice(0,10));
  const [activationFeeStr, setActivationFeeStr] = React.useState<string>('');
  const [activationFeeError, setActivationFeeError] = React.useState<string>('');
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (open) {
      setOutcome('passed');
      setDate(new Date().toISOString().slice(0,10));
      setActivationFeeStr('');
      setActivationFeeError('');
      setSaving(false);
    }
  }, [open]);

  const titleMap: Record<typeof phase, string> = {
    phase1: 'Phase 1 Result',
    phase2: 'Phase 2 Result',
    phase3: 'Phase 3 Result',
  };

  const subtitle = (() => {
    const idx = phase === 'phase1' ? 1 : phase === 'phase2' ? 2 : 3;
    const accountText = accountCount > 1 ? ` · ${accountCount} accounts selected` : '';
    return `Challenge has ${totalPhases} phase${totalPhases>1?'s':''} · Logging phase ${idx}${accountText}`;
  })();

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ y: 80, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 80, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 260, damping: 26 }}
          className="fixed bottom-4 left-4 right-4 md:left-1/2 md:-translate-x-1/2 md:right-auto md:w-[620px] z-50"
        >
          <div className="relative overflow-hidden rounded-2xl border border-cyan-400/30 bg-gradient-to-br from-[#0b0f17] to-[#0e1320] shadow-[0_0_40px_rgba(34,211,238,0.15)]">
            {/* Accent glow */}
            <div className="pointer-events-none absolute -top-24 -right-24 h-64 w-64 rounded-full bg-cyan-500/20 blur-3xl" />

            <div className="px-5 py-4 border-b border-white/10">
              <div className="text-lg font-semibold text-white">{titleMap[phase]}</div>
              <div className="text-xs text-white/50 mt-1">{subtitle}</div>
            </div>

            <div className="p-5 space-y-5">
              <div className="text-white/80 text-sm">
                Select the outcome and date for this phase. This keeps your stats accurate.
              </div>

              {/* Outcome buttons */}
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => setOutcome('passed')}
                  className={`flex items-center justify-center gap-2 py-3 rounded-xl border transition-all ${
                    outcome === 'passed'
                      ? 'bg-gradient-to-r from-emerald-600/20 to-lime-500/20 border-emerald-400/50 text-emerald-200 shadow-[0_0_25px_rgba(16,185,129,0.3)]'
                      : 'bg-white/5 border-white/10 text-white/70 hover:bg-white/10'
                  }`}
                >
                  <CheckCircle className="w-5 h-5" /> Passed
                </button>
                <button
                  onClick={() => setOutcome('failed')}
                  className={`flex items-center justify-center gap-2 py-3 rounded-xl border transition-all ${
                    outcome === 'failed'
                      ? 'bg-gradient-to-r from-rose-600/20 to-pink-500/20 border-rose-400/50 text-rose-200 shadow-[0_0_25px_rgba(244,63,94,0.3)]'
                      : 'bg-white/5 border-white/10 text-white/70 hover:bg-white/10'
                  }`}
                >
                  <XCircle className="w-5 h-5" /> Failed
                </button>
              </div>

              {/* Date input */}
              <div>
                <label className="block text-xs text-white/60 mb-1">Date of event</label>
                <div className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-xl px-3 py-2">
                  <CalendarIcon className="w-4 h-4 text-white/60" />
                  <input
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    className="bg-transparent text-white text-sm outline-none flex-1"
                  />
                </div>
              </div>

              {outcome === 'passed' && requiresActivationFee && (
                <div>
                  <label className="block text-xs text-white/60 mb-1">{accountCount > 1 ? 'Activation fee per account' : 'Activation fee'}</label>
                  <div className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-xl px-3 py-2">
                    <span className="text-white/60 text-sm">$</span>
                    <input
                      type="text"
                      value={activationFeeStr}
                      onChange={(e) => {
                        const raw = e.target.value.replace(/[^\d.-]/g, '');
                        const parts = raw.split('.');
                        let formatted = parts[0];
                        if (parts.length > 1) formatted += '.' + parts[1].slice(0, 2);
                        setActivationFeeStr(formatted);
                        setActivationFeeError('');
                      }}
                      className="bg-transparent text-white text-sm outline-none flex-1"
                      placeholder="Enter activation fee"
                    />
                  </div>
                  {activationFeeError && <div className="mt-1 text-xs text-rose-300">{activationFeeError}</div>}
                  <div className="mt-1 text-xs text-white/45">
                    The activation fee is tracked separately — it is not included in the challenge cost.
                  </div>
                </div>
              )}

              <div className="flex items-center justify-end gap-3 pt-1">
                <button
                  onClick={onCancel}
                  disabled={saving}
                  className="px-4 py-2 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-white/80 hover:text-white transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={async () => {
                    if (outcome === 'passed' && requiresActivationFee) {
                      const fee = activationFeeStr.trim() === '' ? NaN : parseFloat(activationFeeStr);
                      if (Number.isNaN(fee) || fee < 0) {
                        setActivationFeeError('Enter a valid activation fee.');
                        return;
                      }
                    }
                    setSaving(true);
                    try {
                      const fee = outcome === 'passed' && requiresActivationFee ? parseFloat(activationFeeStr) : undefined;
                      await onSubmit(outcome, date, fee);
                    } finally {
                      setSaving(false);
                    }
                  }}
                  disabled={saving}
                  className="px-4 py-2 rounded-lg bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white font-semibold shadow-lg transition-colors"
                >
                  Save
                </button>
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
