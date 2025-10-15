export type UserTier = 'free' | 'pro';

export interface FeatureLimits {
  maxChallenges: number;
  canExportData: boolean;
  canShareStats: boolean;
  canUseAdvancedAnalytics: boolean;
  maxRulesPerChallenge: number;
}

export const FEATURE_LIMITS: Record<UserTier, FeatureLimits> = {
  free: {
    maxChallenges: 5,
    canExportData: false,
    canShareStats: false,
    canUseAdvancedAnalytics: false,
    maxRulesPerChallenge: 5,
  },
  pro: {
    maxChallenges: -1, // unlimited
    canExportData: true,
    canShareStats: true,
    canUseAdvancedAnalytics: true,
    maxRulesPerChallenge: -1, // unlimited
  },
};

export type FeatureName = keyof FeatureLimits;

// Helper functions
export const getFeatureLimits = (tier: UserTier): FeatureLimits => {
  return FEATURE_LIMITS[tier];
};

export const canAccessFeature = (tier: UserTier, feature: FeatureName): boolean => {
  const limits = getFeatureLimits(tier);
  const value = limits[feature];
  
  // For boolean features, return the value directly
  if (typeof value === 'boolean') {
    return value;
  }
  
  // For number features, -1 means unlimited, 0+ means limited but allowed
  return value !== 0;
};

export const getFeatureLimit = (tier: UserTier, feature: FeatureName): number | boolean => {
  return getFeatureLimits(tier)[feature];
};

export const hasReachedLimit = (tier: UserTier, feature: FeatureName, currentCount: number): boolean => {
  const limit = getFeatureLimit(tier, feature);
  
  if (typeof limit === 'boolean') {
    return !limit;
  }
  
  // -1 means unlimited
  if (limit === -1) {
    return false;
  }
  
  return currentCount >= limit;
};

// Feature descriptions for upgrade prompts
export const FEATURE_DESCRIPTIONS: Record<FeatureName, { title: string; description: string; icon: string }> = {
  maxChallenges: {
    title: 'Unlimited Challenges',
    description: 'Track unlimited prop firm challenges instead of just 5',
    icon: '🎯'
  },
  canExportData: {
    title: 'Data Export',
    description: 'Export your trading data and performance metrics',
    icon: '📊'
  },
  canShareStats: {
    title: 'Share Statistics',
    description: 'Create beautiful performance cards to share on social media',
    icon: '📈'
  },
  canUseAdvancedAnalytics: {
    title: 'Advanced Analytics',
    description: 'Access detailed performance insights and ROI tracking',
    icon: '🔍'
  },
  maxRulesPerChallenge: {
    title: 'Unlimited Rules',
    description: 'Add unlimited rules per challenge instead of just 5',
    icon: '📋'
  },
};
