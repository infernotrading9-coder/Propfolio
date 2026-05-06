import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { useAuth } from './AuthContext';
import { PlanType, PRICING_PLANS } from '../lib/stripe';
import { FREE_ACCESS_MODE } from '../lib/appFlags';
// Using localStorage for subscriptions until we migrate to API
type Subscription = {
  id: string;
  userId: string;
  plan: 'free' | 'pro' | 'premium';
  status: 'active' | 'canceled' | 'past_due';
  stripeCustomerId: string;
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
  createdAt: Date;
  updatedAt: Date;
};

type UserLimits = {
  maxChallenges: number;
  canExportData: boolean;
  canShareStats: boolean;
  canSharePremium: boolean;
  hasAdvancedAnalytics: boolean;
};

interface SubscriptionContextType {
  subscription: Subscription | null;
  limits: UserLimits;
  loading: boolean;
  canAddChallenge: (currentCount: number) => boolean;
  canAccessFeature: (feature: keyof UserLimits) => boolean;
  isAtLimit: (currentCount: number) => boolean;
  upgradeUrl: string | null;
  refreshSubscription: () => Promise<void>;
  upgradeSubscription: (plan: PlanType) => void;
}

const SubscriptionContext = createContext<SubscriptionContextType | undefined>(undefined);

export const useSubscription = () => {
  const context = useContext(SubscriptionContext);
  if (context === undefined) {
    throw new Error('useSubscription must be used within a SubscriptionProvider');
  }
  return context;
};

interface SubscriptionProviderProps {
  children: ReactNode;
}

export const SubscriptionProvider: React.FC<SubscriptionProviderProps> = ({ children }) => {
  const { currentUser } = useAuth();
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [limits, setLimits] = useState<UserLimits>(PRICING_PLANS.free.limits);
  const [loading, setLoading] = useState(true);

  // LocalStorage helpers for subscriptions
  const getStorageKey = (userId: string) => `user_subscription_${userId}`;
  
  const loadFromStorage = (userId: string): Subscription | null => {
    try {
      const stored = localStorage.getItem(getStorageKey(userId));
      if (!stored) return null;
      const parsed = JSON.parse(stored);
      return {
        ...parsed,
        createdAt: new Date(parsed.createdAt),
        updatedAt: new Date(parsed.updatedAt),
        currentPeriodEnd: parsed.currentPeriodEnd ? new Date(parsed.currentPeriodEnd) : null,
      };
    } catch {
      return null;
    }
  };
  
  const saveToStorage = (userId: string, subscription: Subscription): void => {
    localStorage.setItem(getStorageKey(userId), JSON.stringify(subscription));
  };

  const loadUserSubscription = async () => {
    if (!currentUser?.id) {
      setSubscription(null);
      setLimits(FREE_ACCESS_MODE ? PRICING_PLANS.pro.limits : PRICING_PLANS.free.limits);
      setLoading(false);
      return;
    }

    try {
      // Try to load subscription from localStorage
      let userSubscription = loadFromStorage(currentUser.id);
      
      // If no subscription exists, create default free subscription
      if (!userSubscription) {
        console.log('🆆 Creating default free subscription for user:', currentUser.id);
        userSubscription = {
          id: `sub_${currentUser.id}`,
          userId: currentUser.id,
          plan: 'free',
          status: 'active',
          stripeCustomerId: 'free_plan_customer',
          currentPeriodEnd: null,
          cancelAtPeriodEnd: false,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        saveToStorage(currentUser.id, userSubscription);
        console.log('✅ Created subscription:', userSubscription);
      }

      const userLimits = FREE_ACCESS_MODE
        ? PRICING_PLANS.pro.limits
        : (PRICING_PLANS[userSubscription.plan as PlanType]?.limits || PRICING_PLANS.free.limits);

      setSubscription(userSubscription);
      setLimits(userLimits);
    } catch (error) {
      console.error('Error loading subscription:', error);
      // Fallback to free plan
      const fallbackSubscription = {
        id: 'free',
        plan: 'free' as const,
        status: 'active',
        currentPeriodEnd: null,
        cancelAtPeriodEnd: false,
        userId: currentUser?.id || 'unknown',
        stripeCustomerId: '',
        createdAt: new Date(),
        updatedAt: new Date(),
      } as any;
      setSubscription(fallbackSubscription);
      setLimits(FREE_ACCESS_MODE ? PRICING_PLANS.pro.limits : PRICING_PLANS.free.limits);
      
      console.log('⚠️ Subscription error, using fallback:', error);
    } finally {
      setLoading(false);
    }
  };

  const refreshSubscription = async () => {
    await loadUserSubscription();
  };

  const upgradeSubscription = async (plan: PlanType) => {
    if (currentUser?.id) {
      const existing = loadFromStorage(currentUser.id);
      const updated: Subscription = {
        ...(existing || {
          id: `sub_${currentUser.id}`,
          userId: currentUser.id,
          stripeCustomerId: 'free_plan_customer',
          cancelAtPeriodEnd: false,
          createdAt: new Date(),
        }),
        plan,
        status: 'active',
        currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days from now
        updatedAt: new Date(),
      };
      saveToStorage(currentUser.id, updated);
      // Refresh the subscription data to reflect changes
      await loadUserSubscription();
    }
  };

  const canAddChallenge = (currentCount: number): boolean => {
    if (FREE_ACCESS_MODE) return true;
    if (limits.maxChallenges === -1) return true; // Unlimited
    return currentCount < limits.maxChallenges;
  };

  const canAccessFeature = (feature: keyof UserLimits): boolean => {
    if (FREE_ACCESS_MODE) return true;
    return limits[feature] as boolean;
  };

  const isAtLimit = (currentCount: number): boolean => {
    if (FREE_ACCESS_MODE) return false;
    if (limits.maxChallenges === -1) return false; // Unlimited
    return currentCount >= limits.maxChallenges;
  };

  // This will be set when you create your Stripe Checkout sessions
  const upgradeUrl = FREE_ACCESS_MODE ? null : (subscription?.plan === 'free' ? '/pricing' : null);

  useEffect(() => {
    loadUserSubscription();
  }, [currentUser?.id]);

  const value: SubscriptionContextType = {
    subscription,
    limits,
    loading,
    canAddChallenge,
    canAccessFeature,
    isAtLimit,
    upgradeUrl,
    refreshSubscription,
    upgradeSubscription
  };

  return (
    <SubscriptionContext.Provider value={value}>
      {!loading && children}
    </SubscriptionContext.Provider>
  );
};
