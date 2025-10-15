import React, { useState } from 'react';
import { Settings, X, LogOut, Wrench } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useSettings } from '../contexts/SettingsContext';

const SettingsPanel: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const { currentUser, logout } = useAuth();
  const { buildingMode, setBuildingMode } = useSettings();

  const handleLogout = async () => {
    try {
      await logout();
      setIsOpen(false);
    } catch (error) {
      console.error('Failed to log out:', error);
    }
  };

  return (
    <>
      {/* Settings Button */}
      <button
        onClick={() => setIsOpen(true)}
        className="flex items-center justify-center w-10 h-10 bg-white/5 hover:bg-white/10 border border-white/10 hover:border-white/20 rounded-lg transition-all duration-200 group"
        title="Settings"
      >
        <Settings className="w-5 h-5 text-gray-400 group-hover:text-white transition-colors" />
      </button>

      {/* Settings Modal */}
      {isOpen && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50">
          <div className="bg-[#0b0f17] border border-gray-800 rounded-2xl p-6 w-full max-w-md shadow-2xl">
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-white">Settings</h2>
              <button
                onClick={() => setIsOpen(false)}
                className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-white/10 transition-colors"
              >
                <X className="w-5 h-5 text-gray-400" />
              </button>
            </div>

            {/* User Info */}
            <div className="mb-6 p-4 bg-white/5 rounded-lg border border-white/10">
              <div className="text-sm text-gray-400 mb-1">Signed in as</div>
              <div className="text-white font-medium">{currentUser?.name || currentUser?.email}</div>
            </div>

            {/* Settings Options */}
            <div className="space-y-4 mb-6">
              {/* Building Mode Toggle */}
              <div className="flex items-center justify-between p-4 bg-white/5 rounded-lg border border-white/10">
                <div className="flex items-center gap-3">
                  <Wrench className="w-5 h-5 text-cyan-400" />
                  <div>
                    <div className="text-white font-medium">Building Mode</div>
                    <div className="text-sm text-gray-400">Mass challenge status changer (available on calendar page)</div>
                  </div>
                </div>
                <button
                  onClick={() => setBuildingMode(!buildingMode)}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                    buildingMode 
                      ? 'bg-cyan-500 shadow-[0_0_20px_rgba(34,211,238,0.4)]' 
                      : 'bg-gray-600'
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      buildingMode ? 'translate-x-5' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>

            </div>

            {/* Logout Button */}
            <button
              onClick={handleLogout}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-red-600/20 hover:bg-red-600/30 border border-red-500/50 hover:border-red-500/70 text-red-300 hover:text-red-200 rounded-lg transition-all duration-200"
            >
              <LogOut className="w-4 h-4" />
              Sign Out
            </button>
          </div>
        </div>
      )}
    </>
  );
};

export default SettingsPanel;