import React from 'react';
import { motion } from 'framer-motion';
import { ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { PricingCard } from './PricingCard';
import { useSubscription } from '../contexts/SubscriptionContext';
import { useAuth } from '../contexts/AuthContext';
import { PlanType } from '../lib/stripe';
import { createCheckoutSession } from '../lib/checkout';

export const PricingPage: React.FC = () => {
  const navigate = useNavigate();
  const { subscription } = useSubscription();
  const { currentUser } = useAuth();

  const handleSelectPlan = async (plan: PlanType) => {
    if (plan === 'free') {
      // Free plan - redirect to dashboard
      navigate('/dashboard');
      return;
    }

    if (!currentUser) {
      // Shouldn't happen since we're in ProtectedRoute, but just in case
      alert('Please log in to upgrade your plan');
      return;
    }

    try {
      // Show loading state
      const button = document.querySelector(`[data-plan="${plan}"]`) as HTMLButtonElement;
      if (button) {
        button.disabled = true;
        button.textContent = 'Redirecting to checkout...';
      }

      // Create Stripe checkout session and redirect
      await createCheckoutSession(plan);
    } catch (error) {
      console.error('Checkout failed:', error);
      alert('Failed to start checkout. Please try again.');
      
      // Reset button state
      const button = document.querySelector(`[data-plan="${plan}"]`) as HTMLButtonElement;
      if (button) {
        button.disabled = false;
        button.textContent = 'Upgrade Now';
      }
    }
  };

  return (
    <div className="min-h-screen bg-[#020408] text-white">
      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="text-center mb-12">
          <button
            onClick={() => navigate('/dashboard')}
            className="inline-flex items-center gap-2 mb-8 text-white/60 hover:text-white/80 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Dashboard
          </button>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            <h1 className="text-4xl md:text-6xl font-black text-transparent bg-clip-text bg-gradient-to-r from-cyan-300 via-blue-400 to-purple-400 mb-6">
              Propfolio Pricing
            </h1>
            <p className="text-xl text-white/70 mb-8 max-w-3xl mx-auto">
              Choose the perfect plan for your prop trading journey. Track Challenges, Trading Rules, and ROI like never before.
            </p>
          </motion.div>

          {/* Current Plan Badge */}
          {subscription && (
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.3 }}
              className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-cyan-500/20 to-blue-500/20 border border-cyan-400/30 rounded-full mb-8"
            >
              <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
              <span className="text-cyan-200 font-medium">
                Current Plan: {subscription.plan.charAt(0).toUpperCase() + subscription.plan.slice(1)}
              </span>
            </motion.div>
          )}
        </div>

        {/* Pricing Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-4xl mx-auto">
          <PricingCard 
            plan="free" 
            onSelectPlan={handleSelectPlan}
            isCurrentPlan={subscription?.plan === 'free'}
          />
          <PricingCard 
            plan="pro" 
            onSelectPlan={handleSelectPlan}
            isCurrentPlan={subscription?.plan === 'pro'}
          />
        </div>

        {/* FAQ Section */}
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.8 }}
          className="mt-20 max-w-4xl mx-auto"
        >
          <h2 className="text-3xl font-bold text-center text-transparent bg-clip-text bg-gradient-to-r from-cyan-300 to-purple-300 mb-12">
            Frequently Asked Questions
          </h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="bg-white/5 rounded-xl p-6 border border-white/10">
              <h3 className="text-lg font-bold text-cyan-200 mb-3">
                Can I upgrade or downgrade anytime?
              </h3>
              <p className="text-white/70">
                Yes! You can upgrade or downgrade your plan at any time. Changes take effect immediately with prorated billing.
              </p>
            </div>
            
            <div className="bg-white/5 rounded-xl p-6 border border-white/10">
              <h3 className="text-lg font-bold text-cyan-200 mb-3">
                What payment methods do you accept?
              </h3>
              <p className="text-white/70">
                We accept all major credit cards (Visa, Mastercard, Amex) and support secure payments through Stripe.
              </p>
            </div>
            
            <div className="bg-white/5 rounded-xl p-6 border border-white/10">
              <h3 className="text-lg font-bold text-cyan-200 mb-3">
                Is there a free trial for premium plans?
              </h3>
              <p className="text-white/70">
                The free plan gives you full access to try core features. You can upgrade when ready to unlock advanced features.
              </p>
            </div>
            
            <div className="bg-white/5 rounded-xl p-6 border border-white/10">
              <h3 className="text-lg font-bold text-cyan-200 mb-3">
                Do you offer refunds?
              </h3>
              <p className="text-white/70">
                We offer a 14-day money-back guarantee for all premium plans. Contact support if you're not satisfied.
              </p>
            </div>
          </div>
        </motion.div>

        {/* CTA Footer */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1 }}
          className="text-center mt-16 py-12 border-t border-white/10"
        >
          <h3 className="text-2xl font-bold text-white mb-4">
            Ready to level up your prop trading?
          </h3>
          <p className="text-white/60 mb-8 max-w-2xl mx-auto">
            Join hundreds of prop traders who are already using Propfolio to track their challenges, manage trading rules, and maximize their ROI.
          </p>
          <button
            onClick={() => handleSelectPlan('pro')}
            className="px-8 py-4 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white font-bold rounded-xl transition-all duration-300 hover:scale-105 shadow-lg hover:shadow-cyan-500/25"
          >
            Start with Pro Plan
          </button>
        </motion.div>
      </div>
    </div>
  );
};