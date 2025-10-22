import React from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useSettings } from '../contexts/SettingsContext';
import { DashboardStats } from './DashboardStats';
import SettingsPanel from './SettingsPanel';
import { PropFirmPicker } from './PropFirmPicker';
import { ChallengeForm } from './ChallengeForm';
import { ChallengeList } from './ChallengeList';
import { Calendar } from './Calendar';
import { Statistics } from './Statistics';
import { PayoutManager } from './PayoutManager';
import { CustomPnLChart } from './CustomPnLChart';
import { AdditionalCharts } from './AdditionalCharts';
import { AppState, Challenge } from '../types';
import { ConfirmDialog } from './ui/ConfirmDialog';
import { AddChallengeModal } from './AddChallengeModal';
// Switch to serverless API client
import { apiClient } from '../utils/apiClient';
import { loadCalendar, saveCalendar, createAccount as createCalAccount, getAccountData as getCalAccountData, addChallengePhase, archiveFailedChallenge, getChallengePhasesByChallenge } from '../utils/calendarStorage';
import { ChallengeCards } from './ChallengeCards';
import { BulkActions } from './BulkActions';
import { ShareStatsModal } from './ShareStatsModal';
import { DebugWindow } from './DebugWindow';
import { RulesManagementModal } from './RulesManagementModal';
import { RulesCompliancePrompt } from './RulesCompliancePrompt';
import { ListChecks } from 'lucide-react';

type ViewMode = 'prop' | 'calendar';

