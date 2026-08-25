import React from 'react';
import { todayLocalISO } from '../utils/dates';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from './ui/Button';
import { NeonCard } from './NeonCard';
import { Challenge } from '../types';
import { Plus, Trash2, TrendingUp, TrendingDown, Calendar, BarChart3 } from 'lucide-react';

interface PnLManagerProps {
  challenge: Challenge;
  onUpdate: (challenge: Challenge) => void;
}

function getWeekNumber(date: Date): string {
  const year = date.getFullYear();
  const startOfYear = new Date(year, 0, 1);
  const days = Math.floor((date.getTime() - startOfYear.getTime()) / (24 * 60 * 60 * 1000));
  const weekNumber = Math.ceil((days + startOfYear.getDay() + 1) / 7);
  return `${year}-W${weekNumber.toString().padStart(2, '0')}`;
}

export const PnLManager: React.FC<PnLManagerProps> = ({ challenge, onUpdate }) => {
  const [activeTab, setActiveTab] = React.useState<'weekly' | 'monthly'>('weekly');
  const [amount, setAmount] = React.useState('');
  const [date, setDate] = React.useState(todayLocalISO());
  const [loading, setLoading] = React.useState(false);
  const [errors, setErrors] = React.useState<Record<string, string>>({});

  const formatCurrency = (value: string) => {
    const num = parseFloat(value.replace(/[^\d.-]/g, ''));
    if (isNaN(num)) return '';
    return num.toLocaleString();
  };

  const validateForm = () => {
    const newErrors: Record<string, string> = {};
    
    const amountNum = Number(amount.replace(/[^\d.-]/g, ''));
    if (!amount.trim() || isNaN(amountNum)) {
      newErrors.amount = 'Amount is required';
    }
    
    if (!date) newErrors.date = 'Date is required';
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleAddPnL = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validateForm()) return;
    
    setLoading(true);
    
    try {
      const amountValue = Number(amount.replace(/[^\d.-]/g, ''));
      const selectedDate = new Date(date);
      
      let key: string;
      let updatedPnL: Record<string, number>;
      
      if (activeTab === 'weekly') {
        key = getWeekNumber(selectedDate);
        updatedPnL = { ...challenge.weeklyPnL, [key]: (challenge.weeklyPnL?.[key] ?? 0) + amountValue };
      } else {
        key = date.slice(0, 7); // YYYY-MM format
        updatedPnL = { ...challenge.monthlyPnL, [key]: (challenge.monthlyPnL?.[key] ?? 0) + amountValue };
      }
      
      const updatedChallenge = {
        ...challenge,
        ...(activeTab === 'weekly' ? { weeklyPnL: updatedPnL } : { monthlyPnL: updatedPnL })
      };
      
      onUpdate(updatedChallenge);
      
      // Reset form
      setAmount('');
      setDate(todayLocalISO());
      setErrors({});
    } catch (error) {
      console.error('Add PnL error:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleRemovePnL = async (key: string) => {
    setLoading(true);
    
    try {
      let updatedPnL: Record<string, number>;
      
      if (activeTab === 'weekly') {
        updatedPnL = { ...challenge.weeklyPnL };
        delete updatedPnL[key];
      } else {
        updatedPnL = { ...challenge.monthlyPnL };
        delete updatedPnL[key];
      }
      
      const updatedChallenge = {
        ...challenge,
        ...(activeTab === 'weekly' ? { weeklyPnL: updatedPnL } : { monthlyPnL: updatedPnL })
      };
      
      onUpdate(updatedChallenge);
    } catch (error) {
      console.error('Remove PnL error:', error);
    } finally {
      setLoading(false);
    }
  };

  const inputClasses = (fieldName: string) => `
    px-3 py-2 rounded-md bg-white/5 border transition-colors duration-200
    ${errors[fieldName] ? 'border-red-500/50 focus:border-red-400' : 'border-white/10 focus:border-cyan-400/50'}
    text-white placeholder-white/40
    focus:outline-none focus:ring-2 focus:ring-cyan-500/30
  `;

  const currentData = activeTab === 'weekly' ? challenge.weeklyPnL || {} : challenge.monthlyPnL || {};
  const sortedEntries = Object.entries(currentData).sort(([a], [b]) => b.localeCompare(a));
  const total = Object.values(currentData).reduce((sum, val) => sum + val, 0);

  return (
    <NeonCard className="p-4" glow="cyan">
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-white drop-shadow-neon">PnL Tracking</h3>
          <div className="text-right">
            <div className="text-sm text-white/70">Total {activeTab === 'weekly' ? 'Weekly' : 'Monthly'}</div>
            <div className={`text-xl font-bold drop-shadow-neon ${total >= 0 ? 'text-lime-300 drop-shadow-neon-lime' : 'text-red-400'}`}>
              {total >= 0 ? '+' : ''}${total.toLocaleString(undefined, { maximumFractionDigits: 2 })}
            </div>
          </div>
        </div>

        {/* Tab Switcher */}
        <div className="flex gap-2">
          <button
            onClick={() => setActiveTab('weekly')}
            className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all duration-200 ${
              activeTab === 'weekly'
                ? 'bg-cyan-500/20 border border-cyan-400/50 text-cyan-200'
                : 'bg-white/5 border border-white/10 text-white/70 hover:text-white'
            }`}
          >
            <BarChart3 className="w-4 h-4" />
            Weekly
          </button>
          <button
            onClick={() => setActiveTab('monthly')}
            className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all duration-200 ${
              activeTab === 'monthly'
                ? 'bg-cyan-500/20 border border-cyan-400/50 text-cyan-200'
                : 'bg-white/5 border border-white/10 text-white/70 hover:text-white'
            }`}
          >
            <Calendar className="w-4 h-4" />
            Monthly
          </button>
        </div>

        {/* Add PnL Form */}
        <form onSubmit={handleAddPnL} className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-white/60">
              {activeTab === 'weekly' ? 'Weekly' : 'Monthly'} PnL
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <span className="text-white/60 sm:text-sm">$</span>
              </div>
              <input
                type="text"
                value={amount ? formatCurrency(amount) : ''}
                onChange={e => { 
                  const rawValue = e.target.value.replace(/[^\d.-]/g, '');
                  setAmount(rawValue); 
                  setErrors(prev => ({ ...prev, amount: '' })); 
                }}
                className={`pl-8 ${inputClasses('amount')}`}
                placeholder="1,000 or -500"
                disabled={loading}
              />
            </div>
            {errors.amount && <span className="text-xs text-red-400">{errors.amount}</span>}
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs text-white/60">Date</label>
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
              variant="primary"
              loading={loading}
              disabled={loading}
              leftIcon={<Plus className="w-4 h-4" />}
              className="w-full"
              glow
            >
              Add {activeTab === 'weekly' ? 'Weekly' : 'Monthly'} PnL
            </Button>
          </div>
        </form>

        {/* PnL List */}
        {sortedEntries.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-sm font-medium text-white/80">
              {activeTab === 'weekly' ? 'Weekly' : 'Monthly'} PnL History
            </h4>
            <AnimatePresence mode="popLayout">
              {sortedEntries.map(([key, value], index) => (
                <motion.div
                  key={key}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, x: -100, scale: 0.95 }}
                  transition={{ duration: 0.2, delay: index * 0.05 }}
                  layout
                  className="flex items-center justify-between p-3 rounded-lg bg-white/5 border border-white/10 hover:border-white/20 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-full ${value >= 0 ? 'bg-lime-500/20' : 'bg-red-500/20'}`}>
                      {value >= 0 ? (
                        <TrendingUp className="w-4 h-4 text-lime-400" />
                      ) : (
                        <TrendingDown className="w-4 h-4 text-red-400" />
                      )}
                    </div>
                    <div>
                      <div className={`font-medium ${value >= 0 ? 'text-lime-200' : 'text-red-200'}`}>
                        {value >= 0 ? '+' : ''}${value.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                      </div>
                      <div className="text-xs text-white/60">
                        {activeTab === 'weekly' ? `Week ${key.replace(/^\d{4}-W/, '')}` : key}
                      </div>
                    </div>
                  </div>
                  
                  <Button
                    size="sm"
                    variant="danger"
                    onClick={() => handleRemovePnL(key)}
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

        {sortedEntries.length === 0 && (
          <div className="text-center py-6 text-white/60">
            <div className="mb-2">No {activeTab} PnL data yet</div>
            <div className="text-sm">Add your first {activeTab} PnL above!</div>
          </div>
        )}
      </div>
    </NeonCard>
  );
};
