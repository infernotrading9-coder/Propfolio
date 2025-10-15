import React, { createContext, useContext, useState, ReactNode } from 'react';

interface SettingsContextType {
  buildingMode: boolean;
  setBuildingMode: (enabled: boolean) => void;
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

  const setBuildingMode = (enabled: boolean) => {
    setBuildingModeState(enabled);
    localStorage.setItem('dashboard_building_mode', JSON.stringify(enabled));
  };

  const value: SettingsContextType = {
    buildingMode,
    setBuildingMode
  };

  return (
    <SettingsContext.Provider value={value}>
      {children}
    </SettingsContext.Provider>
  );
};