const Dashboard: React.FC = () => {
  const { currentUser } = useAuth();
  const { buildingMode } = useSettings();
  
  const [state, setState] = React.useState<AppState>({
    firms: [],
    challenges: [],
    selectedFirmId: null,
  });
  const [loading, setLoading] = React.useState(true);
  
  const [view, setView] = React.useState<ViewMode>('prop');
  const [editing, setEditing] = React.useState<Challenge | null>(null);
  const [deleteConfirm, setDeleteConfirm] = React.useState<{ id: string; name: string } | null>(null);
  const [loadingDelete, setLoadingDelete] = React.useState(false);
  const [isAddChallengeModalOpen, setIsAddChallengeModalOpen] = React.useState(false);
  const [selectedChallengeId, setSelectedChallengeId] = React.useState<string | null>(null);
  const [selectedPhase, setSelectedPhase] = React.useState<'phase1' | 'phase2' | 'phase3' | 'live'>('phase1');
  const [isCreatingPhaseCalendar, setIsCreatingPhaseCalendar] = React.useState(false);
  const [isShareStatsModalOpen, setIsShareStatsModalOpen] = React.useState(false);
  const [isRulesModalOpen, setIsRulesModalOpen] = React.useState(false);
  const [isRulesComplianceOpen, setIsRulesComplianceOpen] = React.useState(false);
  const [selectedComplianceDate, setSelectedComplianceDate] = React.useState<string | null>(null);
  
  // Bulk actions state for build mode
  const [selectedChallengeIds, setSelectedChallengeIds] = React.useState<Set<string>>(new Set());
  

  // Load data from database when user changes
  React.useEffect(() => {
    const loadData = async () => {
      if (!currentUser?.id) {
        setLoading(false);
        return;
      }
      
      try {
        console.log('📁 Loading data via API for user:', currentUser.id);
        const loadedState = await apiClient.loadState(currentUser.id);
        console.log('✅ Data loaded successfully:', loadedState);
        setState(loadedState);
      } catch (error) {
        console.error('❌ Error loading data via API:', error);
        const err = error as any;
        alert(`Failed to load data: ${err?.message ?? 'Unknown error'}\n\nCheck the console for more details.`);
      } finally {
        setLoading(false);
      }
    };
    
    loadData();
  }, [currentUser?.id, currentUser?.email, currentUser?.name]);
  
  // Helper function to refresh state after database operations
  const refreshState = async () => {
    if (!currentUser?.id) return;
    try {
      const newState = await apiClient.loadState(currentUser.id);
      setState(newState);
    } catch (error) {
      console.error('Error refreshing state:', error);
    }
  };

  const visibleChallenges = React.useMemo(() => state.selectedFirmId ? state.challenges.filter(c => c.propFirmId === state.selectedFirmId) : state.challenges, [state]);

  // Rule calendar state and actions
  const [calendar, setCalendar] = React.useState(() => {
    console.log('Loading calendar state...');
    const loadedCalendar = loadCalendar();
    console.log('Calendar state loaded:', loadedCalendar);
    return loadedCalendar;
  });
  React.useEffect(() => { saveCalendar(calendar); }, [calendar]);

  
  // Note: ActiveChallenges functionality replaced with ChallengeCards
  
  // Helper function to get challenge number (oldest = #1)
  const getChallengeNumber = React.useCallback((challenge: Challenge): number => {
    const sortedChallenges = [...state.challenges].sort((a, b) => {
      const dateCompare = new Date(a.startDate).getTime() - new Date(b.startDate).getTime();
      if (dateCompare !== 0) return dateCompare;
      // If same startDate, sort by createdAt (oldest first for numbering)
      return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    });
    const challengeNumber = sortedChallenges.findIndex(c => c.id === challenge.id) + 1;
    return challengeNumber;
  }, [state.challenges]);

  // Get selected challenge data
  const selectedChallenge = React.useMemo(() => {
    if (!selectedChallengeId) return null;
    return state.challenges.find(c => c.id === selectedChallengeId) || null;
  }, [selectedChallengeId, state.challenges]);
  
  // Get calendar data for selected challenge and phase
  const selectedChallengeCalendarData = React.useMemo(() => {
    try {
      if (!selectedChallengeId || !selectedChallenge) return { entries: [], challengePhases: [], phaseAccountId: null };
      
      // Find the specific phase account
      const firmName = state.firms.find(f => f.id === selectedChallenge.propFirmId)?.name || 'Unknown Firm';
      const challengeNumber = getChallengeNumber(selectedChallenge);
      
      let phaseName: string;
      switch (selectedPhase) {
        case 'phase1': phaseName = 'Phase 1'; break;
        case 'phase2': phaseName = 'Phase 2'; break;
        case 'phase3': phaseName = 'Phase 3'; break;
        case 'live': phaseName = 'Live Account'; break;
        default: phaseName = 'Phase 1'; break;
      }
      
      const phaseAccountName = `${firmName} - Challenge #${challengeNumber} - ${phaseName}`;
      const phaseAccount = calendar.accounts.find(a => a.name === phaseAccountName);
      
      if (!phaseAccount) {
        return { entries: [], challengePhases: [], phaseAccountId: null };
      }
      
      const accountData = getCalAccountData(phaseAccount.id, calendar.accountData);
      const challengePhases = getChallengePhasesByChallenge(accountData, selectedChallengeId);
      return { entries: accountData.entries, challengePhases, phaseAccountId: phaseAccount.id };
    } catch (error) {
      console.error('Error in selectedChallengeCalendarData:', error);
      return { entries: [], challengePhases: [], phaseAccountId: null };
    }
  }, [selectedChallengeId, selectedChallenge, selectedPhase, calendar, state.firms]);

  // Account management now handled automatically by challenge selection
  
  // Handle calendar day updates for the selected phase
  const handleDayUpdate = (date: string, followedRules: boolean | null) => {
    try {
      // If current phase has rules, open compliance prompt instead
      const currentPhaseRules = getCurrentPhaseRules();
      if (currentPhaseRules.length > 0) {
        setSelectedComplianceDate(date);
        setIsRulesComplianceOpen(true);
        return;
      }
      
      const phaseAccountId = selectedChallengeCalendarData.phaseAccountId;
      if (!phaseAccountId) {
        console.log('No phase account ID available for day update');
        return;
      }
      
      setCalendar(prev => {
        const accountData = prev.accountData.find(d => d.accountId === phaseAccountId);
        if (!accountData) {
          console.log('Account data not found for phase account:', phaseAccountId);
          return prev;
        }
        
        const existingEntryIndex = accountData.entries.findIndex(e => e.date === date);
        
        let updatedEntries;
        if (existingEntryIndex >= 0) {
          // Update existing entry
          updatedEntries = accountData.entries.map((entry, i) => 
            i === existingEntryIndex 
              ? { ...entry, followedRules }
              : entry
          );
        } else {
          // Add new entry
          updatedEntries = [...accountData.entries, { date, followedRules }];
        }
        
        return {
          ...prev,
          accountData: prev.accountData.map(d => 
            d.accountId === phaseAccountId
              ? { ...d, entries: updatedEntries }
              : d
          )
        };
      });
    } catch (error) {
      console.error('Error updating calendar day:', error);
    }
  };
  
  // Get rules for current phase
  const getCurrentPhaseRules = React.useCallback(() => {
    if (!selectedChallenge) return [];
    
    // Check new phase-specific rules first
    if (selectedChallenge.phaseRules) {
      return selectedChallenge.phaseRules[selectedPhase] || [];
    }
    
    // Fall back to legacy rules (for backwards compatibility)
    return selectedChallenge.rules || [];
  }, [selectedChallenge, selectedPhase]);
  
  // Handle saving rules to a challenge phase
  const handleSaveRules = async (rules: any[]) => {
    if (!selectedChallenge) return;
    
    try {
      // Create updated phaseRules object
      const updatedPhaseRules = {
        ...selectedChallenge.phaseRules,
        [selectedPhase]: rules
      };
      
      // Save complete phaseRules to database
      await apiClient.updatePhaseRules(selectedChallenge.id, updatedPhaseRules);
      
      // Update local state
      setState(prevState => ({
        ...prevState,
        challenges: prevState.challenges.map(challenge => 
          challenge.id === selectedChallenge.id 
            ? { 
                ...challenge, 
                phaseRules: updatedPhaseRules
              }
            : challenge
        )
      }));
    } catch (error) {
      console.error('Failed to save rules:', error);
      throw error;
    }
  };
  
  // Handle saving rule compliance for a specific day
  const handleSaveRuleCompliance = (date: string, ruleCompliance: Record<string, boolean>) => {
    const phaseAccountId = selectedChallengeCalendarData.phaseAccountId;
    if (!phaseAccountId) return;
    
    setCalendar(prev => {
      const accountData = prev.accountData.find(d => d.accountId === phaseAccountId);
      if (!accountData) return prev;
      
      // Determine if all rules were followed
      const allFollowed = Object.values(ruleCompliance).every(v => v === true);
      const anyBroken = Object.values(ruleCompliance).some(v => v === false);
      const followedRules = allFollowed ? true : anyBroken ? false : null;
      
      const existingEntryIndex = accountData.entries.findIndex(e => e.date === date);
      
      let updatedEntries;
      if (existingEntryIndex >= 0) {
        // Update existing entry
        updatedEntries = accountData.entries.map((entry, i) => 
          i === existingEntryIndex 
            ? { ...entry, ruleCompliance, followedRules }
            : entry
        );
      } else {
        // Add new entry
        updatedEntries = [...accountData.entries, { date, followedRules, ruleCompliance }];
      }
      
      return {
        ...prev,
        accountData: prev.accountData.map(d => 
          d.accountId === phaseAccountId
            ? { ...d, entries: updatedEntries }
            : d
        )
      };
    });
  };
  
  // Account deletion now handled through challenge management
  
  // Archive functionality integrated into challenge status management
  
    // Handle challenge card click - select challenge and start with phase 1
    const handleChallengeClick = (challengeId: string) => {
      const challenge = state.challenges.find(c => c.id === challengeId);
      const isArchived = challenge?.status === 'failed';
      
      setSelectedChallengeId(challengeId);
      setSelectedPhase('phase1'); // Always start with phase 1 when opening a challenge
      
      // Auto-scroll to calendar section after selection (small delay for state update)
      setTimeout(() => {
        const calendarSection = document.querySelector('[data-calendar-section]');
        if (calendarSection) {
          calendarSection.scrollIntoView({ 
            behavior: 'smooth', 
            block: 'start'
          });
          
          // Add temporary highlight effect for archived challenges
          if (isArchived) {
            calendarSection.classList.add('highlight-archived');
            setTimeout(() => {
              calendarSection.classList.remove('highlight-archived');
            }, 2000);
          }
        }
      }, 100);
    };
  
  // Bulk selection handlers
  const handleToggleSelection = (challengeId: string) => {
    setSelectedChallengeIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(challengeId)) {
        newSet.delete(challengeId);
      } else {
        newSet.add(challengeId);
      }
      return newSet;
    });
  };
  
  const handleSelectAll = () => {
    const allChallengeIds = state.challenges.map(c => c.id);
    setSelectedChallengeIds(new Set(allChallengeIds));
  };
  
  const handleDeselectAll = () => {
    setSelectedChallengeIds(new Set());
  };
  
  const handleBulkStatusChange = async (challengeIds: string[], newStatus: 'active' | 'passed' | 'failed') => {
    if (!currentUser?.id) return;
    
    try {
      // Update database
      await apiClient.bulkUpdateStatus(challengeIds, newStatus);
      
      // Update local state
      setState(prev => ({
        ...prev,
        challenges: prev.challenges.map(challenge => 
          challengeIds.includes(challenge.id)
            ? { ...challenge, status: newStatus }
            : challenge
        )
      }));
      
      // Clear selection
      setSelectedChallengeIds(new Set());
      
      console.log(`Successfully updated ${challengeIds.length} challenges to status: ${newStatus}`);
    } catch (error) {
      console.error('Error updating challenge statuses:', error);
      alert('Failed to update challenge statuses. Please try again.');
    }
  };
  
  // Automatic calendar integration for new challenges
  const handleAutomaticNewChallengeCalendar = async (challenge: Challenge) => {
    try {
      const firmName = state.firms.find(f => f.id === challenge.propFirmId)?.name || 'Unknown Firm';
      const challengeNumber = getChallengeNumber(challenge);
      const accountName = `${firmName} - Challenge #${challengeNumber} - Phase 1`;
      
      // Check if an account already exists for this challenge phase
      const existingAccount = calendar.accounts.find(a => a.name === accountName);
      
      if (!existingAccount) {
        // Create a new account for Phase 1
        const newAccount = createCalAccount(accountName);
        
        // Get current account data (will be fresh for new accounts)
        const accountData = getCalAccountData(newAccount.id, []);
        
        // Add the Phase 1 challenge phase
        addChallengePhase(accountData, {
          challengeId: challenge.id,
          title: 'Phase 1',
          description: 'Initial challenge phase',
          phase: 'phase1',
          firmName: firmName,
          accountSize: challenge.accountSize,
          challengeNumber: challengeNumber
        });
        
        // Update calendar state
        setCalendar(prev => ({
          ...prev,
          accounts: [newAccount, ...prev.accounts],
          accountData: [...prev.accountData, accountData]
        }));
      }
    } catch (error) {
      console.error('Error creating Phase 1 challenge calendar:', error);
    }
  };
  
  // Handle phase switching with automatic calendar creation
  const handlePhaseSwitch = async (phase: 'phase1' | 'phase2' | 'phase3' | 'live') => {
    if (!selectedChallenge) return;
    
    setIsCreatingPhaseCalendar(true);
    
    try {
      const firmName = state.firms.find(f => f.id === selectedChallenge.propFirmId)?.name || 'Unknown Firm';
      const challengeNumber = getChallengeNumber(selectedChallenge);
      
      // Determine phase title and type
      let phaseTitle: string;
      let phaseDescription: string;
      
      switch (phase) {
        case 'phase1':
          phaseTitle = 'Phase 1';
          phaseDescription = 'Initial challenge phase';
          break;
        case 'phase2':
          phaseTitle = 'Phase 2';
          phaseDescription = 'Phase 2 trading period';
          break;
        case 'phase3':
          phaseTitle = 'Phase 3';
          phaseDescription = 'Phase 3 trading period';
          break;
        case 'live':
          phaseTitle = 'Live Account';
          phaseDescription = 'Live trading account';
          break;
      }
      
      const accountName = `${firmName} - Challenge #${challengeNumber} - ${phaseTitle}`;
      
      // Check if an account already exists for this exact challenge phase
      const existingAccount = calendar.accounts.find(a => a.name === accountName);
      
      if (!existingAccount) {
        // Create a new account specifically for this phase
        const newAccount = createCalAccount(accountName);
        
        // Get current account data (will be fresh for new accounts)
        const accountData = getCalAccountData(newAccount.id, []);
        
        // Add the new challenge phase
        addChallengePhase(accountData, {
          challengeId: selectedChallenge.id,
          title: phaseTitle,
          description: phaseDescription,
          phase: phase,
          firmName: firmName,
          accountSize: selectedChallenge.accountSize,
          challengeNumber: challengeNumber
        });
        
        // Update calendar state
        setCalendar(prev => ({
          ...prev,
          accounts: [newAccount, ...prev.accounts],
          accountData: [...prev.accountData, accountData]
        }));
        
        console.log(`Automatically created calendar for ${phaseTitle}`);
      }
      
      // Set the selected phase
      setSelectedPhase(phase);
      
    } catch (error) {
      console.error(`Error creating calendar for ${phase}:`, error);
    } finally {
      setIsCreatingPhaseCalendar(false);
    }
  };
  
  // Automatic calendar integration for phase completions
  const handleAutomaticCalendarIntegration = async (challenge: Challenge, completedPhase: 'phase1' | 'phase2' | 'phase3') => {
    try {
      const firmName = state.firms.find(f => f.id === challenge.propFirmId)?.name || 'Unknown Firm';
      const challengeNumber = getChallengeNumber(challenge);
      
      // Determine which phase to create calendar for
      let phaseTitle: string;
      let phaseDescription: string;
      let phaseType: 'phase1' | 'phase2' | 'phase3' | 'live';
      
      if (completedPhase === 'phase1' && (challenge.totalPhases || 3) > 1) {
        phaseTitle = 'Phase 2';
        phaseDescription = 'Phase 2 trading period';
        phaseType = 'phase2';
      } else if (completedPhase === 'phase2' && (challenge.totalPhases || 3) > 2) {
        phaseTitle = 'Phase 3';
        phaseDescription = 'Phase 3 trading period';
        phaseType = 'phase3';
      } else if (completedPhase === 'phase3') {
        phaseTitle = 'Live Account';
        phaseDescription = 'Live trading account';
        phaseType = 'live';
      } else {
        return; // No next phase to create
      }
      
      const accountName = `${firmName} - Challenge #${challengeNumber} - ${phaseTitle}`;
      
      // Check if an account already exists for this exact challenge phase
      const existingAccount = calendar.accounts.find(a => a.name === accountName);
      
      if (!existingAccount) {
        // Create a new account specifically for this phase
        const newAccount = createCalAccount(accountName);
        
        // Get current account data (will be fresh for new accounts)
        const accountData = getCalAccountData(newAccount.id, []);
        
        // Add the new challenge phase
        addChallengePhase(accountData, {
          challengeId: challenge.id,
          title: phaseTitle,
          description: phaseDescription,
          phase: phaseType,
          firmName: firmName,
          accountSize: challenge.accountSize,
          challengeNumber: challengeNumber
        });
        
        // Update calendar state
        setCalendar(prev => ({
          ...prev,
          accounts: [newAccount, ...prev.accounts],
          accountData: [...prev.accountData, accountData]
        }));
        
        console.log(`Automatically created calendar for ${phaseTitle}`);
      }
    } catch (error) {
      console.error('Error in automatic calendar integration:', error);
    }
  };



  const handleDeleteConfirm = async () => {
    if (!deleteConfirm) return;
    
    setLoadingDelete(true);
    try {
      // Simulate network delay
      await new Promise(resolve => setTimeout(resolve, 600));
      await apiClient.removeChallenge(deleteConfirm.id);
      await refreshState();
      setEditing(null); // Close edit modal after deletion
    } catch (error) {
      console.error('Delete error:', error);
    } finally {
      setLoadingDelete(false);
      setDeleteConfirm(null);
    }
  };


  if (loading) {
    return (
      <div className="min-h-screen bg-[#020408] text-white flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-cyan-400 mx-auto mb-4"></div>
          <p className="text-white/70">Loading your trading data...</p>
        </div>
      </div>
    );
  }
  
  return (
    <>
      <style>{`
        .highlight-archived {
          animation: highlightPulse 2s ease-in-out;
          border-radius: 16px;
        }
        
        @keyframes highlightPulse {
          0%, 100% {
            box-shadow: 0 0 0 0 rgba(239, 68, 68, 0);
            background: transparent;
          }
          50% {
            box-shadow: 0 0 30px 5px rgba(239, 68, 68, 0.3);
            background: rgba(239, 68, 68, 0.05);
          }
        }
      `}</style>
      <div className="min-h-screen bg-[#020408] text-white">
      <div className="max-w-6xl mx-auto px-4 py-8">
        <header className="mb-6 text-center relative">
          {/* Settings Panel */}
          <div className="absolute top-0 right-0">
            <SettingsPanel />
          </div>

          <div className="flex items-center justify-center gap-3 mb-3">
            <button onClick={() => setView('prop')} className={`px-4 py-2 rounded-md border ${view==='prop' ? 'bg-white/10 border-white/30' : 'border-white/10'}`}>Prop Firm Dashboard</button>
            <button onClick={() => setView('calendar')} className={`px-4 py-2 rounded-md border ${view==='calendar' ? 'bg-white/10 border-white/30' : 'border-white/10'}`}>Rule Calendar</button>
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight neon-title">{view==='prop' ? 'Propfolio' : 'Rule Calendar'}</h1>
          <p className="text-white/70 mt-2">{view==='prop' ? 'Track Challenges, Trading Rules, and ROI' : 'Track your challenge phases and trading activity'}</p>
        </header>

        <div className="space-y-6">
          {view === 'prop' ? (
            <>
              <PropFirmPicker
                firms={state.firms}
                selectedId={state.selectedFirmId}
                currentChallengeCount={state.challenges.length}
                onSelect={async (id) => {
                  if (!currentUser?.id) return;
                  
                  // Update UI immediately
                  setState(prevState => ({
                    ...prevState,
                    selectedFirmId: id
                  }));
                  
                  // Update database in background
                  apiClient.setSelectedFirm(currentUser.id, id)
                    .catch(error => {
                      console.error('Failed to set selected firm:', error);
                      // Could revert on error if needed
                    });
                }}
                onAddChallenge={() => setIsAddChallengeModalOpen(true)}
                onShareStats={() => setIsShareStatsModalOpen(true)}
                buildingMode={buildingMode}
              />


              <DashboardStats challenges={visibleChallenges} />

              <CustomPnLChart challenges={visibleChallenges} />

              <ChallengeList
                challenges={visibleChallenges}
                firms={state.firms}
                onEdit={setEditing}
                onTogglePhase={(id, phase) => {
                  // This is now handled inside ChallengeList, but keep for backwards compatibility
                }}
                onChallengeUpdate={(updatedChallenge) => {
                  setState(prevState => ({
                    ...prevState,
                    challenges: prevState.challenges.map(challenge => 
                      challenge.id === updatedChallenge.id ? updatedChallenge : challenge
                    )
                  }));
                }}
                calendar={calendar}
                setCalendar={setCalendar}
                buildingMode={buildingMode}
                onAutomaticCalendarIntegration={handleAutomaticCalendarIntegration}
              />

              <AdditionalCharts challenges={visibleChallenges} firms={state.firms} />
            </>
          ) : (
            <>
              <BulkActions 
                challenges={state.challenges}
                selectedChallengeIds={selectedChallengeIds}
                onSelectAll={handleSelectAll}
                onDeselectAll={handleDeselectAll}
                onBulkStatusChange={handleBulkStatusChange}
                buildingMode={buildingMode}
              />
              
              <ChallengeCards 
                challenges={state.challenges}
                firms={state.firms}
                onChallengeClick={handleChallengeClick}
                buildingMode={buildingMode}
                selectedChallengeIds={selectedChallengeIds}
                onToggleSelection={handleToggleSelection}
              />
              
              {selectedChallenge && (
                <>
                  <div className="mt-8 mb-4" data-calendar-section>
                    <div className="flex items-center justify-between">
                      <h3 className={`text-xl font-bold text-transparent bg-clip-text ${
                        selectedChallenge?.status === 'failed' 
                          ? 'bg-gradient-to-r from-red-300 to-red-400'
                          : 'bg-gradient-to-r from-purple-300 to-cyan-300'
                      }`}>
                        {selectedChallenge ? (
                          <>
                            {state.firms.find(f => f.id === selectedChallenge.propFirmId)?.name || 'Unknown'} - Challenge #{getChallengeNumber(selectedChallenge)}
                            {selectedChallenge.status === 'failed' && (
                              <span className="ml-2 text-sm text-red-400 font-normal">(Archived)</span>
                            )}
                          </>
                        ) : 'Rule Calendar'}
                      </h3>
                      <button 
                        onClick={() => {
                          setSelectedChallengeId(null);
                          setSelectedPhase('phase1');
                        }}
                        className="text-sm text-white/60 hover:text-white/80 transition-colors"
                      >
                        ← Back to Challenges
                      </button>
                    </div>
                  </div>
                  
                  {/* Phase Selector */}
                  <div className="mb-6">
                    <div className="flex items-center justify-center gap-2">
                      {/* Phase 1 */}
                      <button
                        onClick={() => handlePhaseSwitch('phase1')}
                        disabled={isCreatingPhaseCalendar}
                        className={`px-4 py-2 rounded-lg border transition-all duration-300 ${
                          selectedPhase === 'phase1'
                            ? 'bg-gradient-to-r from-cyan-500/20 to-purple-500/20 border-cyan-400/50 text-cyan-200'
                            : 'bg-white/5 border-white/20 text-white/70 hover:bg-white/10 hover:border-white/30'
                        } ${isCreatingPhaseCalendar ? 'opacity-50 cursor-not-allowed' : ''}`}
                      >
                        {isCreatingPhaseCalendar && selectedPhase !== 'phase1' ? (
                          <span className="animate-spin mr-2">⏳</span>
                        ) : null}
                        Phase 1
                        {selectedChallenge?.phases?.phase1?.completed && (
                          <span className="ml-2 text-emerald-400">✓</span>
                        )}
                      </button>
                      
                      {/* Phase 2 */}
                      {(selectedChallenge?.totalPhases || 1) > 1 && (
                        <button
                          onClick={() => handlePhaseSwitch('phase2')}
                          disabled={isCreatingPhaseCalendar}
                          className={`px-4 py-2 rounded-lg border transition-all duration-300 ${
                            selectedPhase === 'phase2'
                              ? 'bg-gradient-to-r from-cyan-500/20 to-purple-500/20 border-cyan-400/50 text-cyan-200'
                              : 'bg-white/5 border-white/20 text-white/70 hover:bg-white/10 hover:border-white/30'
                          } ${isCreatingPhaseCalendar ? 'opacity-50 cursor-not-allowed' : ''}`}
                        >
                          {isCreatingPhaseCalendar && selectedPhase !== 'phase2' ? (
                            <span className="animate-spin mr-2">⏳</span>
                          ) : null}
                          Phase 2
                          {selectedChallenge?.phases?.phase2?.completed && (
                            <span className="ml-2 text-emerald-400">✓</span>
                          )}
                        </button>
                      )}
                      
                      {/* Phase 3 */}
                      {(selectedChallenge?.totalPhases || 1) > 2 && (
                        <button
                          onClick={() => handlePhaseSwitch('phase3')}
                          disabled={isCreatingPhaseCalendar}
                          className={`px-4 py-2 rounded-lg border transition-all duration-300 ${
                            selectedPhase === 'phase3'
                              ? 'bg-gradient-to-r from-cyan-500/20 to-purple-500/20 border-cyan-400/50 text-cyan-200'
                              : 'bg-white/5 border-white/20 text-white/70 hover:bg-white/10 hover:border-white/30'
                          } ${isCreatingPhaseCalendar ? 'opacity-50 cursor-not-allowed' : ''}`}
                        >
                          {isCreatingPhaseCalendar && selectedPhase !== 'phase3' ? (
                            <span className="animate-spin mr-2">⏳</span>
                          ) : null}
                          Phase 3
                          {selectedChallenge?.phases?.phase3?.completed && (
                            <span className="ml-2 text-emerald-400">✓</span>
                          )}
                        </button>
                      )}
                      
                      {/* Live Account */}
                      {(selectedChallenge?.phases?.phase1?.completed && (selectedChallenge?.totalPhases || 1) === 1) ||
                       (selectedChallenge?.phases?.phase2?.completed && (selectedChallenge?.totalPhases || 1) === 2) ||
                       (selectedChallenge?.phases?.phase3?.completed && (selectedChallenge?.totalPhases || 1) === 3) ? (
                        <button
                          onClick={() => handlePhaseSwitch('live')}
                          disabled={isCreatingPhaseCalendar}
                          className={`px-4 py-2 rounded-lg border transition-all duration-300 ${
                            selectedPhase === 'live'
                              ? 'bg-gradient-to-r from-emerald-500/20 to-lime-500/20 border-emerald-400/50 text-emerald-200'
                              : 'bg-white/5 border-white/20 text-white/70 hover:bg-white/10 hover:border-white/30'
                          } ${isCreatingPhaseCalendar ? 'opacity-50 cursor-not-allowed' : ''}`}
                        >
                          {isCreatingPhaseCalendar && selectedPhase !== 'live' ? (
                            <span className="animate-spin mr-2">⏳</span>
                          ) : null}
                          Live Account
                          <span className="ml-2 text-emerald-400">🚀</span>
                        </button>
                      ) : null}
                    </div>
                  </div>
                  {selectedChallengeCalendarData.phaseAccountId ? (
                    <>
                      {/* Manage Rules Button */}
                      <div className="mb-4 flex justify-end">
                        <button
                          onClick={() => setIsRulesModalOpen(true)}
                          className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-cyan-500/20 to-purple-500/20 hover:from-cyan-500/30 hover:to-purple-500/30 border border-cyan-400/50 rounded-lg text-cyan-200 font-semibold transition-all duration-200"
                        >
                          <ListChecks className="w-5 h-5" />
                          Manage Trading Rules
                        </button>
                      </div>
                      
                      {/* Display Current Rules */}
                      {(() => {
                        const currentRules = getCurrentPhaseRules();
                        const phaseLabel = selectedPhase === 'phase1' ? 'Phase 1' : selectedPhase === 'phase2' ? 'Phase 2' : selectedPhase === 'phase3' ? 'Phase 3' : 'Live Account';
                        return currentRules.length > 0 && (
                          <div className="mb-6 p-4 bg-gradient-to-br from-gray-900/60 to-gray-800/40 backdrop-blur-sm rounded-xl border border-white/10">
                            <h3 className="text-lg font-bold text-cyan-300 mb-3 flex items-center gap-2">
                              <ListChecks className="w-5 h-5" />
                              {phaseLabel} Trading Rules
                            </h3>
                            <div className="space-y-2">
                              {currentRules.map((rule, index) => (
                                <div key={rule.id} className="flex items-center gap-3 text-white/80">
                                  <span className="flex items-center justify-center w-6 h-6 rounded-full bg-cyan-500/20 border border-cyan-400/40 text-xs font-bold text-cyan-200">
                                    {index + 1}
                                  </span>
                                  <span>{rule.text}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        );
                      })()}
                      
                      <Calendar 
                        entries={selectedChallengeCalendarData.entries} 
                        onDayUpdate={selectedChallenge?.status !== 'failed' ? handleDayUpdate : undefined}
                        isArchived={selectedChallenge?.status === 'failed'}
                      />
                      <Statistics
                        entries={selectedChallengeCalendarData.entries} 
                        accountName={`${state.firms.find(f => f.id === selectedChallenge.propFirmId)?.name || 'Unknown'} - Challenge #${getChallengeNumber(selectedChallenge)} - ${selectedPhase === 'phase1' ? 'Phase 1' : selectedPhase === 'phase2' ? 'Phase 2' : selectedPhase === 'phase3' ? 'Phase 3' : 'Live Account'}`}
                        isArchived={selectedChallenge?.status === 'failed'}
                      />
                    </>
                  ) : (
                    <div className="text-center py-12">
                      <div className="text-white/60 mb-4">
                        <p className="text-lg mb-2">No calendar data for {selectedPhase === 'phase1' ? 'Phase 1' : selectedPhase === 'phase2' ? 'Phase 2' : selectedPhase === 'phase3' ? 'Phase 3' : 'Live Account'}</p>
                        <p className="text-sm mb-6">
                          {selectedPhase === 'phase1' 
                            ? 'The Phase 1 calendar should have been created automatically.'
                            : selectedPhase === 'phase2'
                            ? 'Complete Phase 1 to unlock Phase 2 calendar.'
                            : selectedPhase === 'phase3'
                            ? 'Complete Phase 2 to unlock Phase 3 calendar.'
                            : 'Complete all phases to unlock Live Account calendar.'}
                        </p>
                        {selectedPhase === 'phase1' && selectedChallenge && (
                          <button
                            onClick={() => handleAutomaticNewChallengeCalendar(selectedChallenge)}
                            className="px-6 py-3 rounded-lg bg-gradient-to-r from-cyan-500/20 to-purple-500/20 hover:from-cyan-500/30 hover:to-purple-500/30 border border-cyan-400/50 hover:border-cyan-400/70 text-cyan-200 hover:text-cyan-100 transition-all duration-300"
                          >
                            Create Phase 1 Calendar
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </>
              )}
            </>
          )}
        </div>

        {editing && (
          <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 overflow-y-auto">
            <div className="w-full max-w-5xl my-8">
              <div className="space-y-4">
                <ChallengeForm
                  firms={state.firms}
                  initial={editing}
                  onSubmit={async (updated) => {
                    const updatedChallenge = updated as Challenge;
                    const originalChallenge = editing;
                    
                    // Check if status changed to 'failed'
                    const statusChangedToFailed = originalChallenge && 
                      originalChallenge.status !== 'failed' && 
                      updatedChallenge.status === 'failed';
                    
                    try {
                      // Update the challenge directly with its status
                      await apiClient.updateChallenge(updatedChallenge);
                      
                      // Update local state with the new status
                      setState(prev => ({
                        ...prev,
                        challenges: prev.challenges.map(c => 
                          c.id === updatedChallenge.id 
                            ? updatedChallenge 
                            : c
                        )
                      }));
                      
                      // If challenge was marked as failed, archive all its calendar phases
                      if (statusChangedToFailed) {
                        setCalendar(prev => {
                          const newAccountData = [...prev.accountData];
                          
                          // Archive phases in all accounts that have phases for this challenge
                          newAccountData.forEach(accountData => {
                            archiveFailedChallenge(accountData, updatedChallenge.id);
                          });
                          
                          return { ...prev, accountData: newAccountData };
                        });
                      }
                      
                      setEditing(null);
                    } catch (error) {
                      console.error('Error updating challenge:', error);
                      alert('Failed to save changes. Please try again.');
                    }
                  }}
                />
                
                <PayoutManager
                  key={`${editing.id}-${Array.isArray(editing.payouts) ? editing.payouts.length : 0}`}
                  challenge={editing}
                  onUpdate={async (updated) => {
                    // Update the editing modal state immediately
                    setEditing({ ...updated, payouts: Array.isArray(updated.payouts) ? [...updated.payouts] : [] });
                    
                    // Update the main state
                    setState(prev => ({
                      ...prev,
                      challenges: prev.challenges.map(c => 
                        c.id === updated.id ? { ...updated, payouts: Array.isArray(updated.payouts) ? [...updated.payouts] : [] } : c
                      )
                    }));
                    
                    // Refresh in background to ensure consistency with server
                    refreshState();
                  }}
                />
              </div>
              
              <div className="mt-4 flex justify-center gap-3">
                <button 
                  className="px-4 py-2 rounded-md bg-red-600/20 hover:bg-red-600/30 border border-red-500/50 text-red-200 transition-colors"
                  onClick={() => {
                    const selectedFirm = state.firms.find(f => f.id === editing!.propFirmId);
                    setDeleteConfirm({ 
                      id: editing!.id, 
                      name: `${selectedFirm?.name || 'Unknown'} - $${editing!.accountSize.toLocaleString()} Account` 
                    });
                  }}
                >
                  Delete Challenge
                </button>
                <button 
                  className="px-4 py-2 rounded-md bg-white/10 hover:bg-white/15 transition-colors" 
                  onClick={() => setEditing(null)}
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}
        
        {/* Delete Confirmation Dialog */}
        <ConfirmDialog
          isOpen={!!deleteConfirm}
          title="Delete Challenge"
          message={`Are you sure you want to delete the challenge "${deleteConfirm?.name}"? This action cannot be undone.`}
          confirmText="Delete"
          cancelText="Cancel"
          variant="danger"
          onConfirm={handleDeleteConfirm}
          onCancel={() => setDeleteConfirm(null)}
          loading={loadingDelete}
        />
        
        {/* Add Challenge Modal */}
        <AddChallengeModal
          isOpen={isAddChallengeModalOpen}
          onClose={() => setIsAddChallengeModalOpen(false)}
          firms={state.firms}
          defaultFirmId={state.selectedFirmId}
          buildingMode={buildingMode}
          onSubmit={async (input) => {
            if (!currentUser?.id) return;
            
            // Close modal immediately for better UX
            setIsAddChallengeModalOpen(false);
            
            try {
              const result = await apiClient.addChallenge(currentUser.id, input as any);
              
              // Update UI immediately with optimistic update
              setState(prev => ({
                ...prev,
                challenges: [result.challenge, ...prev.challenges]
              }));
              
              // Automatically create initial calendar account for new challenge (unless building mode is enabled)
              if (result.challenge && !buildingMode) {
                await handleAutomaticNewChallengeCalendar(result.challenge);
              }
              
              // Refresh state in background to ensure consistency
              refreshState();
            } catch (error) {
              console.error('Error adding challenge:', error);
              alert('Failed to add challenge. Please try again.');
              // Reopen modal on error
              setIsAddChallengeModalOpen(true);
            }
          }}
          onAddFirm={async (input) => {
            if (!currentUser?.id) throw new Error('No user ID');
            const result = await apiClient.addFirm(currentUser.id, input);
            await refreshState();
            return result.firm;
          }}
        />
        
        {/* Share Stats Modal */}
        <ShareStatsModal
          challenges={state.challenges}
          isOpen={isShareStatsModalOpen}
          onClose={() => setIsShareStatsModalOpen(false)}
        />

        {/* Debug Window - for development debugging */}
        <DebugWindow
          challenges={state.challenges}
          firms={state.firms}
          selectedChallenge={selectedChallenge}
        />
        
        {/* Rules Management Modal */}
        {selectedChallenge && (() => {
          const phaseLabel = selectedPhase === 'phase1' ? 'Phase 1' : selectedPhase === 'phase2' ? 'Phase 2' : selectedPhase === 'phase3' ? 'Phase 3' : 'Live Account';
          return (
            <RulesManagementModal
              isOpen={isRulesModalOpen}
              onClose={() => setIsRulesModalOpen(false)}
              rules={getCurrentPhaseRules()}
              onSaveRules={handleSaveRules}
              challengeTitle={`${state.firms.find(f => f.id === selectedChallenge.propFirmId)?.name || 'Unknown'} - Challenge #${getChallengeNumber(selectedChallenge)} - ${phaseLabel}`}
            />
          );
        })()}
        
        {/* Rules Compliance Prompt */}
        {selectedChallenge && selectedComplianceDate && (
          <RulesCompliancePrompt
            isOpen={isRulesComplianceOpen}
            onClose={() => {
              setIsRulesComplianceOpen(false);
              setSelectedComplianceDate(null);
            }}
            date={selectedComplianceDate}
            rules={getCurrentPhaseRules()}
            existingCompliance={
              selectedChallengeCalendarData?.entries
                ?.find(e => e.date === selectedComplianceDate)
                ?.ruleCompliance || {}
            }
            onSave={(ruleCompliance) => handleSaveRuleCompliance(selectedComplianceDate, ruleCompliance)}
          />
        )}

      </div>
    </div>
    </>
  );
};

export default Dashboard;
