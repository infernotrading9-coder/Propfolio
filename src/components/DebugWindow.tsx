import React, { useState, useEffect } from 'react';
import { NeonCard } from './NeonCard';
import { Eye, EyeOff, ChevronDown, ChevronRight, AlertTriangle, CheckCircle } from 'lucide-react';
import { Challenge } from '../types';
import { useAuth } from '../contexts/AuthContext';
import { useSubscription } from '../contexts/SubscriptionContext';
import { useFeatureAccess } from '../hooks/useFeatureAccess';
import { apiClient } from '../utils/apiClient';

interface DebugWindowProps {
  challenges: Challenge[];
  firms: Array<{id: string; name: string;}>;
  selectedChallenge: Challenge | null;
}

export const DebugWindow: React.FC<DebugWindowProps> = ({
  challenges,
  firms,
  selectedChallenge
}) => {
  // mark as used to satisfy noUnusedLocals in strict builds if not referenced in some paths
  void selectedChallenge;
  const { currentUser } = useAuth();
  const { subscription, limits, canAddChallenge } = useSubscription();
  const { tier, isAdmin, canCreateMoreChallenges, hasReachedLimit } = useFeatureAccess();
  
  // Set to false to disable debug window by default
  // Change to true when debugging is needed
  const [isEnabled] = useState(false);
  const [isOpen, setIsOpen] = useState(true);
  const [lastError, setLastError] = useState<string | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    auth: true,
    limits: true,
    storage: true,
    payouts: true,
    errors: true,
    actions: true
  });
  const [payoutDebugInfo, setPayoutDebugInfo] = useState<any>(null);

  // Capture console errors and payout debug events
  useEffect(() => {
    const originalError = console.error;
    console.error = (...args: any[]) => {
      const errorMsg = args.map(arg => typeof arg === 'string' ? arg : JSON.stringify(arg)).join(' ');
      if (errorMsg.toLowerCase().includes('challenge') || errorMsg.toLowerCase().includes('add') || errorMsg.toLowerCase().includes('payout')) {
        setLastError(errorMsg);
        setLogs(prev => [`${new Date().toLocaleTimeString()}: ${errorMsg}`, ...prev.slice(0, 9)]);
      }
      originalError(...args);
    };

    const handlePayoutDebug = (event: any) => {
      const detail = event.detail;
      setPayoutDebugInfo(detail);
      addLog(`💰 Payout Debug: ${detail.type}`);
      if (detail.type === 'challenge_not_found') {
        addLog(`Looking for challenge: ${detail.challengeId}`);
        addLog(`Available challenges: ${detail.availableChallenges.length}`);
        detail.availableChallenges.forEach((c: any, i: number) => {
          addLog(`  ${i + 1}. ${c.brokerName} (${c.id})`);
        });
      }
    };

    window.addEventListener('payoutDebug', handlePayoutDebug);

    return () => {
      console.error = originalError;
      window.removeEventListener('payoutDebug', handlePayoutDebug);
    };
  }, []);

  const addLog = (message: string) => {
    const timestamp = new Date().toLocaleTimeString();
    setLogs(prev => [`${timestamp}: ${message}`, ...prev.slice(0, 9)]);
  };

  const toggleSection = (section: string) => {
    setExpandedSections(prev => ({
      ...prev,
      [section]: !prev[section]
    }));
  };

  const testChallengeCreation = async () => {
    if (!currentUser?.id) {
      addLog('❌ No user ID - cannot test challenge creation');
      return;
    }

    addLog('🧪 Testing challenge creation...');
    try {
      // Test adding a firm first
      const testFirm = await apiClient.addFirm(currentUser.id, { name: 'Debug Test Firm' });
      addLog(`✅ Firm created: ${testFirm.firm.name} (${testFirm.firm.id})`);

      // Test adding a challenge
      const testChallenge = await apiClient.addChallenge(currentUser.id, {
        propFirmId: testFirm.firm.id,
        brokerName: 'Debug Broker',
        accountSize: 50000,
        startDate: new Date().toISOString().slice(0, 10),
        cost: 299,
        totalPhases: 3,
        strategy: 'Debug Strategy'
      });
      addLog(`✅ Challenge created: ${testChallenge.challenge.id}`);
      
      // Check if it appears in storage
      const state = await apiClient.loadState(currentUser.id);
      const foundChallenge = state.challenges.find(c => c.id === testChallenge.challenge.id);
      if (foundChallenge) {
        addLog('✅ Challenge found in storage after creation');
      } else {
        addLog('❌ Challenge NOT found in storage after creation');
      }

    } catch (error) {
      addLog(`❌ Error during test: ${error}`);
      setLastError(String(error));
    }
  };

  const inspectLocalStorage = () => {
    try {
      const data = localStorage.getItem('propfolio_data');
      if (data) {
        const parsed = JSON.parse(data);
        addLog(`📦 Raw storage keys: ${Object.keys(parsed).join(', ')}`);
        if (currentUser?.id && parsed[currentUser.id]) {
          const userData = parsed[currentUser.id];
          addLog(`👤 User data: ${userData.challenges?.length || 0} challenges, ${userData.firms?.length || 0} firms`);
        } else {
          addLog('❌ No user data found in storage');
        }
      } else {
        addLog('❌ No propfolio_data found in localStorage');
      }
    } catch (error) {
      addLog(`❌ Error reading localStorage: ${error}`);
    }
  };

  // Early return if debug window is disabled
  if (!isEnabled) {
    return null;
  }
  
  if (!isOpen) {
    return (
      <div className="fixed top-4 right-4 z-50">
        <button
          onClick={() => setIsOpen(true)}
          className="bg-red-500/20 hover:bg-red-500/30 border border-red-400/50 px-3 py-2 rounded-lg text-red-200 text-sm"
        >
          <Eye className="w-4 h-4" />
        </button>
      </div>
    );
  }

  return (
    <div className="fixed top-4 right-4 w-96 max-h-[90vh] overflow-auto z-50">
      <NeonCard glow="red" className="p-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-red-300">🐛 Challenge Creation Debug</h3>
          <div className="flex gap-2">
            <button
              onClick={() => setLogs([])}
              className="text-yellow-300 hover:text-yellow-200 text-xs"
              title="Clear logs"
            >
              Clear
            </button>
            <button
              onClick={() => setIsOpen(false)}
              className="text-red-300 hover:text-red-200 transition-colors"
            >
              <EyeOff className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="space-y-4 text-xs">
          {/* Authentication Status */}
          <div>
            <button
              onClick={() => toggleSection('auth')}
              className="flex items-center gap-2 text-blue-300 hover:text-blue-200 transition-colors w-full text-left"
            >
              {expandedSections.auth ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
              <span className="font-semibold">Authentication Status</span>
              {currentUser ? <CheckCircle className="w-3 h-3 text-green-400" /> : <AlertTriangle className="w-3 h-3 text-red-400" />}
            </button>
            
            {expandedSections.auth && (
              <div className="mt-2 pl-5 space-y-1 text-white/80">
                <div>User ID: <span className="text-cyan-300">{currentUser?.id || 'None'}</span></div>
                <div>Email: <span className="text-cyan-300">{currentUser?.email || 'None'}</span></div>
                <div>Name: <span className="text-cyan-300">{currentUser?.name || 'None'}</span></div>
                <div className={`font-bold ${currentUser ? 'text-green-300' : 'text-red-300'}`}>
                  {currentUser ? '✅ User is logged in' : '❌ No user logged in'}
                </div>
              </div>
            )}
          </div>

          {/* Subscription & Limits */}
          <div>
            <button
              onClick={() => toggleSection('limits')}
              className="flex items-center gap-2 text-purple-300 hover:text-purple-200 transition-colors w-full text-left"
            >
              {expandedSections.limits ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
              <span className="font-semibold">Subscription & Limits</span>
              {canAddChallenge(challenges.length) ? <CheckCircle className="w-3 h-3 text-green-400" /> : <AlertTriangle className="w-3 h-3 text-red-400" />}
            </button>
            
            {expandedSections.limits && (
              <div className="mt-2 pl-5 space-y-1 text-white/80">
                <div>Plan: <span className="text-cyan-300">{subscription?.plan || 'None'}</span></div>
                <div>Max Challenges: <span className="text-cyan-300">{limits.maxChallenges === -1 ? 'Unlimited' : limits.maxChallenges}</span></div>
                <div>Current Count: <span className="text-cyan-300">{challenges.length}</span></div>
                <div className={`font-bold ${canAddChallenge(challenges.length) ? 'text-green-300' : 'text-red-300'}`}>
                  {canAddChallenge(challenges.length) ? '✅ Can add challenges' : '❌ At challenge limit'}
                </div>
              </div>
            )}
          </div>

          {/* Storage Inspection */}
          <div>
            <button
              onClick={() => toggleSection('storage')}
              className="flex items-center gap-2 text-green-300 hover:text-green-200 transition-colors w-full text-left"
            >
              {expandedSections.storage ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
              <span className="font-semibold">Storage Status</span>
            </button>
            
            {expandedSections.storage && (
              <div className="mt-2 pl-5 space-y-1 text-white/80">
                <div>Challenges in Props: <span className="text-cyan-300">{challenges.length}</span></div>
                <div>Firms in Props: <span className="text-cyan-300">{firms.length}</span></div>
                <div className="flex items-center gap-2 mt-2">
                  <button
                    onClick={inspectLocalStorage}
                    className="bg-green-500/20 hover:bg-green-500/30 border border-green-400/50 px-2 py-1 rounded text-xs text-green-200"
                  >
                    🔍 Inspect Raw Storage
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Payout Debugging */}
          <div>
            <button
              onClick={() => toggleSection('payouts')}
              className="flex items-center gap-2 text-orange-300 hover:text-orange-200 transition-colors w-full text-left"
            >
              {expandedSections.payouts ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
              <span className="font-semibold">Payout Debugging</span>
              {payoutDebugInfo && <AlertTriangle className="w-3 h-3 text-orange-400" />}
            </button>
            
            {expandedSections.payouts && (
              <div className="mt-2 pl-5 space-y-2 text-white/80">
                {payoutDebugInfo ? (
                  <div className="bg-orange-500/20 border border-orange-400/50 rounded p-2">
                    <div className="text-orange-300 font-semibold text-xs mb-1">Latest Payout Error:</div>
                    <div className="text-xs space-y-1">
                      <div>Type: <span className="text-orange-200">{payoutDebugInfo.type}</span></div>
                      <div>User ID: <span className="text-orange-200">{payoutDebugInfo.userId}</span></div>
                      <div>Looking for Challenge: <span className="text-orange-200">{payoutDebugInfo.challengeId}</span></div>
                      <div>Available Challenges (Current User): <span className="text-orange-200">{payoutDebugInfo.availableChallenges?.length || 0}</span></div>
                      {payoutDebugInfo.availableChallenges?.map((c: any, i: number) => (
                        <div key={i} className="text-xs ml-4 text-orange-100">
                          • {c.brokerName} ({c.id.slice(0, 8)}...)
                        </div>
                      ))}
                      <div className="mt-2">All Challenges Across Users: <span className="text-orange-200">{payoutDebugInfo.allChallengesAcrossUsers?.length || 0}</span></div>
                      {payoutDebugInfo.allChallengesAcrossUsers?.map((c: any, i: number) => (
                        <div key={i} className="text-xs ml-4 text-orange-100">
                          • {c.brokerName} ({c.id.slice(0, 8)}...) - User: {c.userId.slice(0, 8)}...
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="text-white/50 text-xs">No payout errors yet</div>
                )}
                
                <button
                  onClick={() => {
                    if (!confirm('🗑️ This will delete ALL challenges, firms, and data. Are you sure?')) {
                      return;
                    }
                    
                    addLog('🗑️ Clearing all data...');
                    
                    // Clear the main data storage
                    localStorage.removeItem('propfolio_data');
                    
                    // Clear any other related data
                    Object.keys(localStorage).forEach(key => {
                      if (key.startsWith('user_subscription_') || key.startsWith('user_limits_') || key.includes('challenges_') || key.includes('firms_')) {
                        localStorage.removeItem(key);
                      }
                    });
                    
                    addLog('✅ All data cleared');
                    addLog('🔄 Refreshing page in 2 seconds...');
                    
                    setTimeout(() => {
                      window.location.reload();
                    }, 2000);
                  }}
                  className="bg-red-500/20 hover:bg-red-500/30 border border-red-400/50 px-2 py-1 rounded text-xs text-red-200"
                >
                  🗑️ Clear All Data & Start Fresh
                </button>
              </div>
            )}
          </div>

          {/* Error Log */}
          <div>
            <button
              onClick={() => toggleSection('errors')}
              className="flex items-center gap-2 text-red-300 hover:text-red-200 transition-colors w-full text-left"
            >
              {expandedSections.errors ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
              <span className="font-semibold">Error & Activity Log</span>
              {lastError && <AlertTriangle className="w-3 h-3 text-red-400" />}
            </button>
            
            {expandedSections.errors && (
              <div className="mt-2 pl-5">
                {lastError && (
                  <div className="bg-red-500/20 border border-red-400/50 rounded p-2 mb-2">
                    <div className="text-red-300 font-semibold text-xs">Latest Error:</div>
                    <div className="text-red-200 text-xs break-words">{lastError}</div>
                  </div>
                )}
                
                <div className="max-h-32 overflow-y-auto space-y-1">
                  {logs.length > 0 ? (
                    logs.map((log, i) => (
                      <div key={i} className="text-xs text-white/70 font-mono">
                        {log}
                      </div>
                    ))
                  ) : (
                    <div className="text-white/50 text-xs">No activity logged yet</div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Test Actions */}
          <div>
            <button
              onClick={() => toggleSection('actions')}
              className="flex items-center gap-2 text-yellow-300 hover:text-yellow-200 transition-colors w-full text-left"
            >
              {expandedSections.actions ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
              <span className="font-semibold">Test Actions</span>
            </button>
            
            {expandedSections.actions && (
              <div className="mt-2 pl-5 space-y-2">
                <button
                  onClick={testChallengeCreation}
                  className="w-full text-left bg-blue-500/20 hover:bg-blue-500/30 border border-blue-400/50 px-2 py-1 rounded text-xs text-blue-200"
                >
                  🧪 Test Challenge Creation
                </button>
                
                <button
                  onClick={() => {
                    addLog('🔄 Checking forms and UI elements...');
                    
                    // Check forms
                    const forms = document.querySelectorAll('form');
                    addLog(`📋 Found ${forms.length} forms on page`);
                    forms.forEach((form, i) => {
                      addLog(`Form ${i + 1}: ${form.className || 'no class'}`);
                    });
                    
                    // Check modals
                    const modals = document.querySelectorAll('[role="dialog"], .modal, [class*="modal"]');
                    addLog(`🪟 Found ${modals.length} potential modals`);
                    modals.forEach((modal, i) => {
                      const isVisible = getComputedStyle(modal as Element).display !== 'none';
                      addLog(`Modal ${i + 1}: ${modal.className || 'no class'} - ${isVisible ? 'VISIBLE' : 'HIDDEN'}`);
                    });
                    
                    // Check add buttons
                    const addButtons = document.querySelectorAll('button');
                    const addButtonsFiltered = Array.from(addButtons).filter(btn => 
                      btn.textContent?.toLowerCase().includes('add') || 
                      btn.textContent?.toLowerCase().includes('new') ||
                      btn.textContent?.toLowerCase().includes('create')
                    );
                    addLog(`➕ Found ${addButtonsFiltered.length} potential add/create buttons`);
                    addButtonsFiltered.forEach((btn, i) => {
                      addLog(`Button ${i + 1}: "${btn.textContent?.trim()}" - ${btn.className || 'no class'}`);
                    });
                    
                    // Check for challenge-related elements
                    const challengeElements = document.querySelectorAll('[class*="challenge"], [id*="challenge"]');
                    addLog(`🏆 Found ${challengeElements.length} challenge-related elements`);
                  }}
                  className="w-full text-left bg-orange-500/20 hover:bg-orange-500/30 border border-orange-400/50 px-2 py-1 rounded text-xs text-orange-200"
                >
                  🔍 Inspect UI Elements
                </button>
                
                <button
                  onClick={async () => {
                    if (!currentUser?.id) {
                      addLog('❌ No user - cannot test new firm creation flow');
                      return;
                    }
                    
                    addLog('🏗️ Testing new firm creation during challenge creation...');
                    try {
                      // Test creating a challenge with a brand new firm name
                      const newFirmName = `New Firm ${Date.now()}`;
                      
                      const challengeResult = await apiClient.addChallenge(currentUser.id, {
                        propFirmId: '', // Empty - should trigger firm creation
                        propFirmName: newFirmName, // New firm name
                        brokerName: 'Test Broker',
                        accountSize: 25000,
                        startDate: new Date().toISOString().slice(0, 10),
                        cost: 199,
                        totalPhases: 2,
                        strategy: 'Test Strategy'
                      } as any);
                      
                      addLog(`✅ Challenge with new firm created: ${challengeResult.challenge.id}`);
                      addLog(`✅ New firm should be: ${newFirmName}`);
                      
                      // Verify the firm was created
                      const state = await apiClient.loadState(currentUser.id);
                      const newFirm = state.firms.find((f: any) => f.name === newFirmName);
                      if (newFirm) {
                        addLog(`✅ New firm found in storage: ${newFirm.name} (${newFirm.id})`);
                      } else {
                        addLog('❌ New firm NOT found in storage');
                      }
                      
                    } catch (error) {
                      addLog(`❌ Error testing new firm creation: ${error}`);
                      setLastError(String(error));
                    }
                  }}
                  className="w-full text-left bg-green-500/20 hover:bg-green-500/30 border border-green-400/50 px-2 py-1 rounded text-xs text-green-200"
                >
                  🏗️ Test New Firm Creation Flow
                </button>
                
                <button
                  onClick={() => {
                    addLog('🖘️ Testing Add Challenge button click...');
                    
                    // Find and click the Add Challenge button
                    const addButtons = Array.from(document.querySelectorAll('button')).filter(btn => 
                      btn.textContent?.toLowerCase().includes('add challenge') ||
                      btn.textContent?.toLowerCase().includes('new challenge')
                    );
                    
                    if (addButtons.length > 0) {
                      const addBtn = addButtons[0] as HTMLButtonElement;
                      addLog(`✅ Found Add Challenge button: "${addBtn.textContent?.trim()}"`);
                      addLog(`Button disabled: ${addBtn.disabled}`);
                      addLog(`Button classes: ${addBtn.className}`);
                      
                      if (!addBtn.disabled) {
                        addLog('📱 Clicking Add Challenge button...');
                        addBtn.click();
                        
                        // Check for modal/form after click
                        setTimeout(() => {
                          const modals = document.querySelectorAll('[role="dialog"], .modal, [class*="modal"]');
                          const visibleModals = Array.from(modals).filter(modal => 
                            getComputedStyle(modal as Element).display !== 'none'
                          );
                          addLog(`🚀 After click: ${visibleModals.length} visible modals`);
                          
                          const forms = document.querySelectorAll('form');
                          addLog(`🚀 After click: ${forms.length} forms on page`);
                        }, 100);
                      } else {
                        addLog('❌ Add Challenge button is disabled');
                      }
                    } else {
                      addLog('❌ No Add Challenge button found on page');
                    }
                  }}
                  className="w-full text-left bg-purple-500/20 hover:bg-purple-500/30 border border-purple-400/50 px-2 py-1 rounded text-xs text-purple-200"
                >
                  🖘️ Test UI: Click Add Challenge
                </button>
                
                <button
                  onClick={() => {
                    if (!currentUser?.id) {
                      addLog('❌ No user ID to check subscription');
                      return;
                    }
                    
                    addLog('🔍 Checking subscription settings...');
                    
                    // Check localStorage subscription data
                    const subKey = `user_subscription_${currentUser.id}`;
                    const limitsKey = `user_limits_${currentUser.id}`;
                    
                    const subData = localStorage.getItem(subKey);
                    const limitsData = localStorage.getItem(limitsKey);
                    
                    addLog(`📊 Subscription data: ${subData || 'NONE'}`);
                    addLog(`📊 Limits data: ${limitsData || 'NONE'}`);
                    
                    if (subData) {
                      try {
                        const parsed = JSON.parse(subData);
                        addLog(`Plan: ${parsed.plan}, Status: ${parsed.status}`);
                      } catch (e) {
                        addLog('❌ Failed to parse subscription data');
                      }
                    }
                    
                    if (limitsData) {
                      try {
                        const parsed = JSON.parse(limitsData);
                        addLog(`Max challenges: ${parsed.maxChallenges}`);
                        addLog(`Current challenges: ${challenges.length}`);
                        addLog(`Can add more: ${canAddChallenge(challenges.length)}`);
                      } catch (e) {
                        addLog('❌ Failed to parse limits data');
                      }
                    }
                    
                    console.log('🐛 DETAILED SUBSCRIPTION DEBUG:');
                    console.log('Subscription:', subscription);
                    console.log('Limits:', limits);
                    console.log('Raw subscription storage:', subData);
                    console.log('Raw limits storage:', limitsData);
                  }}
                  className="w-full text-left bg-yellow-500/20 hover:bg-yellow-500/30 border border-yellow-400/50 px-2 py-1 rounded text-xs text-yellow-200"
                >
                  🔍 Check Subscription Status
                </button>
                
                <button
                  onClick={() => {
                    if (!currentUser?.id) {
                      addLog('❌ No user ID to reset subscription');
                      return;
                    }
                    
                    addLog('🔄 Resetting subscription to free plan...');
                    
                    // Clear subscription data
                    const subKey = `user_subscription_${currentUser.id}`;
                    const limitsKey = `user_limits_${currentUser.id}`;
                    
                    localStorage.removeItem(subKey);
                    localStorage.removeItem(limitsKey);
                    
                    addLog('✅ Subscription data cleared');
                    addLog('🔄 Page refresh needed to apply changes');
                    
                    // Suggest refresh
                    setTimeout(() => {
                      if (confirm('Subscription reset! Refresh page to apply changes?')) {
                        window.location.reload();
                      }
                    }, 1000);
                  }}
                  className="w-full text-left bg-red-500/20 hover:bg-red-500/30 border border-red-400/50 px-2 py-1 rounded text-xs text-red-200"
                >
                  🔄 Reset to Free Plan
                </button>
                
                <button
                  onClick={() => {
                    addLog('🛡️ Testing FeatureGate logic...');
                    
                    const challengeCount = challenges.length;
                    const subscriptionCanAdd = canAddChallenge(challengeCount);
                    const featureAccessCanAdd = canCreateMoreChallenges(challengeCount);
                    const reachedLimit = hasReachedLimit('maxChallenges', challengeCount);
                    
                    addLog(`Current tier: ${tier}`);
                    addLog(`Is Admin: ${isAdmin}`);
                    addLog(`Challenge count: ${challengeCount}`);
                    addLog(`Subscription canAddChallenge: ${subscriptionCanAdd}`);
                    addLog(`FeatureAccess canCreateMore: ${featureAccessCanAdd}`);
                    addLog(`FeatureAccess hasReachedLimit: ${reachedLimit}`);
                    
                    if (subscriptionCanAdd !== featureAccessCanAdd) {
                      addLog('❗ MISMATCH: Subscription and FeatureAccess disagree!');
                    }
                    
                    // Test the actual FeatureGate logic
                    console.log('🐛 FEATURE GATE DEBUG:');
                    console.log('Tier:', tier);
                    console.log('Challenge Count:', challengeCount);
                    console.log('Subscription canAddChallenge:', subscriptionCanAdd);
                    console.log('FeatureAccess canCreateMoreChallenges:', featureAccessCanAdd);
                    console.log('FeatureAccess hasReachedLimit:', reachedLimit);
                  }}
                  className="w-full text-left bg-orange-500/20 hover:bg-orange-500/30 border border-orange-400/50 px-2 py-1 rounded text-xs text-orange-200"
                >
                  🛡️ Test FeatureGate Logic
                </button>
                
                <button
                  onClick={() => {
                    console.log('🐛 CHALLENGE CREATION DEBUG:');
                    console.log('Current User:', currentUser);
                    console.log('Can Add Challenge:', canAddChallenge(challenges.length));
                    console.log('Subscription:', subscription);
                    console.log('Limits:', limits);
                    console.log('Current Challenges:', challenges);
                    console.log('Current Firms:', firms);
                    addLog('📝 Full debug info logged to console');
                  }}
                  className="w-full text-left bg-gray-500/20 hover:bg-gray-500/30 border border-gray-400/50 px-2 py-1 rounded text-xs text-gray-200"
                >
                  📝 Log Full Debug to Console
                </button>
              </div>
            )}
          </div>
        </div>
      </NeonCard>
    </div>
  );
};