import React, { useState } from 'react';
import { PropFirm } from '../types';
import { NeonCard } from './NeonCard';
import { Button } from './ui/Button';
import { Plus, Share2 } from 'lucide-react';
import { UpgradeModal } from './UpgradeModal';
import { useFeatureAccess } from '../hooks/useFeatureAccess';
import { FEATURE_DESCRIPTIONS } from '../lib/featureLimits';

export const PropFirmPicker: React.FC<{
  firms: PropFirm[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onAddChallenge: () => void;
  onShareStats?: () => void;
  buildingMode?: boolean;
  currentChallengeCount?: number;
}> = ({ firms, selectedId, onSelect, onAddChallenge, onShareStats, currentChallengeCount = 0 }) => {
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [upgradeFeature, setUpgradeFeature] = useState<string | null>(null);
  const { canAccess, hasReachedLimit } = useFeatureAccess();
  
  const handleAddChallenge = () => {
    // Check if user can add more challenges
    if (hasReachedLimit('maxChallenges', currentChallengeCount)) {
      setUpgradeFeature('maxChallenges');
      setShowUpgradeModal(true);
      return;
    }
    
    onAddChallenge();
  };
  
  const handleShareStats = () => {
    if (!canAccess('canShareStats')) {
      setUpgradeFeature('canShareStats');
      setShowUpgradeModal(true);
      return;
    }
    onShareStats?.();
  };
  
  return (
    <NeonCard className="p-4" glow="pink">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex-1">
          <div className="text-sm text-white/70 mb-3">Select a Prop Firm</div>
          <div className="flex flex-wrap gap-2">
            <button
              className={`px-3 py-1.5 rounded-md border text-sm font-medium transition-all duration-200 ${
                selectedId === null 
                  ? 'bg-pink-500/20 border-pink-400/50 text-pink-200 shadow-[0_0_10px_rgba(244,114,182,0.3)]' 
                  : 'bg-transparent border-white/10 text-white/70 hover:text-white hover:border-white/20'
              }`}
              onClick={() => onSelect(null)}
            >
              All
            </button>
            {firms.map((f) => (
              <button 
                key={f.id}
                className={`px-3 py-1.5 rounded-md border text-sm font-medium transition-all duration-200 ${
                  selectedId === f.id 
                    ? 'bg-pink-500/20 border-pink-400/50 text-pink-200 shadow-[0_0_10px_rgba(244,114,182,0.3)]' 
                    : 'bg-transparent border-white/10 text-white/70 hover:text-white hover:border-white/20'
                }`}
                onClick={() => onSelect(f.id)}
              >
                {f.name}
              </button>
            ))}
          </div>
        </div>
        
        <div className="flex flex-col gap-3 sm:flex-row">
          {onShareStats && (
            <div className="w-full sm:w-auto">
              <Button
                onClick={handleShareStats}
                variant="secondary"
                leftIcon={<Share2 className="w-4 h-4" />}
                className="w-full px-4 py-3 bg-gradient-to-r from-cyan-500/20 to-blue-600/20 border-cyan-400/30 text-cyan-300 shadow-[0_0_15px_rgba(6,182,212,0.2)] sm:w-auto sm:px-6"
                glow
              >
                📈 Share Stats
              </Button>
            </div>
          )}
          
          <div className="w-full sm:w-auto">
            <Button
              onClick={handleAddChallenge}
              variant="primary"
              leftIcon={<Plus className="w-4 h-4" />}
              glow
              className="w-full px-4 py-3 sm:w-auto sm:px-6"
              title={firms.length === 0 ? "You can create firms when adding challenges" : "Add a new challenge"}
            >
              Add Challenge
            </Button>
          </div>
        </div>
      </div>
      
      {/* Upgrade Modal */}
      <UpgradeModal
        isOpen={showUpgradeModal}
        onClose={() => setShowUpgradeModal(false)}
        feature={upgradeFeature ? FEATURE_DESCRIPTIONS[upgradeFeature as keyof typeof FEATURE_DESCRIPTIONS] : undefined}
        triggerFeature={upgradeFeature || undefined}
      />
    </NeonCard>
  );
};
