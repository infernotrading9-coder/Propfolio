# Trading Rules System - Integration Guide

## What's Been Created

✅ **TradingRule type** added to `types.ts`
✅ **Challenge.rules** field added to store rules per challenge
✅ **DayEntry.ruleCompliance** field added to track which rules were followed/broken each day
✅ **RulesManagementModal** component - for adding/editing/deleting rules
✅ **RulesCompliancePrompt** component - for marking rule compliance on calendar days
✅ **API Client** updated with `updateChallengeRules` method

## What Needs to Be Integrated

### 1. Import the New Components in Dashboard.tsx

Add these imports at the top of `Dashboard.tsx`:

```typescript
import { RulesManagementModal } from './RulesManagementModal';
import { RulesCompliancePrompt } from './RulesCompliancePrompt';
import { ListChecks } from 'lucide-react';
```

### 2. Add State for the Modals in Dashboard.tsx

Add these state variables in the Dashboard component (around line 43 where other states are):

```typescript
const [isRulesModalOpen, setIsRulesModalOpen] = useState(false);
const [isRulesComplianceOpen, setIsRulesComplianceOpen] = useState(false);
const [selectedComplianceDate, setSelectedComplianceDate] = useState<string | null>(null);
```

### 3. Add "Manage Rules" Button in Calendar View

In the calendar view section (around line 721, right before the Calendar component), add a button to manage rules:

```typescript
{selectedChallengeCalendarData.phaseAccountId ? (
  <>
    {/* Add Rules Management Button */}
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
    {selectedChallenge?.rules && selectedChallenge.rules.length > 0 && (
      <div className="mb-6 p-4 bg-gradient-to-br from-gray-900/60 to-gray-800/40 backdrop-blur-sm rounded-xl border border-white/10">
        <h3 className="text-lg font-bold text-cyan-300 mb-3 flex items-center gap-2">
          <ListChecks className="w-5 h-5" />
          Active Trading Rules
        </h3>
        <div className="space-y-2">
          {selectedChallenge.rules.map((rule, index) => (
            <div key={rule.id} className="flex items-center gap-3 text-white/80">
              <span className="flex items-center justify-center w-6 h-6 rounded-full bg-cyan-500/20 border border-cyan-400/40 text-xs font-bold text-cyan-200">
                {index + 1}
              </span>
              <span>{rule.text}</span>
            </div>
          ))}
        </div>
      </div>
    )}
    
    <Calendar 
      entries={selectedChallengeCalendarData.entries} 
      onDayUpdate={selectedChallenge?.status !== 'failed' ? handleDayUpdate : undefined}
      isArchived={selectedChallenge?.status === 'failed'}
    />
```

### 4. Modify handleDayUpdate Function

Update the `handleDayUpdate` function (around line 146) to open the rules compliance prompt instead of directly updating:

```typescript
const handleDayUpdate = (date: string, followedRules: boolean | null, notes?: string) => {
  // If challenge has rules, open compliance prompt
  if (selectedChallenge?.rules && selectedChallenge.rules.length > 0) {
    setSelectedComplianceDate(date);
    setIsRulesComplianceOpen(true);
    return;
  }
  
  // Otherwise, use old logic (for backwards compatibility)
  if (!selectedChallengeCalendarData.phaseAccountId) return;
  
  const accountData = getAccountData(selectedChallengeCalendarData.phaseAccountId, calendar.accountData);
  const existingEntry = accountData.entries.find(e => e.date === date);
  
  if (existingEntry) {
    existingEntry.followedRules = followedRules;
    if (notes !== undefined) existingEntry.notes = notes;
  } else {
    accountData.entries.push({ date, followedRules, notes });
  }
  
  setCalendar({ ...calendar });
  saveCalendar(calendar);
};
```

### 5. Add Handler for Saving Rule Compliance

Add this new function in Dashboard component:

