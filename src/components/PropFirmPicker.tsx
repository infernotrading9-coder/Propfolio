import React, { useState } from 'react';
import { PropFirm } from '../types';
import { NeonCard } from './NeonCard';
import { Button } from './ui/Button';
import { Plus, Share2 } from 'lucide-react';
import { motion } from 'framer-motion';
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
}> = ({ firms, selectedId, onSelect, onAddChallenge, onShareStats, buildingMode = false, currentChallengeCount = 0 }) => {
  const [isAnimating, setIsAnimating] = React.useState(false);
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
    
    if (buildingMode) {
      // Skip animation in build mode
      onAddChallenge();
    } else {
      // Show animation in normal mode
      setIsAnimating(true);
      setTimeout(() => {
        setIsAnimating(false);
        onAddChallenge();
      }, 600); // Animation duration
    }
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
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              className={`px-3 py-1.5 rounded-md border text-sm font-medium transition-all duration-200 ${
                selectedId === null 
                  ? 'bg-pink-500/20 border-pink-400/50 text-pink-200 shadow-[0_0_10px_rgba(244,114,182,0.3)]' 
                  : 'bg-transparent border-white/10 text-white/70 hover:text-white hover:border-white/20'
              }`}
              onClick={() => onSelect(null)}
            >
              All
            </motion.button>
            {firms.map((f, index) => (
              <motion.button 
                key={f.id}
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: index * 0.05 }}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                className={`px-3 py-1.5 rounded-md border text-sm font-medium transition-all duration-200 ${
                  selectedId === f.id 
                    ? 'bg-pink-500/20 border-pink-400/50 text-pink-200 shadow-[0_0_10px_rgba(244,114,182,0.3)]' 
                    : 'bg-transparent border-white/10 text-white/70 hover:text-white hover:border-white/20'
                }`}
                onClick={() => onSelect(f.id)}
              >
                {f.name}
              </motion.button>
            ))}
          </div>
        </div>
        
        <div className="flex gap-3">
          {onShareStats && (
            <motion.div
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              <Button
                onClick={handleShareStats}
                variant="secondary"
                leftIcon={<Share2 className="w-4 h-4" />}
                className="px-6 py-3 bg-gradient-to-r from-cyan-500/20 to-blue-600/20 border-cyan-400/30 text-cyan-300 hover:from-cyan-400/30 hover:to-blue-500/30 hover:border-cyan-300/50 hover:text-cyan-200 transition-all duration-300 shadow-[0_0_15px_rgba(6,182,212,0.2)] hover:shadow-[0_0_25px_rgba(6,182,212,0.4)]"
                glow
              >
                📈 Share Stats
              </Button>
            </motion.div>
          )}
          
          <motion.div
            animate={isAnimating && !buildingMode ? {
              rotate: [0, -10, 10, -10, 10, 0],
              scale: [1, 1.1, 0.9, 1.1, 0.9, 1],
              y: [0, -5, 0, -3, 0]
            } : {}}
            transition={{ duration: buildingMode ? 0 : 0.6, ease: "easeInOut" }}
          >
            <Button
              onClick={handleAddChallenge}
              variant="primary"
              disabled={isAnimating}
              leftIcon={<Plus className="w-4 h-4" />}
              glow
              className="px-6 py-3"
              title={firms.length === 0 ? "You can create firms when adding challenges" : "Add a new challenge"}
            >
              {isAnimating ? 'Getting Ready...' : 'Add Challenge'}
            </Button>
          </motion.div>
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
