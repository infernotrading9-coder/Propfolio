import React, { createContext, useContext, useState, ReactNode } from 'react';

interface SettingsContextType {
  buildingMode: boolean;
  setBuildingMode: (enabled: boolean) => void;
  ruleCalendarEnabled: boolean;
  setRuleCalendarEnabled: (enabled: boolean) => void;
}

const SettingsContext = createContext<SettingsContextType | undefined>(undefined);

export const useSettings = () => {
  const context = useContext(SettingsContext);
  if (context === undefined) {
    throw new Error('useSettings must be used within a SettingsProvider');
  }
  return context;
};

interface SettingsProviderProps {
  children: ReactNode;
}

export const SettingsProvider: React.FC<SettingsProviderProps> = ({ children }) => {
  const [buildingMode, setBuildingModeState] = useState<boolean>(() => {
    const saved = localStorage.getItem('dashboard_building_mode');
    return saved ? JSON.parse(saved) : false;
  });
  const [ruleCalendarEnabled, setRuleCalendarEnabledState] = useState<boolean>(() => {
    const saved = localStorage.getItem('dashboard_rule_calendar_enabled');
    return saved ? JSON.parse(saved) : false;
  });

  const setBuildingMode = (enabled: boolean) => {
    setBuildingModeState(enabled);
    localStorage.setItem('dashboard_building_mode', JSON.stringify(enabled));
  };

  const setRuleCalendarEnabled = (enabled: boolean) => {
    setRuleCalendarEnabledState(enabled);
    localStorage.setItem('dashboard_rule_calendar_enabled', JSON.stringify(enabled));

    if (!enabled) {
      setBuildingModeState(false);
      localStorage.setItem('dashboard_building_mode', JSON.stringify(false));
    }
  };

  const value: SettingsContextType = {
    buildingMode,
    setBuildingMode,
    ruleCalendarEnabled,
    setRuleCalendarEnabled,
  };

  return (
    <SettingsContext.Provider value={value}>
      {children}
    </SettingsContext.Provider>
  );
};