```typescript
const handleSaveRuleCompliance = (date: string, ruleCompliance: Record<string, boolean>) => {
  if (!selectedChallengeCalendarData.phaseAccountId) return;
  
  const accountData = getAccountData(selectedChallengeCalendarData.phaseAccountId, calendar.accountData);
  const existingEntry = accountData.entries.find(e => e.date === date);
  
  // Determine if all rules were followed
  const allFollowed = Object.values(ruleCompliance).every(v => v === true);
  const anyBroken = Object.values(ruleCompliance).some(v => v === false);
  const followedRules = allFollowed ? true : anyBroken ? false : null;
  
  if (existingEntry) {
    existingEntry.ruleCompliance = ruleCompliance;
    existingEntry.followedRules = followedRules;
  } else {
    accountData.entries.push({ 
      date, 
      followedRules, 
      ruleCompliance 
    });
  }
  
  setCalendar({ ...calendar });
  saveCalendar(calendar);
};
```

### 6. Add Handler for Saving Rules

Add this function to save rules to the challenge:

```typescript
const handleSaveRules = async (rules: TradingRule[]) => {
  if (!selectedChallenge) return;
  
  try {
    await apiClient.updateChallengeRules(selectedChallenge.id, rules);
    
    // Update local state
    setState(prevState => ({
      ...prevState,
      challenges: prevState.challenges.map(challenge => 
        challenge.id === selectedChallenge.id 
          ? { ...challenge, rules }
          : challenge
      )
    }));
  } catch (error) {
    console.error('Failed to save rules:', error);
    throw error;
  }
};
```

### 7. Add the Modal Components at the End of Dashboard Return

Before the closing tags of Dashboard, add these modals (around line 920):

```typescript
{/* Rules Management Modal */}
{selectedChallenge && (
  <RulesManagementModal
    isOpen={isRulesModalOpen}
    onClose={() => setIsRulesModalOpen(false)}
    rules={selectedChallenge.rules || []}
    onSaveRules={handleSaveRules}
    challengeTitle={`${state.firms.find(f => f.id === selectedChallenge.propFirmId)?.name || 'Unknown'} - Challenge #${getChallengeNumber(selectedChallenge)}`}
  />
)}

{/* Rules Compliance Prompt */}
{selectedChallenge && selectedComplianceDate && (
  <RulesCompliancePrompt
    isOpen={isRulesComplianceOpen}
    onClose={() => {
      setIsRulesComplianceOpen(false);
      setSelectedComplianceDate(null);
    }}
    date={selectedComplianceDate}
    rules={selectedChallenge.rules || []}
    existingCompliance={
      selectedChallengeCalendarData?.entries
        ?.find(e => e.date === selectedComplianceDate)
        ?.ruleCompliance || {}
    }
    onSave={(ruleCompliance) => handleSaveRuleCompliance(selectedComplianceDate, ruleCompliance)}
  />
)}
```

### 8. Update Calendar Component to Use Rule Compliance for Colors

The Calendar component needs to check `ruleCompliance` instead of just `followedRules`. Find where calendar days are colored and update the logic:

```typescript
// In Calendar component (src/components/Calendar.tsx), update day coloring:
const getRuleStatus = (entry: DayEntry): boolean | null => {
  // If new rule compliance system is used
  if (entry.ruleCompliance && Object.keys(entry.ruleCompliance).length > 0) {
    const allFollowed = Object.values(entry.ruleCompliance).every(v => v === true);
    const anyBroken = Object.values(entry.ruleCompliance).some(v => v === false);
    return allFollowed ? true : anyBroken ? false : null;
  }
  // Fall back to old system
  return entry.followedRules;
};

// Then use getRuleStatus(entry) instead of entry.followedRules for coloring
```

## Testing Checklist

- [ ] Can open Rules Management Modal from calendar view
- [ ] Can add new rules
- [ ] Can delete rules
- [ ] Rules are displayed on the calendar page
- [ ] Clicking a calendar day opens Rules Compliance Prompt
- [ ] Can mark rules as followed/broken
- [ ] Calendar day turns green when all rules followed
- [ ] Calendar day turns red when any rule broken
- [ ] Rules persist after page refresh
- [ ] Works for all phases (Phase 1, 2, 3, Live)

## Notes

- Rules are per-challenge, not per-phase
- Each calendar day tracks compliance for each rule individually
- Green = all rules followed, Red = at least one rule broken
- The existing calendar icons/functionality remain intact
