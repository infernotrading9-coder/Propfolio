import React, { useState } from 'react';
import { useFeatureAccess } from '../hooks/useFeatureAccess';
import { FeatureName, FEATURE_DESCRIPTIONS } from '../lib/featureLimits';
import { UpgradeModal } from './UpgradeModal';

interface FeatureGateProps {
  feature: FeatureName;
  children: React.ReactNode;
  fallback?: React.ReactNode;
  showUpgradePrompt?: boolean;
  currentCount?: number; // For features with limits like maxChallenges
}

export const FeatureGate: React.FC<FeatureGateProps> = ({
  feature,
  children,
  fallback,
  showUpgradePrompt = true,
  currentCount = 0
}) => {
  const { canAccess, hasReachedLimit: checkLimit } = useFeatureAccess();
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  
  const hasAccess = canAccess(feature);
  const hasReachedLimit = checkLimit(feature, currentCount);
  
  // If user has access and hasn't reached limit, show the feature
  if (hasAccess && !hasReachedLimit) {
    return <>{children}</>;
  }
  
  // If a custom fallback is provided, use it
  if (fallback) {
    return <>{fallback}</>;
  }
  
  // Show upgrade prompt if requested
  if (!showUpgradePrompt) {
    return null;
  }
  
  const featureInfo = FEATURE_DESCRIPTIONS[feature];
  
  return (
    <>
      {/* Render children with click handler to show upgrade modal */}
      <div onClick={() => setShowUpgradeModal(true)} className="cursor-pointer">
        {children}
      </div>
      
      <UpgradeModal
        isOpen={showUpgradeModal}
        onClose={() => setShowUpgradeModal(false)}
        feature={featureInfo}
        triggerFeature={feature}
      />
    </>
  );
};

