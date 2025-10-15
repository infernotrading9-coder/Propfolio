import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from './ui/Button';
import { NeonCard } from './NeonCard';
import { Challenge, PayoutEntry } from '../types';
import { Plus, Trash2, DollarSign } from 'lucide-react';
import { apiClient } from '../utils/apiClient';

interface PayoutManagerProps {
  challenge: Challenge;
  onUpdate: (challenge: Challenge) => void;
}

export const PayoutManager: React.FC<PayoutManagerProps> = ({ challenge, onUpdate }) => {
  const [amount, setAmount] = React.useState('');
  const [date, setDate] = React.useState(new Date().toISOString().slice(0, 10));
  const [loading, setLoading] = React.useState(false);
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [justAdded, setJustAdded] = React.useState<string | null>(null);
  
  // Local payouts state for instant UI updates
  const initialPayouts = Array.isArray(challenge.payouts) ? challenge.payouts : [];
  const [payouts, setPayouts] = React.useState<PayoutEntry[]>(initialPayouts);
  
  // Keep local state in sync when challenge or its payouts change externally
  React.useEffect(() => {
    setPayouts(Array.isArray(challenge.payouts) ? challenge.payouts : []);
  }, [challenge.id, challenge.payouts]);
  
  const totalPayouts = payouts.reduce((sum, p) => sum + p.amount, 0);

  const validateForm = () => {
    const newErrors: Record<string, string> = {};
    
    const amountNum = Number(amount);
    if (!amount.trim() || amountNum <= 0 || isNaN(amountNum)) {
      newErrors.amount = 'Amount must be greater than 0';
    }
    
    if (!date) newErrors.date = 'Date is required';
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleAddPayout = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validateForm()) return;
    
    setLoading(true);
    
    try {
      // Add payout via API
      const { payout: created } = await apiClient.addPayout(challenge.id, Number(amount), date);
      
      // Update local state immediately
      setPayouts(prev => [...prev, created]);
      
      // Update the parent state
      const currentPayouts = Array.isArray(challenge.payouts) ? challenge.payouts : [];
      const updatedChallenge = {
        ...challenge,
        payouts: [...currentPayouts, created]
      };
      onUpdate(updatedChallenge);
      
      // Trigger success animation
      setJustAdded(created.id);
      setTimeout(() => setJustAdded(null), 1000);
      
      // Reset form
      setAmount('');
      setDate(new Date().toISOString().slice(0, 10));
      setErrors({});
    } catch (error) {
      console.error('Add payout error:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleRemovePayout = async (payoutId: string) => {
    setLoading(true);

    // Optimistic UI: remove locally first
    const prevChallenge = challenge;

    const newList = payouts.filter(p => p.id !== payoutId);
    setPayouts(newList);

    const updatedChallenge = {
      ...challenge,
      payouts: newList
    };
    onUpdate(updatedChallenge);
    
    try {
      await apiClient.removePayout(payoutId);
    } catch (error) {
      console.error('Remove payout error:', error);
      // Revert UI on failure
      onUpdate(prevChallenge);
      alert('Failed to remove payout. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const inputClasses = (fieldName: string) => `
    px-3 py-2 rounded-md bg-white/5 border transition-colors duration-200
    ${errors[fieldName] ? 'border-red-500/50 focus:border-red-400' : 'border-white/10 focus:border-lime-400/50'}
    text-white placeholder-white/40
    focus:outline-none focus:ring-2 focus:ring-lime-500/30
  `;

  return (
    <NeonCard className="p-4" glow="lime">
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-white drop-shadow-neon">Payout Management</h3>
          <div className="text-right">
            <div className="text-sm text-white/70">Total Payouts</div>
            <div className="text-xl font-bold text-lime-300 drop-shadow-neon-lime">
              ${totalPayouts.toLocaleString(undefined, { maximumFractionDigits: 2 })}
            </div>
          </div>
        </div>

        {/* Add Payout Form */}
        <form onSubmit={handleAddPayout} className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-white/60">Amount</label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <span className="text-white/60 sm:text-sm">$</span>
              </div>
              <input
                type="text"
                value={amount}
                onChange={e => { 
                  const rawValue = e.target.value.replace(/[^\d.-]/g, '');
                  // Allow decimal point and up to 2 decimal places
                  const parts = rawValue.split('.');
                  let formattedValue = parts[0];
                  if (parts.length > 1) {
                    formattedValue += '.' + parts[1].slice(0, 2); // Limit to 2 decimal places
                  }
                  setAmount(formattedValue); 
                  setErrors(prev => ({ ...prev, amount: '' })); 
                }}
                className={`pl-8 ${inputClasses('amount')}`}
                placeholder="1,000"
                disabled={loading}
              />
            </div>
            {errors.amount && <span className="text-xs text-red-400">{errors.amount}</span>}
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs text-white/60">Date Received</label>
            <input
              type="date"
              value={date}
              onChange={e => { setDate(e.target.value); setErrors(prev => ({ ...prev, date: '' })); }}
              className={inputClasses('date')}
              disabled={loading}
            />
            {errors.date && <span className="text-xs text-red-400">{errors.date}</span>}
          </div>

          <div className="flex items-end">
            <Button
              type="submit"
              variant="success"
              loading={loading}
              disabled={loading}
              leftIcon={<Plus className="w-4 h-4" />}
              className="w-full"
              glow
            >
              Add Payout
            </Button>
          </div>
        </form>

        {/* Payout List */}
        {payouts.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-sm font-medium text-white/80">Payout History</h4>
            <AnimatePresence mode="popLayout">
              {[...payouts]
                .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
                .map((payout, index) => (
                <motion.div
                  key={payout.id}
                  initial={{ opacity: 0, y: 20, scale: 0.9 }}
                  animate={{ 
                    opacity: 1, 
                    y: 0, 
                    scale: justAdded === payout.id ? [0.9, 1.05, 1] : 1,
                  }}
                  exit={{ opacity: 0, x: -100, scale: 0.95 }}
                  transition={{ 
                    duration: justAdded === payout.id ? 0.6 : 0.2, 
                    delay: index * 0.05,
                    type: justAdded === payout.id ? 'spring' : 'tween'
                  }}
                  layout
                  className={`flex items-center justify-between p-3 rounded-lg transition-all duration-300 ${
                    justAdded === payout.id 
                      ? 'bg-lime-500/20 border-lime-400/50 shadow-[0_0_20px_rgba(163,230,53,0.3)]'
                      : 'bg-white/5 border-white/10 hover:border-white/20'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-full bg-lime-500/20">
                      <DollarSign className="w-4 h-4 text-lime-400" />
                    </div>
                    <div>
                      <div className="font-medium text-white">
                        ${payout.amount.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                      </div>
                      <div className="text-xs text-white/60">
                        {new Date(payout.date).toLocaleDateString()}
                      </div>
                    </div>
                  </div>
                  
                  <Button
                    size="sm"
                    variant="danger"
                    onClick={() => handleRemovePayout(payout.id)}
                    disabled={loading}
                    leftIcon={<Trash2 className="w-4 h-4" />}
                    className="px-3"
                  >
                    Remove
                  </Button>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}

        {payouts.length === 0 && (
          <div className="text-center py-6 text-white/60">
            <div className="mb-2">No payouts recorded yet</div>
            <div className="text-sm">Add your first payout above!</div>
          </div>
        )}
      </div>
    </NeonCard>
  );
};