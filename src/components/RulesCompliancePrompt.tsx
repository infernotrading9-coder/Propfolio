import React, { useState } from 'react';
import { X, CheckCircle2, XCircle, Calendar } from 'lucide-react';
import { TradingRule } from '../types';

interface RulesCompliancePromptProps {
  isOpen: boolean;
  onClose: () => void;
  date: string; // YYYY-MM-DD
  rules: TradingRule[];
  existingCompliance?: Record<string, boolean>;
  onSave: (ruleCompliance: Record<string, boolean>) => void;
}

export const RulesCompliancePrompt: React.FC<RulesCompliancePromptProps> = ({
  isOpen,
  onClose,
  date,
  rules,
  existingCompliance = {},
  onSave
}) => {
  const [ruleCompliance, setRuleCompliance] = useState<Record<string, boolean>>(existingCompliance);

  if (!isOpen) return null;

  // If no rules exist, show a message
  if (rules.length === 0) {
    return (
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
        <div className="bg-gradient-to-br from-gray-900/95 to-gray-800/95 backdrop-blur-md border border-white/20 rounded-2xl p-6 max-w-md w-full shadow-[0_0_50px_rgba(6,182,212,0.3)]">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-bold text-white">No Trading Rules</h2>
            <button
              onClick={onClose}
              className="p-2 hover:bg-white/10 rounded-lg transition-colors"
            >
              <X className="w-6 h-6 text-white/60 hover:text-white" />
            </button>
          </div>
          <p className="text-white/70 mb-6">
            You haven't added any trading rules for this challenge yet. Add rules from the calendar view to track your compliance.
          </p>
          <button
            onClick={onClose}
            className="w-full px-6 py-3 bg-gradient-to-r from-cyan-500 to-purple-500 hover:from-cyan-400 hover:to-purple-400 rounded-lg text-white font-semibold transition-all duration-200"
          >
            OK
          </button>
        </div>
      </div>
    );
  }

  const toggleRule = (ruleId: string) => {
    setRuleCompliance(prev => ({
      ...prev,
      [ruleId]: !prev[ruleId]
    }));
  };

  const handleSave = () => {
    onSave(ruleCompliance);
    onClose();
  };

  const allFollowed = rules.every(rule => ruleCompliance[rule.id] === true);
  const anyBroken = rules.some(rule => ruleCompliance[rule.id] === false);
  const followedCount = rules.filter(rule => ruleCompliance[rule.id] === true).length;

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr + 'T00:00:00');
    return date.toLocaleDateString('en-US', { 
      weekday: 'long',
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    });
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <div className="bg-gradient-to-br from-gray-900/95 to-gray-800/95 backdrop-blur-md border border-white/20 rounded-2xl p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-[0_0_50px_rgba(6,182,212,0.3)]">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-gradient-to-br from-cyan-500/20 to-purple-500/20 border border-cyan-400/30">
              <Calendar className="w-6 h-6 text-cyan-400" />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-cyan-300 to-purple-300">
                Trading Day Rules
              </h2>
              <p className="text-white/60 text-sm mt-1">{formatDate(date)}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-white/10 rounded-lg transition-colors"
          >
            <X className="w-6 h-6 text-white/60 hover:text-white" />
          </button>
        </div>

        {/* Rules Checklist */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm text-white/70">
              Mark the rules you followed during this trading day
            </p>
            <div className="text-sm font-semibold">
              <span className={`${
                allFollowed ? 'text-green-400' : anyBroken ? 'text-red-400' : 'text-white/60'
              }`}>
                {followedCount}/{rules.length}
              </span>
              <span className="text-white/40 ml-1">rules followed</span>
            </div>
          </div>

          <div className="space-y-3">
            {rules.map((rule, index) => {
              const isFollowed = ruleCompliance[rule.id] === true;
              const isBroken = ruleCompliance[rule.id] === false;

              return (
                <button
                  key={rule.id}
                  onClick={() => toggleRule(rule.id)}
                  className={`w-full flex items-center gap-4 p-4 rounded-xl border-2 transition-all duration-200 ${
                    isFollowed
                      ? 'bg-green-500/10 border-green-400/50 hover:bg-green-500/20'
                      : isBroken
                      ? 'bg-red-500/10 border-red-400/50 hover:bg-red-500/20'
                      : 'bg-white/5 border-white/10 hover:bg-white/10 hover:border-white/20'
                  }`}
                >
                  {/* Rule Number Badge */}
                  <span className={`flex items-center justify-center w-10 h-10 rounded-lg font-bold text-sm ${
                    isFollowed
                      ? 'bg-green-500/20 border border-green-400/50 text-green-300'
                      : isBroken
                      ? 'bg-red-500/20 border border-red-400/50 text-red-300'
                      : 'bg-gradient-to-br from-cyan-500/20 to-purple-500/20 border border-cyan-400/30 text-cyan-200'
                  }`}>
                    {index + 1}
                  </span>

                  {/* Rule Text */}
                  <p className={`flex-1 text-left font-medium ${
                    isFollowed
                      ? 'text-green-100'
                      : isBroken
                      ? 'text-red-100'
                      : 'text-white/90'
                  }`}>
                    {rule.text}
                  </p>

                  {/* Status Icon */}
                  <div className="flex items-center gap-2">
                    {isFollowed ? (
                      <CheckCircle2 className="w-6 h-6 text-green-400" />
                    ) : isBroken ? (
                      <XCircle className="w-6 h-6 text-red-400" />
                    ) : (
                      <div className="w-6 h-6 rounded-full border-2 border-white/30" />
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Summary Message */}
        {followedCount > 0 && (
          <div className={`p-4 rounded-xl mb-6 ${
            allFollowed
              ? 'bg-green-500/10 border border-green-400/30'
              : anyBroken
              ? 'bg-red-500/10 border border-red-400/30'
              : 'bg-cyan-500/10 border border-cyan-400/30'
          }`}>
            <p className={`text-sm font-medium ${
              allFollowed
                ? 'text-green-300'
                : anyBroken
                ? 'text-red-300'
                : 'text-cyan-300'
            }`}>
              {allFollowed
                ? '✓ Perfect! All rules followed on this day.'
                : anyBroken
                ? '✗ Some rules were broken on this day.'
                : '◷ Partial compliance - mark remaining rules.'}
            </p>
          </div>
        )}

        {/* Footer */}
        <div className="flex gap-3 justify-end">
          <button
            onClick={onClose}
            className="px-6 py-3 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-white/70 hover:text-white font-medium transition-all duration-200"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={Object.keys(ruleCompliance).length === 0}
            className="px-6 py-3 bg-gradient-to-r from-cyan-500 to-purple-500 hover:from-cyan-400 hover:to-purple-400 rounded-lg text-white font-semibold transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed shadow-[0_0_20px_rgba(6,182,212,0.4)]"
          >
            Save Compliance
          </button>
        </div>
      </div>
    </div>
  );
};
