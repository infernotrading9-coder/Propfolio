import React, { useState } from 'react';
import { Button } from './ui/Button';
import { Plus, Share2 } from 'lucide-react';
import { UpgradeModal } from './UpgradeModal';
import { useFeatureAccess } from '../hooks/useFeatureAccess';
import { FEATURE_DESCRIPTIONS } from '../lib/featureLimits';

export const PropFirmPicker: React.FC<{
  firms: any[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onAddChallenge: () => void;
  onShareStats?: () => void;
  buildingMode?: boolean;
  currentChallengeCount?: number;
}> = ({ onAddChallenge, onShareStats, currentChallengeCount = 0 }) => {
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [upgradeFeature, setUpgradeFeature] = useState<string | null>(null);
  const { canAccess, hasReachedLimit } = useFeatureAccess();
  
  const handleAddChallenge = () => {
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
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-end">
      {onShareStats && (
        <Button
          onClick={handleShareStats}
          variant="secondary"
          leftIcon={<Share2 className="w-4 h-4" />}
          className="w-full px-4 py-3 bg-gradient-to-r from-cyan-500/20 to-blue-600/20 border-cyan-400/30 text-cyan-300 shadow-[0_0_15px_rgba(6,182,212,0.2)] sm:w-auto sm:px-6"
          glow
        >
          📈 Share Stats
        </Button>
      )}
      <Button
        onClick={handleAddChallenge}
        variant="primary"
        leftIcon={<Plus className="w-4 h-4" />}
        glow
        className="w-full px-4 py-3 sm:w-auto sm:px-6"
      >
        Add Challenge
      </Button>
      
      <UpgradeModal
        isOpen={showUpgradeModal}
        onClose={() => setShowUpgradeModal(false)}
        feature={upgradeFeature ? FEATURE_DESCRIPTIONS[upgradeFeature as keyof typeof FEATURE_DESCRIPTIONS] : undefined}
        triggerFeature={upgradeFeature || undefined}
      />
    </div>
  );
};
