import React from 'react';
import { Check, Crown, Star } from 'lucide-react';
import { motion } from 'framer-motion';
import { PRICING_PLANS, PlanType } from '../lib/stripe';
import { useSubscription } from '../contexts/SubscriptionContext';

interface PricingCardProps {
  plan: PlanType;
  onSelectPlan: (plan: PlanType) => void;
  isCurrentPlan?: boolean;
}

export const PricingCard: React.FC<PricingCardProps> = ({ plan, onSelectPlan, isCurrentPlan = false }) => {
  const { loading } = useSubscription();
  const planDetails = PRICING_PLANS[plan];
  
  const getPlanIcon = (planType: PlanType) => {
    switch (planType) {
      case 'free': return <Star className="w-6 h-6" />;
      case 'pro': return <Crown className="w-6 h-6" />;
      default: return <Star className="w-6 h-6" />;
    }
  };

  const getPlanColors = (planType: PlanType) => {
    switch (planType) {
      case 'free':
        return {
          gradient: 'from-gray-600/20 to-slate-600/20',
          border: 'border-gray-400/30',
          text: 'text-gray-300',
          icon: 'text-gray-400',
          button: 'from-gray-500/20 to-slate-500/20 border-gray-400/50 text-gray-200 hover:from-gray-400/30 hover:to-slate-400/30'
        };
      case 'pro':
        return {
          gradient: 'from-purple-500/20 to-pink-600/20',
          border: 'border-purple-400/50',
          text: 'text-purple-200',
          icon: 'text-purple-400',
          button: 'from-purple-500/20 to-pink-500/20 border-purple-400/50 text-purple-200 hover:from-purple-400/30 hover:to-pink-400/30'
        };
      default: return getPlanColors('free');
    }
  };

  const colors = getPlanColors(plan);
  const isPopular = 'popular' in planDetails && planDetails.popular;
  const buttonText = isCurrentPlan ? 'Current Plan' : plan === 'free' ? 'Get Started' : 'Upgrade Now';

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className={`relative`}
    >
      {/* Popular badge */}
      {isPopular && (
        <div className="absolute -top-4 left-1/2 transform -translate-x-1/2 z-10">
          <div className="bg-gradient-to-r from-cyan-500 to-blue-500 text-white px-4 py-1 rounded-full text-sm font-bold shadow-lg">
            Most Popular
          </div>
        </div>
      )}

      <div
        className={`relative bg-gradient-to-br ${colors.gradient} backdrop-blur-sm rounded-2xl border ${colors.border} p-8 h-full transition-all duration-300 ${plan === 'pro' ? 'hover:shadow-[0_0_30px_rgba(168,85,247,0.3)]' : 'hover:shadow-[0_0_30px_rgba(6,182,212,0.2)]'} ${isPopular ? 'scale-105 ring-2 ring-purple-400/30' : ''}`}
      >
        {/* Header */}
        <div className="text-center mb-8">
          <div className={`inline-flex items-center justify-center w-12 h-12 rounded-full bg-gradient-to-r ${colors.gradient} ${colors.border} border mb-4`}>
            <div className={colors.icon}>
              {getPlanIcon(plan)}
            </div>
          </div>
          
          <h3 className={`text-2xl font-bold ${colors.text} mb-2`}>
            {planDetails.name}
          </h3>
          
          <p className="text-white/60 text-sm mb-4">
            {planDetails.description}
          </p>
          
          <div className="mb-6">
            <span className={`text-4xl font-black ${colors.text}`}>
              ${planDetails.price}
            </span>
            {plan !== 'free' && (
              <span className="text-white/50 text-sm ml-1">/month</span>
            )}
          </div>
        </div>

        {/* Features */}
        <div className="space-y-4 mb-8 flex-1">
          {planDetails.features.map((feature, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: index * 0.1 }}
              className="flex items-center gap-3"
            >
              <div className={`flex-shrink-0 w-5 h-5 rounded-full bg-gradient-to-r ${colors.gradient} flex items-center justify-center`}>
                <Check className={`w-3 h-3 ${colors.icon}`} />
              </div>
              <span className="text-white/80 text-sm">{feature}</span>
            </motion.div>
          ))}
        </div>

        {/* CTA Button */}
        <button
          onClick={() => !isCurrentPlan && onSelectPlan(plan)}
          disabled={isCurrentPlan || loading}
          data-plan={plan}
          className={`w-full py-4 px-6 rounded-xl font-bold text-center transition-all duration-300 ${
            isCurrentPlan 
              ? 'bg-white/10 border border-white/20 text-white/50 cursor-not-allowed'
              : `bg-gradient-to-r ${colors.button} border hover:scale-105 hover:shadow-lg`
          }`}
        >
          {loading ? 'Loading...' : buttonText}
        </button>

        {/* Value proposition */}
        {plan === 'pro' && (
          <div className="text-center mt-4">
            <p className="text-xs text-white/50">
              Professional trader solution
            </p>
          </div>
        )}
      </div>
    </motion.div>
  );
};