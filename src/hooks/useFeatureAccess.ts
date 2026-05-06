import { useSubscription } from '../contexts/SubscriptionContext';
import { useAuth } from '../contexts/AuthContext';
import { UserTier, canAccessFeature, hasReachedLimit, getFeatureLimit, FeatureName } from '../lib/featureLimits';
import { FREE_ACCESS_MODE } from '../lib/appFlags';

// Admin emails that get full access
const ADMIN_EMAILS = [
  'infernotrading9@gmail.com',
  'cabreraxdaniel@gmail.com',
  // Add more admin emails as needed
];

export const useFeatureAccess = () => {
  const { subscription } = useSubscription();
  const { currentUser } = useAuth();
  
  // Check if current user is an admin
  const isAdmin = currentUser?.email && ADMIN_EMAILS.includes(currentUser.email);
  
  // Determine user tier based on subscription status
  const getUserTier = (): UserTier => {
    if (FREE_ACCESS_MODE) return 'pro';
    // Admins always get pro tier access
    if (isAdmin) return 'pro';
    
    if (!subscription || subscription.status !== 'active') {
      return 'free';
    }
    // Return the actual plan from the subscription, default to free if unknown
    return subscription.plan === 'pro' ? 'pro' : 'free';
  };

  const tier = getUserTier();
  
  return {
    tier,
    isAdmin,
    isFreeTier: tier === 'free' && !isAdmin,
    isProTier: tier === 'pro' || isAdmin,
    
    // Check if user can access a specific feature
    canAccess: (feature: FeatureName) => canAccessFeature(tier, feature),
    
    // Check if user has reached the limit for a feature
    hasReachedLimit: (feature: FeatureName, currentCount: number) => 
      hasReachedLimit(tier, feature, currentCount),
    
    // Get the limit for a specific feature
    getLimit: (feature: FeatureName) => getFeatureLimit(tier, feature),
    
    // Convenience methods for common checks
    canCreateMoreChallenges: (currentCount: number) => 
      !hasReachedLimit(tier, 'maxChallenges', currentCount),
    
    canAddMoreRules: (currentCount: number) => 
      !hasReachedLimit(tier, 'maxRulesPerChallenge', currentCount),
    
    canShareStats: () => canAccessFeature(tier, 'canShareStats'),
    
    canExportData: () => canAccessFeature(tier, 'canExportData'),
    
    canUseAdvancedAnalytics: () => canAccessFeature(tier, 'canUseAdvancedAnalytics'),
  };
};
