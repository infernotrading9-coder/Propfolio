import React, { useState } from 'react';
import { X, Plus, Trash2, ListChecks } from 'lucide-react';
import { TradingRule } from '../types';

interface RulesManagementModalProps {
  isOpen: boolean;
  onClose: () => void;
  rules: TradingRule[];
  onSaveRules: (rules: TradingRule[]) => Promise<void>;
  challengeTitle: string;
}

export const RulesManagementModal: React.FC<RulesManagementModalProps> = ({
  isOpen,
  onClose,
  rules,
  onSaveRules,
  challengeTitle
}) => {
  const [localRules, setLocalRules] = useState<TradingRule[]>(rules);
  const [newRuleText, setNewRuleText] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  if (!isOpen) return null;

  const handleAddRule = () => {
    if (!newRuleText.trim()) return;
    
    const newRule: TradingRule = {
      id: crypto.randomUUID(),
      text: newRuleText.trim(),
      createdAt: new Date().toISOString()
    };
    
    setLocalRules([...localRules, newRule]);
    setNewRuleText('');
  };

  const handleDeleteRule = (ruleId: string) => {
    setLocalRules(localRules.filter(r => r.id !== ruleId));
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await onSaveRules(localRules);
      onClose();
    } catch (error) {
      console.error('Failed to save rules:', error);
      alert('Failed to save rules. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <div className="bg-gradient-to-br from-gray-900/95 to-gray-800/95 backdrop-blur-md border border-white/20 rounded-2xl p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-[0_0_50px_rgba(6,182,212,0.3)]">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-gradient-to-br from-cyan-500/20 to-purple-500/20 border border-cyan-400/30">
              <ListChecks className="w-6 h-6 text-cyan-400" />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-cyan-300 to-purple-300">
                Trading Rules
              </h2>
              <p className="text-white/60 text-sm mt-1">{challengeTitle}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-white/10 rounded-lg transition-colors"
          >
            <X className="w-6 h-6 text-white/60 hover:text-white" />
          </button>
        </div>

        {/* Add New Rule */}
        <div className="mb-6">
          <label className="block text-sm font-medium text-white/80 mb-2">
            Add New Rule
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              value={newRuleText}
              onChange={(e) => setNewRuleText(e.target.value)}
              onKeyPress={(e) => {
                if (e.key === 'Enter') {
                  handleAddRule();
                }
              }}
              placeholder="e.g., Only trade during London & NY sessions"
              className="flex-1 px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white placeholder:text-white/40 focus:border-cyan-400/50 focus:outline-none focus:ring-2 focus:ring-cyan-500/30"
            />
            <button
              onClick={handleAddRule}
              disabled={!newRuleText.trim()}
              className="px-4 py-3 bg-gradient-to-r from-cyan-500/20 to-purple-500/20 hover:from-cyan-500/30 hover:to-purple-500/30 border border-cyan-400/50 rounded-lg text-cyan-200 font-semibold transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              <Plus className="w-5 h-5" />
              Add
            </button>
          </div>
        </div>

        {/* Rules List */}
        <div className="space-y-3 mb-6">
          {localRules.length === 0 ? (
            <div className="text-center py-12 text-white/50">
              <ListChecks className="w-16 h-16 mx-auto mb-4 opacity-30" />
              <p className="text-lg">No rules added yet</p>
              <p className="text-sm mt-1">Add trading rules to track your compliance</p>
            </div>
          ) : (
            localRules.map((rule, index) => (
              <div
                key={rule.id}
                className="flex items-center gap-3 p-4 bg-white/5 border border-white/10 rounded-lg group hover:bg-white/10 hover:border-cyan-400/30 transition-all duration-200"
              >
                <span className="flex items-center justify-center w-8 h-8 rounded-full bg-gradient-to-br from-cyan-500/20 to-purple-500/20 border border-cyan-400/30 text-sm font-bold text-cyan-200">
                  {index + 1}
                </span>
                <p className="flex-1 text-white/90">{rule.text}</p>
                <button
                  onClick={() => handleDeleteRule(rule.id)}
                  className="p-2 text-red-400/70 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                  title="Delete rule"
                >
                  <Trash2 className="w-5 h-5" />
                </button>
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="flex gap-3 justify-end">
          <button
            onClick={onClose}
            disabled={isSaving}
            className="px-6 py-3 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-white/70 hover:text-white font-medium transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="px-6 py-3 bg-gradient-to-r from-cyan-500 to-purple-500 hover:from-cyan-400 hover:to-purple-400 rounded-lg text-white font-semibold transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed shadow-[0_0_20px_rgba(6,182,212,0.4)]"
          >
            {isSaving ? 'Saving...' : 'Save Rules'}
          </button>
        </div>
      </div>
    </div>
  );
};
