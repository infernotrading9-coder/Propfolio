import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Calendar, Plus, X, CheckCircle } from 'lucide-react';
import { Challenge, PropFirm } from '../types';
import { Button } from './ui/Button';

interface CalendarIntegrationModalProps {
  isOpen: boolean;
  challenge: Challenge | null;
  firms: PropFirm[];
  phase?: 'initial' | 'phase1' | 'phase2' | 'phase3';
  challengeNumber?: number;
  onConfirm: (calendarData: CalendarEventData) => void;
  onCancel: () => void;
}

export interface CalendarEventData {
  title: string;
  description: string;
  challengeId: string;
  phase: string;
  firmName: string;
  accountSize: number;
  challengeNumber: number;
}

export const CalendarIntegrationModal: React.FC<CalendarIntegrationModalProps> = ({
  isOpen,
  challenge,
  firms,
  phase = 'initial',
  challengeNumber,
  onConfirm,
  onCancel
}) => {
  const [isLoading, setIsLoading] = useState(false);

  if (!isOpen || !challenge) return null;

  const firm = firms.find(f => f.id === challenge.propFirmId);
  const firmName = firm?.name || 'Unknown Firm';
  
  // Use provided challenge number or fallback to parsing from ID
  const finalChallengeNumber = challengeNumber ?? parseInt(challenge.id.split('-').pop()?.replace(/[^0-9]/g, '') || '1');

  const getPhaseInfo = () => {
    switch (phase) {
      case 'initial':
        return {
          title: `${firmName} ${(challenge.accountSize / 1000).toFixed(0)}K Phase 1`,
          description: `Trading challenge started - Phase 1 of ${challenge.totalPhases || 3}`,
          phaseNumber: 1
        };
      case 'phase1':
        return {
          title: `${firmName} ${(challenge.accountSize / 1000).toFixed(0)}K Phase 2`,
          description: `Phase 1 completed - Starting Phase 2 of ${challenge.totalPhases || 3}`,
          phaseNumber: 2
        };
      case 'phase2':
        return {
          title: `${firmName} ${(challenge.accountSize / 1000).toFixed(0)}K Phase 3`,
          description: `Phase 2 completed - Starting Phase 3 of ${challenge.totalPhases || 3}`,
          phaseNumber: 3
        };
      case 'phase3':
        return {
          title: `${firmName} ${(challenge.accountSize / 1000).toFixed(0)}K Live Account`,
          description: `All phases completed - Live trading account active`,
          phaseNumber: 4
        };
      default:
        return {
          title: `${firmName} ${(challenge.accountSize / 1000).toFixed(0)}K`,
          description: 'Trading challenge',
          phaseNumber: 1
        };
    }
  };

  const phaseInfo = getPhaseInfo();
  const fullTitle = `${phaseInfo.title} - #${finalChallengeNumber}`;

  const handleConfirm = async () => {
    setIsLoading(true);
    
    try {
      // Simulate API delay
      await new Promise(resolve => setTimeout(resolve, 800));
      
      const calendarData: CalendarEventData = {
        title: fullTitle,
        description: phaseInfo.description,
        challengeId: challenge.id,
        phase: phase,
        firmName: firmName,
        accountSize: challenge.accountSize,
        challengeNumber: finalChallengeNumber
      };
      
      onConfirm(calendarData);
    } catch (error) {
      console.error('Calendar integration error:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const getModalTitle = () => {
    switch (phase) {
      case 'initial':
        return 'Add Challenge to Calendar';
      case 'phase1':
        return 'Add Phase 2 to Calendar';
      case 'phase2':
        return 'Add Phase 3 to Calendar';
      case 'phase3':
        return 'Add Live Account to Calendar';
      default:
        return 'Add to Calendar';
    }
  };

  const getModalMessage = () => {
    switch (phase) {
      case 'initial':
        return `Do you want to add this new challenge to your Rule Calendar? This will create a calendar event for Phase 1.`;
      case 'phase1':
        return `Congratulations on passing Phase 1! Do you want to add Phase 2 to your calendar?`;
      case 'phase2':
        return `Great job completing Phase 2! Do you want to add Phase 3 to your calendar?`;
      case 'phase3':
        return `Excellent! All phases completed. Do you want to add your Live Account to the calendar?`;
      default:
        return 'Do you want to add this to your calendar?';
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50"
          onClick={onCancel}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ type: 'spring', stiffness: 300, damping: 25 }}
            className="bg-[#0b0f17] border border-white/20 rounded-xl p-6 max-w-md w-full shadow-xl"
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-purple-500/20 border border-purple-400/50">
                  <Calendar className="w-5 h-5 text-purple-300" />
                </div>
                <h3 className="text-lg font-semibold text-white drop-shadow-neon">
                  {getModalTitle()}
                </h3>
              </div>
              <Button
                size="sm"
                variant="ghost"
                onClick={onCancel}
                className="p-2"
                disabled={isLoading}
              >
                <X className="w-4 h-4" />
              </Button>
            </div>

            {/* Content */}
            <div className="space-y-4">
              <p className="text-white/80 text-sm leading-relaxed">
                {getModalMessage()}
              </p>

              {/* Calendar Preview */}
              <div className="bg-white/5 border border-white/10 rounded-lg p-4">
                <div className="flex items-start gap-3">
                  <div className="p-2 rounded bg-lime-500/20 border border-lime-400/50 mt-0.5">
                    <CheckCircle className="w-4 h-4 text-lime-400" />
                  </div>
                  <div className="flex-1">
                    <div className="font-medium text-white text-sm mb-1">
                      {fullTitle}
                    </div>
                    <div className="text-xs text-white/60">
                      {phaseInfo.description}
                    </div>
                    <div className="text-xs text-lime-400 mt-1">
                      📅 Will be added to Rule Calendar
                    </div>
                  </div>
                </div>
              </div>

              {/* Challenge Details */}
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="bg-white/5 rounded-lg p-3">
                  <div className="text-white/60 mb-1">Firm</div>
                  <div className="text-white font-medium">{firmName}</div>
                </div>
                <div className="bg-white/5 rounded-lg p-3">
                  <div className="text-white/60 mb-1">Account Size</div>
                  <div className="text-white font-medium">${challenge.accountSize.toLocaleString()}</div>
                </div>
                <div className="bg-white/5 rounded-lg p-3">
                  <div className="text-white/60 mb-1">Challenge #</div>
                  <div className="text-white font-medium">#{finalChallengeNumber}</div>
                </div>
                <div className="bg-white/5 rounded-lg p-3">
                  <div className="text-white/60 mb-1">Phase</div>
                  <div className="text-white font-medium">{phaseInfo.phaseNumber}/{challenge.totalPhases || 3}</div>
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-3 mt-6">
              <Button
                variant="secondary"
                onClick={onCancel}
                disabled={isLoading}
                className="flex-1"
              >
                Not Now
              </Button>
              <Button
                variant="success"
                onClick={handleConfirm}
                loading={isLoading}
                disabled={isLoading}
                leftIcon={<Plus className="w-4 h-4" />}
                className="flex-1"
                glow
              >
                Add to Calendar
              </Button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};