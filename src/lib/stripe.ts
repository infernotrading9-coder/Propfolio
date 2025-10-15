// Commented out Stripe.js loading since we're using Payment Links
// This prevents COOP/COEP blocking issues in development
// import { loadStripe } from '@stripe/stripe-js';
// export const stripePromise = loadStripe(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY!);

// Pricing configuration
export const PRICING_PLANS = {
  free: {
    name: 'Free',
    description: 'Perfect for getting started',
    price: 0,
    priceId: null,
    features: [
      'Track up to 5 challenges',
      'Basic ROI tracking',
      'Standard calendar view',
      'Rule compliance tracking'
    ],
    limits: {
      maxChallenges: 5,
      canExportData: false,
      canShareStats: false,
      canSharePremium: false,
      hasAdvancedAnalytics: false
    }
  },
  pro: {
    name: 'Pro',
    description: 'For serious prop traders',
    price: 19.99,
    priceId: import.meta.env.VITE_STRIPE_PRO_PRICE_ID, // You'll set this in Stripe dashboard
    popular: true,
    premium: true, // This will trigger the crown and purple styling
    features: [
      'Unlimited challenges',
      'Advanced analytics & insights',
      'Premium shareable cards',
      'Yearly/monthly performance views',
      'Data export functionality',
      'Multi-account management',
      'Priority support'
    ],
    limits: {
      maxChallenges: -1, // Unlimited
      canExportData: true,
      canShareStats: true,
      canSharePremium: true,
      hasAdvancedAnalytics: true
    }
  },
} as const;

export type PlanType = keyof typeof PRICING_PLANS;

// Helper to get plan details
export const getPlanDetails = (plan: PlanType) => PRICING_PLANS[plan];

// Helper to check if plan is premium
export const isPremiumPlan = (plan: PlanType) => plan !== 'free';