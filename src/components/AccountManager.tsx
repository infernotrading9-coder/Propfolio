import React from 'react';
import { TradingAccount } from '../utils/calendarStorage';
import { NeonCard } from './NeonCard';

export const AccountManager: React.FC<{
  accounts: TradingAccount[];
  selectedAccountId: string | null;
  onAccountSelect: (id: string) => void;
  onAccountRename: (id: string, name: string) => void;
  onAccountDelete: (id: string) => void;
}> = ({ accounts, selectedAccountId, onAccountSelect, onAccountRename, onAccountDelete }) => {

  return (
    <NeonCard className="p-4" glow="pink">
      <div className="flex flex-col gap-3">
        <div className="text-center text-white/70 text-sm mb-2">
          Challenge calendars are created automatically when you add challenges or complete phases in the dashboard
        </div>
        <div className="flex flex-wrap gap-2">
          {accounts.map(acc => (
            <div key={acc.id} className={`flex items-center gap-2 px-3 py-1.5 rounded-md border ${selectedAccountId === acc.id ? 'border-white/40 bg-white/10' : 'border-white/10'}`}>
              <button className="text-white" onClick={() => onAccountSelect(acc.id)}>{acc.name}</button>
              <button className="text-xs text-white/60 hover:text-white" onClick={() => {
                const newName = prompt('Rename account', acc.name);
                if (newName && newName.trim()) onAccountRename(acc.id, newName.trim());
              }}>Rename</button>
              <button className="text-xs text-red-300 hover:text-red-200" onClick={() => onAccountDelete(acc.id)}>Delete</button>
            </div>
          ))}
        </div>
      </div>
    </NeonCard>
  );
};
