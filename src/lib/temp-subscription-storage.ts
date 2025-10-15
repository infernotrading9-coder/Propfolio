import { PlanType, PRICING_PLANS } from './stripe';

export interface UserLimits {
  maxChallenges: number;
  canExportData: boolean;
  canShareStats: boolean;
  canSharePremium: boolean;
  hasAdvancedAnalytics: boolean;
}

export interface Subscription {
  id: string;
  plan: PlanType;
  status: string;
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
}

const SUBSCRIPTION_STORAGE_KEY = 'user_subscription';
const LIMITS_STORAGE_KEY = 'user_limits';

export class TempSubscriptionStorage {
  private static getStorageKey(userId: string, key: string): string {
    return `${key}_${userId}`;
  }

  static getSubscription(userId: string): Subscription | null {
    try {
      const key = this.getStorageKey(userId, SUBSCRIPTION_STORAGE_KEY);
      const stored = localStorage.getItem(key);
      if (stored) {
        const parsed = JSON.parse(stored);
        // Convert date string back to Date object
        if (parsed.currentPeriodEnd) {
          parsed.currentPeriodEnd = new Date(parsed.currentPeriodEnd);
        }
        return parsed;
      }
      return null;
    } catch (error) {
      console.error('Error reading subscription from storage:', error);
      return null;
    }
  }

  static setSubscription(userId: string, subscription: Subscription): void {
    try {
      const key = this.getStorageKey(userId, SUBSCRIPTION_STORAGE_KEY);
      localStorage.setItem(key, JSON.stringify(subscription));
    } catch (error) {
      console.error('Error saving subscription to storage:', error);
    }
  }

  static getLimits(userId: string): UserLimits | null {
    try {
      const key = this.getStorageKey(userId, LIMITS_STORAGE_KEY);
      const stored = localStorage.getItem(key);
      if (stored) {
        return JSON.parse(stored);
      }
      return null;
    } catch (error) {
      console.error('Error reading limits from storage:', error);
      return null;
    }
  }

  static setLimits(userId: string, limits: UserLimits): void {
    try {
      const key = this.getStorageKey(userId, LIMITS_STORAGE_KEY);
      localStorage.setItem(key, JSON.stringify(limits));
    } catch (error) {
      console.error('Error saving limits to storage:', error);
    }
  }

  static initializeDefaultSubscription(userId: string): { subscription: Subscription; limits: UserLimits } {
    const defaultSubscription: Subscription = {
      id: 'free',
      plan: 'free',
      status: 'active',
      currentPeriodEnd: null,
      cancelAtPeriodEnd: false
    };

    const defaultLimits = PRICING_PLANS.free.limits;

    this.setSubscription(userId, defaultSubscription);
    this.setLimits(userId, defaultLimits);

    return {
      subscription: defaultSubscription,
      limits: defaultLimits
    };
  }

  static clearUserData(userId: string): void {
    try {
      const subscriptionKey = this.getStorageKey(userId, SUBSCRIPTION_STORAGE_KEY);
      const limitsKey = this.getStorageKey(userId, LIMITS_STORAGE_KEY);
      
      localStorage.removeItem(subscriptionKey);
      localStorage.removeItem(limitsKey);
    } catch (error) {
      console.error('Error clearing subscription data:', error);
    }
  }

  static upgradeSubscription(userId: string, plan: PlanType): void {
    try {
      const currentSubscription = this.getSubscription(userId);
      if (currentSubscription) {
        // Update subscription plan
        const updatedSubscription: Subscription = {
          ...currentSubscription,
          plan,
          status: 'active',
          currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days from now
        };
        this.setSubscription(userId, updatedSubscription);

        // Update limits based on the new plan
        if (PRICING_PLANS[plan]) {
          this.setLimits(userId, PRICING_PLANS[plan].limits);
        }
      }
    } catch (error) {
      console.error('Error upgrading subscription:', error);
    }
  }
}