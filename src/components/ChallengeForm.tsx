import React from 'react';
import { NeonCard } from './NeonCard';
import { Button } from './ui/Button';
import { PropFirm, NewChallengeInput, Challenge, NewFirmInput, ChallengeStatus, FirmType } from '../types';
import { CalendarDays, CircleDollarSign, Layers3, Plus, Save, Target, WalletCards } from 'lucide-react';

export const ChallengeForm: React.FC<{
  firms: PropFirm[];
  defaultFirmId?: string | null;
  initial?: Challenge;
  onSubmit: (input: NewChallengeInput | Challenge) => void;
  buildingMode?: boolean;
  onAddFirm?: (input: NewFirmInput) => Promise<PropFirm>;
  readOnly?: boolean;
}> = ({ firms, defaultFirmId = null, initial, onSubmit, buildingMode = false, onAddFirm, readOnly = false }) => {
  
  // Get previous account sizes from localStorage
  const getPreviousAccountSizes = (): number[] => {
    try {
      const stored = localStorage.getItem('previous_account_sizes');
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  };
  
  const savePreviousAccountSize = (size: number) => {
    const previous = getPreviousAccountSizes();
    const updated = [size, ...previous.filter(s => s !== size)].slice(0, 10); // Keep top 10 unique sizes
    localStorage.setItem('previous_account_sizes', JSON.stringify(updated));
  };
  
  // Get previous strategies from localStorage
  const getPreviousStrategies = (): string[] => {
    try {
      const stored = localStorage.getItem('previous_strategies');
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  };
  
  const savePreviousStrategy = (strategy: string) => {
    if (!strategy.trim()) return;
    const previous = getPreviousStrategies();
    const updated = [strategy.trim(), ...previous.filter(s => s !== strategy.trim())].slice(0, 10); // Keep top 10 unique strategies
    localStorage.setItem('previous_strategies', JSON.stringify(updated));
  };
  
  // Get previous phase counts from localStorage
  const getPreviousPhases = (): number[] => {
    try {
      const stored = localStorage.getItem('previous_phases');
      return stored ? JSON.parse(stored) : [3, 2, 1]; // Default common options
    } catch {
      return [3, 2, 1];
    }
  };
  
  const savePreviousPhases = (phases: number) => {
    const previous = getPreviousPhases();
    const updated = [phases, ...previous.filter(p => p !== phases)].slice(0, 10); // Keep top 10 unique phase counts
    localStorage.setItem('previous_phases', JSON.stringify(updated));
  };
  
  // Date memory functions for build mode
  const getLastUsedDate = (): string => {
    try {
      const stored = localStorage.getItem('last_challenge_date');
      return stored || new Date().toISOString().slice(0, 10);
    } catch {
      return new Date().toISOString().slice(0, 10);
    }
  };
  
  const saveLastUsedDate = (date: string) => {
    localStorage.setItem('last_challenge_date', date);
  };
  const [propFirmId, setFirm] = React.useState(initial?.propFirmId ?? defaultFirmId ?? '');
  const [propFirmName, setPropFirmName] = React.useState(() => {
    if (initial?.propFirmId) {
      const firm = firms.find(f => f.id === initial.propFirmId);
      return firm?.name || '';
    }
    if (defaultFirmId) {
      const firm = firms.find(f => f.id === defaultFirmId);
      return firm?.name || '';
    }
    return '';
  });
  const [firmCreating, setFirmCreating] = React.useState(false);
  const [strategy, setStrategy] = React.useState(initial?.strategy ?? '');
  const [accountSize, setSize] = React.useState<number>(initial?.accountSize ?? 100000);
  const [startDate, setStartDate] = React.useState(
    initial?.startDate ?? (buildingMode ? getLastUsedDate() : new Date().toISOString().slice(0,10))
  );
  const [cost, setCost] = React.useState<number>(initial?.initialCost ?? initial?.cost ?? 0);
  const [totalPhases, setTotalPhases] = React.useState<1 | 2 | 3>(initial?.totalPhases ?? 3);
  const [accountSizeStr, setAccountSizeStr] = React.useState(String(initial?.accountSize ?? 100000));
  const [costStr, setCostStr] = React.useState(String(initial?.initialCost ?? initial?.cost ?? 0));
  const [hasActivationFee, setHasActivationFee] = React.useState<boolean>(initial?.hasActivationFee ?? false);
  const [status] = React.useState<ChallengeStatus>(initial?.status ?? 'active');
  const [loading, setLoading] = React.useState(false);
  const formDisabled = loading || readOnly;
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [accountSizeCleared, setAccountSizeCleared] = React.useState(false);
  const [costCleared, setCostCleared] = React.useState(false);
  const [firmType, setFirmType] = React.useState<FirmType | undefined>(() => {
    if (initial?.firmType) return initial.firmType;
    if (initial?.propFirmId) {
      return firms.find((firm) => firm.id === initial.propFirmId)?.firmType;
    }
    if (defaultFirmId) {
      return firms.find((firm) => firm.id === defaultFirmId)?.firmType;
    }
    return undefined;
  });
  const [accountQuantity, setAccountQuantity] = React.useState<number>(initial ? (initial.purchaseGroupSize ?? 1) : 1);
  const [accountQuantityStr, setAccountQuantityStr] = React.useState(String(initial ? (initial.purchaseGroupSize ?? 1) : 1));
  const [purchaseGroupLabel, setPurchaseGroupLabel] = React.useState(initial?.purchaseGroupLabel ?? '');
  
  // Refresh date when buildingMode changes or when component mounts in build mode
  React.useEffect(() => {
    if (buildingMode && !initial) {
      const lastUsedDate = getLastUsedDate();
      setStartDate(lastUsedDate);
    }
  }, [buildingMode, initial]);

  React.useEffect(() => {
    if (initial?.firmType || firmType) return;
    const selectedFirm = firms.find((firm) => firm.id === propFirmId);
    if (selectedFirm?.firmType) {
      setFirmType(selectedFirm.firmType);
    }
  }, [firms, firmType, initial?.firmType, propFirmId]);
  
  const formatNumber = (value: string) => {
    const num = parseFloat(value.replace(/[^\d.-]/g, ''));
    if (isNaN(num)) return '';
    return num.toLocaleString();
  };

  const validateForm = () => {
    const newErrors: Record<string, string> = {};
    
    if (!propFirmName.trim()) {
      newErrors.propFirmId = firms.length === 0 
        ? 'Please enter a prop firm name (it will be created automatically)'
        : 'Please select or enter a prop firm name';
    }
    
    const accountSizeNum = Number(accountSizeStr);
    if (!accountSizeStr.trim() || accountSizeNum <= 0 || isNaN(accountSizeNum)) {
      newErrors.accountSize = 'Account size must be greater than 0';
    }
    
    if (!startDate) newErrors.startDate = 'Start date is required';
    
    const costNum = Number(costStr);
    if (costStr.trim() && (costNum < 0 || isNaN(costNum))) {
      newErrors.cost = 'Cost cannot be negative';
    }

    if (!initial) {
      const quantityNum = Number(accountQuantityStr);
      if (!accountQuantityStr.trim() || !Number.isInteger(quantityNum) || quantityNum <= 0) {
        newErrors.accountQuantity = 'Accounts must be a whole number greater than 0';
      }
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validateForm()) return;
    
    setLoading(true);
    
    try {
      // Determine the prop firm ID to use
      let finalPropFirmId = propFirmId;
      
      // If we have a prop firm name but no ID, we need to find or create the firm
      if (propFirmName.trim() && !finalPropFirmId) {
        const existingFirm = firms.find(f => f.name.toLowerCase() === propFirmName.trim().toLowerCase());
        
        if (existingFirm) {
          finalPropFirmId = existingFirm.id;
        } else if (onAddFirm) {
          // Create new firm
          setFirmCreating(true);
          try {
            const newFirm = await onAddFirm({ name: propFirmName.trim(), firmType });
            finalPropFirmId = newFirm.id;
          } catch (error) {
            console.error('Error creating firm:', error);
            throw new Error(`Failed to create firm "${propFirmName.trim()}". Please try again.`);
          } finally {
            setFirmCreating(false);
          }
        } else {
          throw new Error('Cannot create new firm: No firm creation function provided.');
        }
      }
      
      if (!finalPropFirmId) {
        throw new Error('Please select a valid prop firm.');
      }
      
      const activationFeeAmount = initial?.activationFeeAmount ?? undefined;
      const totalCost = Number((cost + (activationFeeAmount ?? 0)).toFixed(2));

      if (initial) {
        onSubmit({
          ...initial,
          propFirmId: finalPropFirmId,
          brokerName: initial.brokerName || 'Trading Account',
          purchaseGroupId: initial.purchaseGroupId,
          purchaseGroupLabel: initial.purchaseGroupLabel,
          purchaseGroupSize: initial.purchaseGroupSize,
          purchaseGroupIndex: initial.purchaseGroupIndex,
          accountSize,
          startDate,
          cost: totalCost,
          initialCost: cost,
          hasActivationFee,
          activationFeeAmount,
          totalPhases,
          status,
          strategy: strategy.trim() || undefined,
          firmType
        });
      } else {
        // Save account size, strategy, and phase count for future reference
        savePreviousAccountSize(accountSize);
        savePreviousPhases(totalPhases);
        if (strategy.trim()) {
          savePreviousStrategy(strategy);
        }
        
        onSubmit({
          propFirmId: finalPropFirmId,
          brokerName: 'Trading Account',
          purchaseGroupLabel: purchaseGroupLabel.trim() || undefined,
          accountQuantity,
          accountSize,
          startDate,
          cost: totalCost,
          initialCost: cost,
          hasActivationFee,
          totalPhases,
          status: 'active',
          strategy: strategy.trim() || undefined,
          firmType
        });
        
        // Save the start date as last used in build mode
        if (buildingMode) {
          saveLastUsedDate(startDate);
        }
        
        // Reset form after successful submission (only for new challenges)
        setSize(100000);
        setAccountSizeStr('100000');
        setStartDate(buildingMode ? startDate : new Date().toISOString().slice(0,10));
        setCost(0);
        setCostStr('0');
        setHasActivationFee(false);
        setTotalPhases(3);
        setStrategy('');
        setAccountQuantity(1);
        setAccountQuantityStr('1');
        setPurchaseGroupLabel('');
        // Reset the cleared flags
        setAccountSizeCleared(false);
        setCostCleared(false);
      }
    } catch (error) {
      console.error('Form submission error:', error);
      setFirmCreating(false);
      
      // Show user-friendly error message
      if (error instanceof Error) {
        alert(`Error: ${error.message}`);
      } else {
        alert('An unexpected error occurred. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  const inputClasses = (fieldName: string) => `
    w-full min-w-0 px-3 py-2 rounded-md bg-white/5 border transition-colors duration-200
    ${errors[fieldName] ? 'border-red-500/50 focus:border-red-400' : 'border-white/10 focus:border-cyan-400/50'}
    text-white placeholder-white/40
    focus:outline-none focus:ring-2 focus:ring-cyan-500/30
  `;

  const optionCardClasses = (active: boolean, tone: 'cyan' | 'amber' | 'purple' = 'cyan') => {
    const activeStyles = {
      cyan: 'border-cyan-400/50 bg-cyan-500/15 text-cyan-200 shadow-[0_0_20px_rgba(34,211,238,0.18)]',
      amber: 'border-amber-400/50 bg-amber-500/15 text-amber-200 shadow-[0_0_20px_rgba(251,191,36,0.16)]',
      purple: 'border-purple-400/50 bg-purple-500/15 text-purple-200 shadow-[0_0_20px_rgba(168,85,247,0.16)]',
    };

    return `rounded-xl border px-3 py-3 text-sm font-medium transition-all duration-200 ${
      active
        ? activeStyles[tone]
        : 'border-white/10 bg-white/[0.03] text-white/75 hover:border-white/20 hover:bg-white/[0.06] hover:text-white'
    }`;
  };

  return (
    <NeonCard className="p-4 sm:p-5" glow="cyan" loading={loading}>
      <form className="space-y-6" onSubmit={handleSubmit}>
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 sm:p-5">
          <div className="mb-4 flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-cyan-500/15 text-cyan-200">
              <WalletCards className="h-4 w-4" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-white">Core Details</h3>
              <p className="text-xs text-white/45">Firm, size, date, and strategy.</p>
            </div>
          </div>
          <div className={`grid grid-cols-1 gap-4 md:grid-cols-2 ${initial ? 'xl:grid-cols-4' : 'xl:grid-cols-3'}`}>
          {/* Prop Firm - First */}
          <div className="flex min-w-0 flex-col gap-1">
            <label className="text-xs text-white/60">Prop Firm</label>
            {firms.length === 0 && (
              <div className="text-xs text-cyan-400 mb-2 p-2 bg-cyan-500/10 border border-cyan-500/20 rounded">
                💡 No firms found. Enter a firm name below and it will be created automatically.
              </div>
            )}
            <input 
              type="text" 
              list="prop-firms"
              value={propFirmName}
              onChange={e => { 
                const value = e.target.value;
                setPropFirmName(value);
                
                // Try to find matching firm
                const matchingFirm = firms.find(f => f.name.toLowerCase() === value.toLowerCase());
                if (matchingFirm) {
                  setFirm(matchingFirm.id);
                } else {
                  setFirm('');
                }
                
                setErrors(prev => ({ ...prev, propFirmId: '' })); 
              }}
              className={inputClasses('propFirmId')}
              disabled={formDisabled || firmCreating}
              placeholder={firms.length > 0 ? "e.g., FTMO, MyForexFunds" : "e.g., FTMO, MyForexFunds (new firm will be created)"}
            />
            <datalist id="prop-firms">
              {firms.map(firm => (
                <option key={firm.id} value={firm.name} />
              ))}
            </datalist>
            {errors.propFirmId && <span className="text-xs text-red-400">{errors.propFirmId}</span>}
            {firmCreating && <span className="text-xs text-cyan-400">Creating prop firm...</span>}
            {!firmCreating && firms.length === 0 && propFirmName.trim() && (
              <span className="text-xs text-green-400">✨ New firm "{propFirmName}" will be created</span>
            )}
          </div>
        
          {/* Account Size - Second */}
          <div className="flex min-w-0 flex-col gap-1">
            <label className="text-xs text-white/60">Account Size</label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <span className="text-white/60 sm:text-sm">$</span>
              </div>
            <input 
              type="text" 
              list="account-sizes"
              value={accountSizeStr ? formatNumber(accountSizeStr) : ''}
              onChange={e => { 
                const rawValue = e.target.value.replace(/[^\d.-]/g, '');
                
                // If this is the first keystroke and we haven't cleared yet, start fresh
                if (!accountSizeCleared && !initial) {
                  setAccountSizeStr(rawValue);
                  setAccountSizeCleared(true);
                } else {
                  setAccountSizeStr(rawValue);
                }
                
                const numValue = rawValue === '' ? 0 : Number(rawValue);
                setSize(numValue); 
                setErrors(prev => ({ ...prev, accountSize: '' })); 
              }}
              onFocus={() => {
                // Clear the field on focus if it's the default value and not editing
                if (!accountSizeCleared && !initial) {
                  setAccountSizeStr('');
                  setAccountSizeCleared(true);
                }
              }}
                className={`pl-8 ${inputClasses('accountSize')}`}
                disabled={formDisabled}
                placeholder="100,000"
              />
              <datalist id="account-sizes">
                {getPreviousAccountSizes().map((size, index) => (
                  <option key={index} value={size.toLocaleString()} />
                ))}
              </datalist>
            </div>
            {errors.accountSize && <span className="text-xs text-red-400">{errors.accountSize}</span>}
          </div>
        
          {/* Start Date - Third */}
          <div className="flex min-w-0 flex-col gap-1">
            <label className="text-xs text-white/60">Start Date</label>
            <input 
              type="date" 
              value={startDate} 
              onChange={e => { setStartDate(e.target.value); setErrors(prev => ({ ...prev, startDate: '' })); }}
              className={inputClasses('startDate')}
              disabled={formDisabled}
            />
            {errors.startDate && <span className="text-xs text-red-400">{errors.startDate}</span>}
          </div>
        
          {/* Strategy */}
          <div className="flex min-w-0 flex-col gap-1">
            <label className="text-xs text-white/60">Strategy</label>
            <input 
              type="text" 
              list="strategies"
              value={strategy}
              onChange={e => { 
                setStrategy(e.target.value);
                setErrors(prev => ({ ...prev, strategy: '' })); 
              }}
              className={inputClasses('strategy')}
              disabled={formDisabled}
              placeholder="e.g., Scalping, Swing Trading, ICT"
            />
            <datalist id="strategies">
              {getPreviousStrategies().map((strategyOption, index) => (
                <option key={index} value={strategyOption} />
              ))}
            </datalist>
            {errors.strategy && <span className="text-xs text-red-400">{errors.strategy}</span>}
          </div>

          {!initial && (
            <>
              <div className="flex min-w-0 flex-col gap-1">
                <label className="text-xs text-white/60">Accounts</label>
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={accountQuantityStr}
                  onChange={e => {
                    const rawValue = e.target.value.replace(/[^\d]/g, '');
                    setAccountQuantityStr(rawValue);
                    setAccountQuantity(rawValue ? Number(rawValue) : 0);
                    setErrors(prev => ({ ...prev, accountQuantity: '' }));
                  }}
                  className={inputClasses('accountQuantity')}
                  disabled={formDisabled}
                  placeholder="1"
                />
                {errors.accountQuantity && <span className="text-xs text-red-400">{errors.accountQuantity}</span>}
              </div>

              <div className="flex min-w-0 flex-col gap-1 md:col-span-2 xl:col-span-2">
                <label className="text-xs text-white/60">Linked Batch Label</label>
                <input
                  type="text"
                  value={purchaseGroupLabel}
                  onChange={e => setPurchaseGroupLabel(e.target.value)}
                  className={inputClasses('purchaseGroupLabel')}
                  disabled={formDisabled}
                  placeholder="Optional, e.g. Apex 5-Pack"
                />
              </div>
            </>
          )}
        </div>
        </div>
        
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 sm:p-5">
          <div className="mb-4 flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-purple-500/15 text-purple-200">
              <Target className="h-4 w-4" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-white">Challenge Setup</h3>
              <p className="text-xs text-white/45">Cost, activation fee, phases, and firm type.</p>
            </div>
          </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4 xl:items-start">
          {/* Challenge Cost */}
          <div className="flex h-full min-w-0 flex-col gap-2 rounded-xl border border-white/10 bg-black/15 p-3">
            <label className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-white/60">
              <CircleDollarSign className="h-3.5 w-3.5" />
              Challenge Cost
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <span className="text-white/60 sm:text-sm">$</span>
              </div>
              <input 
                type="text" 
                value={costStr}
                onChange={e => { 
                  const rawValue = e.target.value.replace(/[^\d.-]/g, '');
                  const parts = rawValue.split('.');
                  let formattedValue = parts[0];
                  if (parts.length > 1) {
                    formattedValue += '.' + parts[1].slice(0, 2);
                  }
                  if (!costCleared && !initial && costStr === '0') {
                    setCostStr(formattedValue);
                    setCostCleared(true);
                  } else {
                    setCostStr(formattedValue);
                  }
                  const numValue = formattedValue === '' ? 0 : parseFloat(formattedValue) || 0;
                  setCost(numValue); 
                  setErrors(prev => ({ ...prev, cost: '' })); 
                }}
                onFocus={() => {
                  if (!costCleared && !initial && costStr === '0') {
                    setCostStr('');
                    setCostCleared(true);
                  }
                }}
                className={`pl-8 w-full ${inputClasses('cost')}`}
                disabled={formDisabled}
                placeholder="100"
              />
            </div>
            {errors.cost && <span className="text-xs text-red-400">{errors.cost}</span>}
          </div>

          {/* Activation Fee */}
          <div className="flex h-full min-w-0 flex-col gap-2 rounded-xl border border-white/10 bg-black/15 p-3">
            <label className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-white/60">
              <CalendarDays className="h-3.5 w-3.5" />
              Activation Fee
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setHasActivationFee(false)}
                disabled={formDisabled}
                className={optionCardClasses(!hasActivationFee, 'cyan')}
              >
                No
              </button>
              <button
                type="button"
                onClick={() => setHasActivationFee(true)}
                disabled={formDisabled}
                className={optionCardClasses(hasActivationFee, 'amber')}
              >
                Yes
              </button>
            </div>
          </div>

          {/* Phases */}
          <div className="flex h-full min-w-0 flex-col gap-2 rounded-xl border border-white/10 bg-black/15 p-3">
            <label className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-white/60">
              <Layers3 className="h-3.5 w-3.5" />
              Phases
            </label>
            <div className="grid grid-cols-3 gap-2">
              {[1, 2, 3].map((phaseCount) => (
                <button
                  key={phaseCount}
                  type="button"
                  disabled={formDisabled}
                  onClick={() => {
                    setTotalPhases(phaseCount as 1 | 2 | 3);
                    setErrors(prev => ({ ...prev, totalPhases: '' }));
                  }}
                  className={optionCardClasses(totalPhases === phaseCount, 'purple')}
                >
                  {phaseCount}
                </button>
              ))}
            </div>
          </div>

          {/* Firm Type */}
          <div className="flex h-full min-w-0 flex-col gap-2 rounded-xl border border-white/10 bg-black/15 p-3">
            <label className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-white/60">
              <WalletCards className="h-3.5 w-3.5" />
              Firm Type
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setFirmType('futures')}
                disabled={formDisabled}
                className={optionCardClasses(firmType === 'futures', 'cyan')}
              >
                Futures
              </button>
              <button
                type="button"
                onClick={() => setFirmType('cfd')}
                disabled={formDisabled}
                className={optionCardClasses(firmType === 'cfd', 'purple')}
              >
                CFD
              </button>
            </div>
          </div>
        </div>
        </div>
        
        <div className="flex justify-stretch border-t border-white/10 pt-2 sm:justify-end">
          <Button
            type="submit"
            variant="primary"
            loading={loading}
            disabled={formDisabled || (firms.length === 0 && !propFirmName.trim())}
            leftIcon={initial ? <Save className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
            className="w-full px-6 sm:w-auto"
            glow
          >
            {initial 
              ? 'Save Changes' 
              : (firms.length === 0 && !propFirmName.trim() 
                  ? 'Enter Prop Firm Name First' 
                  : 'Add Challenge'
                )
            }
          </Button>
        </div>
      </form>
    </NeonCard>
  );
};
