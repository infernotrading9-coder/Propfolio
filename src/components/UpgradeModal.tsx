import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Crown, Check, Zap } from 'lucide-react';
import { Button } from './ui/Button';
import { FREE_ACCESS_MODE } from '../lib/appFlags';

interface UpgradeModalProps {
  isOpen: boolean;
  onClose: () => void;
  feature?: {
    title: string;
    description: string;
    icon: string;
  };
  triggerFeature?: string; // What feature triggered this modal
}

export const UpgradeModal: React.FC<UpgradeModalProps> = ({
  isOpen,
  onClose,
  feature,
  triggerFeature
}) => {
  // const navigate = useNavigate();

  const handleUpgrade = () => {
    if (FREE_ACCESS_MODE) {
      onClose();
      return;
    }
    // Open Stripe Payment Link in new tab
    window.open('https://buy.stripe.com/4gM4gzaXY881foS1ByfQI01', '_blank');
    onClose();
  };

  const proFeatures = [
    '🎯 Unlimited challenges',
    '📊 Advanced analytics & insights', 
    '📈 Premium shareable cards',
    '📅 Multi-timeframe views',
    '💾 Data export functionality',
    '🏢 Multi-account management',
    '⚡ Priority support'
  ];

  // Disable body scroll when modal is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }

    // Cleanup on unmount
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isOpen]);

  const modalContent = (
    <AnimatePresence>
      {isOpen && (
        <div 
          className="fixed inset-0 flex items-center justify-center p-4" 
          style={{
            zIndex: 999999,
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}
        >
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/80 backdrop-blur-md z-[99998]" 
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0
            }}
            onClick={onClose}
          />
          
          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            transition={{ type: "spring", duration: 0.5 }}
            className="relative bg-gradient-to-br from-gray-900/95 to-black/95 border border-purple-500/20 rounded-2xl p-8 max-w-md w-full mx-4 shadow-2xl shadow-purple-500/10 max-h-[90vh] overflow-y-auto z-[99999]"
          >
            {/* Close Button */}
            <button
              onClick={onClose}
              className="absolute top-4 right-4 text-gray-300 hover:text-white transition-colors p-2 rounded-full bg-gray-800/50 hover:bg-gray-700/80 border border-gray-600/30 hover:border-gray-500/50 z-10"
              title="Close"
            >
              <X className="w-5 h-5" />
            </button>

            {/* Crown Icon */}
            <div className="flex justify-center mb-6">
              <div className="relative">
                <div className="w-16 h-16 bg-gradient-to-br from-purple-500/20 to-pink-500/20 rounded-full flex items-center justify-center border border-purple-400/30">
                  <Crown className="w-8 h-8 text-purple-400" />
                </div>
                <div className="absolute -top-1 -right-1 w-6 h-6 bg-gradient-to-br from-yellow-400 to-orange-400 rounded-full flex items-center justify-center">
                  <Zap className="w-3 h-3 text-white" />
                </div>
              </div>
            </div>

            {/* Feature specific content */}
            {feature && (
              <div className="text-center mb-6">
                <div className="text-3xl mb-3">{feature.icon}</div>
                <h3 className="text-xl font-bold text-white mb-2">{feature.title}</h3>
                <p className="text-gray-300 text-sm">
                  {feature.description}
                </p>
              </div>
            )}

            {/* Generic upgrade content */}
            {!feature && (
              <div className="text-center mb-6">
                <h3 className="text-xl font-bold text-white mb-2">Upgrade to Pro</h3>
                <p className="text-gray-300 text-sm">
                  {triggerFeature === 'maxChallenges' 
                    ? 'You\'ve reached your challenge limit. Upgrade for unlimited challenges!'
                    : 'Unlock premium features and take your trading to the next level.'
                  }
                </p>
              </div>
            )}

            {/* Feature List */}
            <div className="mb-6">
              <p className="text-sm font-medium text-gray-300 mb-3">Unlock Pro features:</p>
              <div className="space-y-2">
                {proFeatures.map((proFeature, index) => (
                  <motion.div
                    key={index}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: index * 0.05 }}
                    className="flex items-center gap-2 text-sm text-gray-300"
                  >
                    <Check className="w-4 h-4 text-green-400 flex-shrink-0" />
                    <span>{proFeature}</span>
                  </motion.div>
                ))}
              </div>
            </div>

            {FREE_ACCESS_MODE && (
              <div className="mb-6 rounded-xl border border-green-400/30 bg-green-500/10 p-4 text-center text-green-200 text-sm">
                Free beta mode is active. Premium gating is currently disabled.
              </div>
            )}

            {/* Upgrade Button */}
            <Button
              onClick={handleUpgrade}
              variant="primary"
              className="w-full bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 border-purple-400/50 text-white font-semibold py-3 px-6 rounded-lg transition-all duration-200 hover:scale-[1.02] shadow-lg hover:shadow-purple-500/25"
              leftIcon={<Crown className="w-4 h-4" />}
            >
              {FREE_ACCESS_MODE ? 'Close' : 'Upgrade to Pro - $19.99/month'}
            </Button>

            {/* Small text */}
            <p className="text-xs text-gray-500 text-center mt-4">
              {FREE_ACCESS_MODE ? 'Billing is paused while free beta mode is active' : '30-day money back guarantee'}
            </p>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );

  // Use portal to render at document body level to avoid layout interference
  return createPortal(modalContent, document.body);
};
