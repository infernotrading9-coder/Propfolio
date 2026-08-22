import React, { useState, useEffect, useCallback } from 'react';
import { Wallet, ArrowUp, ArrowDown, GripVertical, Calendar, Edit3, Save, X, Trash2 } from 'lucide-react';

interface TradingAccount {
  id: string;
  name: string;
  firm: string;
  accountNumberLast4?: string | null;
  accountSize: string;
  balance: string;
  drawdownUsed: string;
  highWaterMark: string;
  maxDrawdown?: string;
  dailyDrawdown?: string;
  riskPerTrade?: string;
  rules?: string[] | null;
  notes?: string | null;
  status: string;
  phase: string;
  platform?: string | null;
  groupName?: string | null;
  sortOrder: number;
}

interface DailyOrder {
  id: string;
  orderDate: string;
  orderedAccountIds: string[];
  notes?: string | null;
}

interface AccountsViewProps {
  apiBase: string;
  getAuthHeaders: () => Record<string, string>;
}

export const AccountsView: React.FC<AccountsViewProps> = ({ apiBase, getAuthHeaders }) => {
  const [accounts, setAccounts] = useState<TradingAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddAccount, setShowAddAccount] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [dailyOrder, setDailyOrder] = useState<DailyOrder | null>(null);
  const [orderMode, setOrderMode] = useState(false);
  const [orderedIds, setOrderedIds] = useState<string[]>([]);

  const [newAccount, setNewAccount] = useState({
    name: '',
    firm: '',
    accountNumberLast4: '',
    accountSize: '',
    balance: '',
    maxDrawdown: '',
    dailyDrawdown: '',
    riskPerTrade: '',
    rules: '',
    notes: '',
    phase: 'challenge',
    platform: '',
    groupName: '',
  });

  const [editData, setEditData] = useState<Partial<TradingAccount>>({});

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [accountsRes, orderRes] = await Promise.all([
        fetch(`${apiBase}/db-accounts`, { headers: getAuthHeaders() }),
        fetch(`${apiBase}/db-accounts?action=daily-order&date=${new Date().toISOString().slice(0, 10)}`, { headers: getAuthHeaders() }),
      ]);
      const accountsData = await accountsRes.json();
      const orderData = await orderRes.json();
      if (accountsData.accounts) setAccounts(accountsData.accounts);
      if (orderData.order) setDailyOrder(orderData.order);
    } catch (e) {
      console.error('Failed to load accounts:', e);
    } finally {
      setLoading(false);
    }
  }, [apiBase, getAuthHeaders]);

  useEffect(() => { loadData(); }, [loadData]);

  const handleAddAccount = async () => {
    if (!newAccount.name || !newAccount.firm) return;
    try {
      await fetch(`${apiBase}/db-accounts`, {
        method: 'POST',
        headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'create',
          ...newAccount,
          rules: newAccount.rules ? newAccount.rules.split(',').map(r => r.trim()) : [],
          accountSize: parseFloat(newAccount.accountSize) || 0,
          balance: parseFloat(newAccount.balance) || parseFloat(newAccount.accountSize) || 0,
          maxDrawdown: parseFloat(newAccount.maxDrawdown) || 0,
          dailyDrawdown: parseFloat(newAccount.dailyDrawdown) || 0,
          riskPerTrade: parseFloat(newAccount.riskPerTrade) || 0,
        }),
      });
      setShowAddAccount(false);
      setNewAccount({ name: '', firm: '', accountNumberLast4: '', accountSize: '', balance: '', maxDrawdown: '', dailyDrawdown: '', riskPerTrade: '', rules: '', notes: '', phase: 'challenge', platform: '', groupName: '' });
      loadData();
    } catch (e) { console.error('Failed to add account:', e); }
  };

  const handleUpdateAccount = async (id: string, updates: Partial<TradingAccount>) => {
    try {
      await fetch(`${apiBase}/db-accounts`, {
        method: 'PUT',
        headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, updates }),
      });
      setEditingId(null);
      loadData();
    } catch (e) { console.error('Failed to update account:', e); }
  };

  const handleDeleteAccount = async (id: string) => {
    if (!confirm('Delete this account? This will also delete its trade history.')) return;
    try {
      await fetch(`${apiBase}/db-accounts`, {
        method: 'DELETE',
        headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      loadData();
    } catch (e) { console.error('Failed to delete account:', e); }
  };

  const handleSaveDailyOrder = async () => {
    if (orderedIds.length === 0) return;
    try {
      await fetch(`${apiBase}/db-accounts`, {
        method: 'POST',
        headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'set-daily-order',
          orderDate: new Date().toISOString().slice(0, 10),
          orderedAccountIds: orderedIds,
        }),
      });
      setOrderMode(false);
      loadData();
    } catch (e) { console.error('Failed to save daily order:', e); }
  };

  const moveAccount = (index: number, direction: 'up' | 'down') => {
    const newOrder = [...orderedIds];
    const swapIndex = direction === 'up' ? index - 1 : index + 1;
    if (swapIndex < 0 || swapIndex >= newOrder.length) return;
    [newOrder[index], newOrder[swapIndex]] = [newOrder[swapIndex], newOrder[index]];
    setOrderedIds(newOrder);
  };

  if (loading) {
    return <div className="flex items-center justify-center py-20 text-gray-400">Loading accounts...</div>;
  }

  return (
    <div className="space-y-6">
      {/* Daily Trading Order Section */}
      <div className="bg-gray-900/60 border border-gray-800 rounded-xl p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <Calendar className="w-5 h-5 text-neon-cyan" />
            Today's Trading Order
          </h2>
          <div className="flex gap-2">
            {orderMode ? (
              <>
                <button onClick={handleSaveDailyOrder} className="bg-neon-lime text-black px-4 py-2 rounded-lg font-medium text-sm hover:opacity-90">Save Order</button>
                <button onClick={() => { setOrderMode(false); setOrderedIds([]); }} className="bg-gray-700 text-white px-4 py-2 rounded-lg text-sm">Cancel</button>
              </>
            ) : (
              <button
                onClick={() => { setOrderMode(true); setOrderedIds(accounts.map(a => a.id)); }}
                className="bg-gradient-to-r from-neon-purple to-neon-cyan text-white px-4 py-2 rounded-lg font-medium text-sm hover:opacity-90"
              >
                Set Today's Order
              </button>
            )}
          </div>
        </div>

        {dailyOrder && !orderMode ? (
          <div className="space-y-2">
            {dailyOrder.orderedAccountIds.map((id, idx) => {
              const acct = accounts.find(a => a.id === id);
              if (!acct) return null;
              return (
                <div key={id} className="flex items-center gap-3 bg-gray-800/50 rounded-lg px-4 py-2">
                  <span className="text-neon-cyan font-bold w-6 text-center">{idx + 1}</span>
                  <span className="text-white font-medium">{acct.name}</span>
                  <span className="text-gray-400 text-sm">{acct.firm}</span>
                  <span className="text-gray-500 text-sm ml-auto">${parseFloat(acct.balance).toFixed(0)}</span>
                </div>
              );
            })}
            {dailyOrder.notes && <p className="text-gray-400 text-sm mt-2">{dailyOrder.notes}</p>}
          </div>
        ) : orderMode ? (
          <div className="space-y-2">
            {orderedIds.map((id, idx) => {
              const acct = accounts.find(a => a.id === id);
              if (!acct) return null;
              return (
                <div key={id} className="flex items-center gap-3 bg-gray-800/50 rounded-lg px-4 py-2">
                  <GripVertical className="w-4 h-4 text-gray-500" />
                  <span className="text-neon-cyan font-bold w-6 text-center">{idx + 1}</span>
                  <span className="text-white font-medium">{acct.name}</span>
                  <span className="text-gray-400 text-sm">{acct.firm}</span>
                  <div className="ml-auto flex gap-1">
                    <button onClick={() => moveAccount(idx, 'up')} disabled={idx === 0} className="text-gray-400 hover:text-white disabled:opacity-30"><ArrowUp className="w-4 h-4" /></button>
                    <button onClick={() => moveAccount(idx, 'down')} disabled={idx === orderedIds.length - 1} className="text-gray-400 hover:text-white disabled:opacity-30"><ArrowDown className="w-4 h-4" /></button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-gray-500 text-sm">No order set for today. Click "Set Today's Order" to arrange your accounts.</p>
        )}
      </div>

      {/* Accounts Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-white flex items-center gap-2">
          <Wallet className="w-6 h-6 text-neon-purple" />
          Trading Accounts
        </h2>
        <button
          onClick={() => setShowAddAccount(!showAddAccount)}
          className="bg-gradient-to-r from-neon-purple to-neon-cyan text-white px-4 py-2 rounded-lg font-medium hover:opacity-90"
        >
          + Add Account
        </button>
      </div>

      {/* Add Account Form */}
      {showAddAccount && (
        <div className="bg-gray-900/80 border border-gray-700 rounded-xl p-6 space-y-4">
          <h3 className="text-lg font-semibold text-white">Add New Trading Account</h3>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <FormField label="Account Name" value={newAccount.name} onChange={(v) => setNewAccount({ ...newAccount, name: v })} placeholder="Acct 0006" />
            <FormField label="Firm" value={newAccount.firm} onChange={(v) => setNewAccount({ ...newAccount, firm: v })} placeholder="Tradify" />
            <FormField label="Last 4 Digits" value={newAccount.accountNumberLast4} onChange={(v) => setNewAccount({ ...newAccount, accountNumberLast4: v })} placeholder="0006" />
            <FormField label="Account Size ($)" value={newAccount.accountSize} onChange={(v) => setNewAccount({ ...newAccount, accountSize: v })} placeholder="50000" type="number" />
            <FormField label="Current Balance ($)" value={newAccount.balance} onChange={(v) => setNewAccount({ ...newAccount, balance: v })} placeholder="50000" type="number" />
            <FormField label="Max Drawdown ($)" value={newAccount.maxDrawdown} onChange={(v) => setNewAccount({ ...newAccount, maxDrawdown: v })} placeholder="2000" type="number" />
            <FormField label="Daily Drawdown ($)" value={newAccount.dailyDrawdown} onChange={(v) => setNewAccount({ ...newAccount, dailyDrawdown: v })} placeholder="1000" type="number" />
            <FormField label="Risk Per Trade ($)" value={newAccount.riskPerTrade} onChange={(v) => setNewAccount({ ...newAccount, riskPerTrade: v })} placeholder="200" type="number" />
            <div>
              <label className="text-sm text-gray-400 mb-1 block">Phase</label>
              <select
                value={newAccount.phase}
                onChange={(e) => setNewAccount({ ...newAccount, phase: e.target.value })}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white"
              >
                <option value="challenge">Challenge</option>
                <option value="funded">Funded</option>
                <option value="live">Live</option>
              </select>
            </div>
          </div>
          <div>
            <label className="text-sm text-gray-400 mb-1 block">Rules (comma-separated)</label>
            <input
              value={newAccount.rules}
              onChange={(e) => setNewAccount({ ...newAccount, rules: e.target.value })}
              placeholder="Max daily loss before stopping, Only A+ setups"
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white"
            />
          </div>
          <div className="flex gap-2">
            <button onClick={handleAddAccount} className="bg-neon-purple text-white px-6 py-2 rounded-lg font-medium hover:opacity-90">Add Account</button>
            <button onClick={() => setShowAddAccount(false)} className="bg-gray-700 text-white px-6 py-2 rounded-lg">Cancel</button>
          </div>
        </div>
      )}

      {/* Accounts Grid */}
      {accounts.length === 0 ? (
        <div className="text-center py-16 text-gray-500">
          <Wallet className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p>No accounts yet. Click "Add Account" to create one.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {accounts.map((acct) => {
            const balance = parseFloat(acct.balance);
            const drawdown = parseFloat(acct.drawdownUsed);
            const hwm = parseFloat(acct.highWaterMark);
            const maxDD = acct.maxDrawdown ? parseFloat(acct.maxDrawdown) : 0;
            const ddPercent = maxDD > 0 ? Math.min(100, (drawdown / maxDD) * 100) : 0;
            const profit = balance - hwm;
            const isEditing = editingId === acct.id;

            return (
              <div key={acct.id} className="bg-gray-900/60 border border-gray-800 rounded-xl p-5 space-y-3">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-white font-bold text-lg">{acct.name}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${acct.phase === 'live' ? 'bg-neon-lime/20 text-neon-lime' : acct.phase === 'funded' ? 'bg-neon-cyan/20 text-neon-cyan' : 'bg-neon-purple/20 text-neon-purple'}`}>{acct.phase}</span>
                    </div>
                    <div className="text-gray-400 text-sm">{acct.firm}{acct.accountNumberLast4 ? ` · ...${acct.accountNumberLast4}` : ''}</div>
                  </div>
                  <div className="flex gap-1">
                    {!isEditing && <button onClick={() => { setEditingId(acct.id); setEditData({ balance: acct.balance, drawdownUsed: acct.drawdownUsed, highWaterMark: acct.highWaterMark, notes: acct.notes, status: acct.status, rules: acct.rules }); }} className="text-gray-500 hover:text-neon-cyan"><Edit3 className="w-4 h-4" /></button>}
                    <button onClick={() => handleDeleteAccount(acct.id)} className="text-gray-500 hover:text-red-400"><Trash2 className="w-4 h-4" /></button>
                  </div>
                </div>

                {isEditing ? (
                  <div className="space-y-2">
                    <div className="grid grid-cols-3 gap-2">
                      <input type="number" value={editData.balance || ''} onChange={(e) => setEditData({ ...editData, balance: e.target.value })} placeholder="Balance" className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-white text-sm" />
                      <input type="number" value={editData.drawdownUsed || ''} onChange={(e) => setEditData({ ...editData, drawdownUsed: e.target.value })} placeholder="DD Used" className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-white text-sm" />
                      <input type="number" value={editData.highWaterMark || ''} onChange={(e) => setEditData({ ...editData, highWaterMark: e.target.value })} placeholder="HWM" className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-white text-sm" />
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => handleUpdateAccount(acct.id, editData)} className="bg-neon-lime text-black px-3 py-1 rounded text-sm font-medium"><Save className="w-3 h-3 inline" /> Save</button>
                      <button onClick={() => setEditingId(null)} className="bg-gray-700 text-white px-3 py-1 rounded text-sm"><X className="w-3 h-3 inline" /> Cancel</button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="grid grid-cols-3 gap-2 text-center">
                      <div>
                        <div className="text-gray-500 text-xs">Balance</div>
                        <div className="text-white font-semibold">${balance.toFixed(0)}</div>
                      </div>
                      <div>
                        <div className="text-gray-500 text-xs">HWM</div>
                        <div className="text-gray-300 font-medium">${hwm.toFixed(0)}</div>
                      </div>
                      <div>
                        <div className="text-gray-500 text-xs">P&L from HWM</div>
                        <div className={`font-medium ${profit >= 0 ? 'text-neon-lime' : 'text-red-400'}`}>{profit >= 0 ? '+' : ''}${profit.toFixed(0)}</div>
                      </div>
                    </div>

                    {/* Drawdown bar */}
                    <div>
                      <div className="flex justify-between text-xs mb-1">
                        <span className="text-gray-500">Drawdown Used</span>
                        <span className={ddPercent > 80 ? 'text-red-400' : 'text-gray-400'}>${drawdown.toFixed(0)} / ${maxDD.toFixed(0)} ({ddPercent.toFixed(0)}%)</span>
                      </div>
                      <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${ddPercent > 80 ? 'bg-red-500' : ddPercent > 50 ? 'bg-amber-500' : 'bg-neon-lime'}`}
                          style={{ width: `${ddPercent}%` }}
                        />
                      </div>
                    </div>

                    {/* Rules */}
                    {acct.rules && acct.rules.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {acct.rules.map((rule, i) => (
                          <span key={i} className="text-xs bg-gray-800 text-gray-300 px-2 py-0.5 rounded-full">{rule}</span>
                        ))}
                      </div>
                    )}

                    {acct.notes && <p className="text-gray-500 text-xs">{acct.notes}</p>}
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

const FormField: React.FC<{ label: string; value: string; onChange: (v: string) => void; placeholder?: string; type?: string }> = ({ label, value, onChange, placeholder, type = 'text' }) => (
  <div>
    <label className="text-sm text-gray-400 mb-1 block">{label}</label>
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white"
    />
  </div>
);
