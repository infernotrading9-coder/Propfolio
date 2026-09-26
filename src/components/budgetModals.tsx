/**
 * budgetModals — the Budget tab's modals, extracted from BudgetTab.tsx so each
 * is its own component. Pure presentation: every value and handler is passed in
 * as a prop (the parent owns the form state and submit handlers). No logic here.
 */
import React, { useState } from 'react';
import type { Account, AccountIcon, Category, LoanKind, Transaction, TxnType } from './BudgetTab';

// Small inline helpers the modals used (kept local so there's no import cycle).
function stripEmoji(str: string | null | undefined): string {
  return String(str || '').replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/gu, '').trim();
}
function isLoanAccount(acc: Account | null | undefined): boolean {
  return !!acc && (acc.loanKind === 'lend' || acc.loanKind === 'borrow' || acc.loanKind === 'debt' || acc.loanKind === 'credit');
}

/* ─── Transaction Modal ──────────────────────────────────────────────────── */
export interface TransactionModalProps {
  open: boolean;
  editingTxn: Transaction | null;
  accounts: Account[];
  categories: Category[];
  txnType: TxnType; setTxnType: (v: TxnType) => void;
  txnName: string; setTxnName: (v: string) => void;
  txnAmount: string; setTxnAmount: (v: string) => void;
  txnAccountId: string; setTxnAccountId: (v: string) => void;
  txnToAccountId: string; setTxnToAccountId: (v: string) => void;
  txnTransferFee: string; setTxnTransferFee: (v: string) => void;
  txnCategoryId: string; setTxnCategoryId: (v: string) => void;
  txnDate: string; setTxnDate: (v: string) => void;
  txnExcluded: boolean; setTxnExcluded: (v: boolean) => void;
  showNameSuggestions: boolean; setShowNameSuggestions: (v: boolean) => void;
  txnNameSuggestionsList: string[];
  onNameInput: (v: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  onDelete: (t: Transaction) => void;
  onClose: () => void;
}

export function TransactionModal(p: TransactionModalProps) {
  if (!p.open) return null;
  const txnType = p.txnType;
  return (
    <div className="budget-modal" onClick={(e) => { if (e.target === e.currentTarget) p.onClose(); }}>
      <div className="budget-modal-content">
        <div className="budget-modal-header">
          <h2>{p.editingTxn ? 'Edit Transaction' : 'Add Transaction'}</h2>
          <button className="budget-btn budget-btn-ghost" onClick={p.onClose}>✕</button>
        </div>
        <form onSubmit={p.onSubmit}>
          <div style={{ display: 'grid', gap: 14 }}>
            {/* Type selector */}
            <div>
              <label className="budget-label">Type</label>
              <select className="budget-select" value={txnType} onChange={(e) => p.setTxnType(e.target.value as TxnType)}>
                <option value="expense">Expense</option>
                <option value="income">Income</option>
                <option value="transfer">Transfer</option>
                <option value="adjustment">Adjustment</option>
              </select>
            </div>

            {/* Name with suggestions */}
            {txnType !== 'transfer' && txnType !== 'adjustment' && (
              <div style={{ position: 'relative' }}>
                <label className="budget-label">Name</label>
                <input
                  className="budget-input"
                  type="text"
                  value={p.txnName}
                  onChange={(e) => p.onNameInput(e.target.value)}
                  onBlur={() => setTimeout(() => p.setShowNameSuggestions(false), 160)}
                  required={(txnType as string) !== 'transfer' && (txnType as string) !== 'adjustment' && (txnType as string) !== 'trade'}
                />
                {p.showNameSuggestions && p.txnNameSuggestionsList.length > 0 && (
                  <div className="budget-name-suggestions">
                    {p.txnNameSuggestionsList.map((n) => (
                      <button
                        key={n}
                        type="button"
                        className="budget-name-suggestion-item"
                        onClick={() => { p.setTxnName(n); p.setShowNameSuggestions(false); }}
                      >
                        {n}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Amount */}
            <div className="budget-input-with">
              <label className="budget-label">Amount</label>
              <span className="prefix">$</span>
              <input
                className="budget-input"
                type="number"
                step="0.01"
                min="0.01"
                value={p.txnAmount}
                onChange={(e) => p.setTxnAmount(e.target.value)}
                placeholder="0.00"
                required
              />
            </div>

            {/* Account selector */}
            {txnType === 'transfer' ? (
              <>
                <div>
                  <label className="budget-label">From Account</label>
                  <select className="budget-select" value={p.txnAccountId} onChange={(e) => p.setTxnAccountId(e.target.value)}>
                    {p.accounts.map((a) => <option key={a.id} value={a.id}>{stripEmoji(a.name)}</option>)}
                  </select>
                </div>
                <div>
                  <label className="budget-label">To Account</label>
                  <select className="budget-select" value={p.txnToAccountId} onChange={(e) => p.setTxnToAccountId(e.target.value)}>
                    {p.accounts.map((a) => <option key={a.id} value={a.id}>{stripEmoji(a.name)}</option>)}
                  </select>
                </div>
                <div className="budget-input-with">
                  <label className="budget-label">Transfer Fee (optional)</label>
                  <span className="prefix">$</span>
                  <input className="budget-input" type="number" step="0.01" value={p.txnTransferFee} onChange={(e) => p.setTxnTransferFee(e.target.value)} placeholder="0.00" />
                </div>
              </>
            ) : (
              <div>
                <label className="budget-label">{txnType === 'income' ? 'Money going to' : 'Money from'}</label>
                <select className="budget-select" value={p.txnAccountId} onChange={(e) => p.setTxnAccountId(e.target.value)} required>
                  <option value="">Select account</option>
                  {p.accounts.map((a) => <option key={a.id} value={a.id}>{stripEmoji(a.name)}</option>)}
                </select>
              </div>
            )}

            {/* Category for expenses */}
            {txnType === 'expense' && (
              <div>
                <label className="budget-label">Category</label>
                <select className="budget-select" value={p.txnCategoryId} onChange={(e) => p.setTxnCategoryId(e.target.value)} required>
                  <option value="">Select category</option>
                  {p.categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
            )}

            {/* Date */}
            <div>
              <label className="budget-label">Date</label>
              <input className="budget-input" type="date" value={p.txnDate} onChange={(e) => p.setTxnDate(e.target.value)} required />
            </div>

            {/* Excluded toggle */}
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
              <input type="checkbox" checked={p.txnExcluded} onChange={(e) => p.setTxnExcluded(e.target.checked)} />
              <span style={{ fontSize: 13, color: 'var(--muted)' }}>Exclude from calculations</span>
            </label>

            <div style={{ display: 'flex', gap: 8 }}>
              <button type="submit" className="budget-btn budget-btn-primary">{p.editingTxn ? 'Save Changes' : 'Add Transaction'}</button>
              {p.editingTxn && (
                <button type="button" className="budget-btn budget-btn-danger" onClick={() => { p.onDelete(p.editingTxn!); p.onClose(); }}>Delete</button>
              )}
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ─── Account Modal ──────────────────────────────────────────────────────── */
export interface AccountModalProps {
  open: boolean;
  editingAccountId: string | null;
  accounts: Account[];
  accName: string; setAccName: (v: string) => void;
  accBalance: string; setAccBalance: (v: string) => void;
  accType: AccountIcon; setAccType: (v: AccountIcon) => void;
  accLoanKind: LoanKind; setAccLoanKind: (v: LoanKind) => void;
  accLoanFee: string; setAccLoanFee: (v: string) => void;
  accLoanApr: string; setAccLoanApr: (v: string) => void;
  accLoanDocumentTotal: string; setAccLoanDocumentTotal: (v: string) => void;
  accLoanTermMonths: string; setAccLoanTermMonths: (v: string) => void;
  accBorrowTo: string; setAccBorrowTo: (v: string) => void;
  accLendFrom: string; setAccLendFrom: (v: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  onClose: () => void;
}

export function AccountModal(p: AccountModalProps) {
  if (!p.open) return null;
  return (
    <div className="budget-modal" onClick={(e) => { if (e.target === e.currentTarget) p.onClose(); }}>
      <div className="budget-modal-content">
        <div className="budget-modal-header">
          <h2>{p.editingAccountId ? 'Edit Account' : 'Create Account'}</h2>
          <button className="budget-btn budget-btn-ghost" onClick={p.onClose}>✕</button>
        </div>
        <form onSubmit={p.onSubmit}>
          <div style={{ display: 'grid', gap: 14 }}>
            <div>
              <label className="budget-label">Account Name</label>
              <input className="budget-input" type="text" value={p.accName} onChange={(e) => p.setAccName(e.target.value)} placeholder="e.g. Checking, Savings..." required />
            </div>
            <div className="budget-input-with">
              <label className="budget-label">Initial Balance</label>
              <span className="prefix">$</span>
              <input className="budget-input" type="number" step="0.01" value={p.accBalance} onChange={(e) => p.setAccBalance(e.target.value)} placeholder="0.00" />
            </div>
            {(!p.accLoanKind || (p.accLoanKind as string) === '') && (
              <div>
                <label className="budget-label">Account Type</label>
                <select className="budget-select" value={p.accType} onChange={(e) => p.setAccType(e.target.value as AccountIcon)}>
                  <option value="cash">Cash / Wallet</option>
                  <option value="card">Card</option>
                  <option value="bank">Bank</option>
                  <option value="savings">Savings</option>
                  <option value="phone">Mobile</option>
                  <option value="bag">Pouch</option>
                  <option value="coin">Coin</option>
                  <option value="gem">Investment</option>
                  <option value="target">Goal</option>
                </select>
              </div>
            )}
            <div>
              <label className="budget-label">Loan Type (optional)</label>
              <select className="budget-select" value={p.accLoanKind} onChange={(e) => p.setAccLoanKind(e.target.value as LoanKind)}>
                <option value="">None (regular account)</option>
                <option value="borrow">Borrowed (I owe)</option>
                <option value="lend">Lent (they owe me)</option>
                <option value="debt">Debt</option>
                <option value="credit">Credit Card</option>
              </select>
            </div>
            {p.accLoanKind === 'borrow' && (
              <div>
                <label className="budget-label">Borrow to (deposit into)</label>
                <select className="budget-select" value={p.accBorrowTo} onChange={(e) => p.setAccBorrowTo(e.target.value)}>
                  <option value="">Select account</option>
                  {p.accounts.filter((a) => !isLoanAccount(a)).map((a) => <option key={a.id} value={a.id}>{stripEmoji(a.name)}</option>)}
                </select>
              </div>
            )}
            {p.accLoanKind === 'lend' && (
              <div>
                <label className="budget-label">Lend from (withdraw from)</label>
                <select className="budget-select" value={p.accLendFrom} onChange={(e) => p.setAccLendFrom(e.target.value)}>
                  <option value="">Select account</option>
                  {p.accounts.filter((a) => !isLoanAccount(a)).map((a) => <option key={a.id} value={a.id}>{stripEmoji(a.name)}</option>)}
                </select>
              </div>
            )}
            {p.accLoanKind && (
              <>
                <div className="budget-input-with">
                  <label className="budget-label">Flat Fee (optional)</label>
                  <span className="prefix">$</span>
                  <input className="budget-input" type="number" step="0.01" value={p.accLoanFee} onChange={(e) => p.setAccLoanFee(e.target.value)} placeholder="0.00" />
                </div>
                <div>
                  <label className="budget-label">APR % (optional)</label>
                  <input className="budget-input" type="number" step="0.01" value={p.accLoanApr} onChange={(e) => p.setAccLoanApr(e.target.value)} placeholder="0.00" />
                </div>
                <div className="budget-input-with">
                  <label className="budget-label">Document Total (optional)</label>
                  <span className="prefix">$</span>
                  <input className="budget-input" type="number" step="0.01" value={p.accLoanDocumentTotal} onChange={(e) => p.setAccLoanDocumentTotal(e.target.value)} placeholder="0.00" />
                </div>
                <div>
                  <label className="budget-label">Term (months, optional)</label>
                  <input className="budget-input" type="number" step="1" value={p.accLoanTermMonths} onChange={(e) => p.setAccLoanTermMonths(e.target.value)} placeholder="0" />
                </div>
              </>
            )}
            <button type="submit" className="budget-btn budget-btn-primary">{p.editingAccountId ? 'Save Changes' : 'Create Account'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ─── Goal Modal ─────────────────────────────────────────────────────────── */
export interface GoalModalProps {
  open: boolean;
  goalName: string; setGoalName: (v: string) => void;
  goalTarget: string; setGoalTarget: (v: string) => void;
  goalCurrent: string; setGoalCurrent: (v: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  onClose: () => void;
}

export function GoalModal(p: GoalModalProps) {
  if (!p.open) return null;
  return (
    <div className="budget-modal" onClick={(e) => { if (e.target === e.currentTarget) p.onClose(); }}>
      <div className="budget-modal-content">
        <div className="budget-modal-header">
          <h2>Add Savings Goal</h2>
          <button className="budget-btn budget-btn-ghost" onClick={p.onClose}>✕</button>
        </div>
        <form onSubmit={p.onSubmit}>
          <div style={{ display: 'grid', gap: 14 }}>
            <div>
              <label className="budget-label">Goal Name</label>
              <input className="budget-input" type="text" value={p.goalName} onChange={(e) => p.setGoalName(e.target.value)} required />
            </div>
            <div className="budget-input-with">
              <label className="budget-label">Target Amount</label>
              <span className="prefix">$</span>
              <input className="budget-input" type="number" step="0.01" value={p.goalTarget} onChange={(e) => p.setGoalTarget(e.target.value)} required />
            </div>
            <div className="budget-input-with">
              <label className="budget-label">Current Amount</label>
              <span className="prefix">$</span>
              <input className="budget-input" type="number" step="0.01" value={p.goalCurrent} onChange={(e) => p.setGoalCurrent(e.target.value)} placeholder="0.00" />
            </div>
            <button type="submit" className="budget-btn budget-btn-primary">Create Goal</button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ─── Settings Modal ─────────────────────────────────────────────────────── */
export interface SettingsModalProps {
  open: boolean;
  autoIncome: boolean;
  excludePropFirm: boolean;
  income: number;
  categories: Category[];
  totalPercent: number;
  unallocatedPct: number;
  onToggleAutoIncome: () => void;
  onSetIncome: (v: number) => void;
  onToggleExcludePropFirm: () => void;
  onUpdateCategory: (id: string, updates: Partial<Category>) => void;
  onDeleteCategory: (id: string) => void;
  onAddCategory: (name: string, percent: number) => void;
  onOpenReset: () => void;
  onClose: () => void;
}

export function SettingsModal(p: SettingsModalProps) {
  if (!p.open) return null;
  return (
    <div className="budget-modal" onClick={(e) => { if (e.target === e.currentTarget) p.onClose(); }}>
      <div className="budget-modal-content">
        <div className="budget-modal-header">
          <h2>Settings</h2>
          <button className="budget-btn budget-btn-ghost" onClick={p.onClose}>✕</button>
        </div>
        <div className="budget-settings-sections">
          {/* Income settings */}
          <div className="budget-settings-section">
            <h3>Income</h3>
            <div style={{ display: 'grid', gap: 10 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                <input type="checkbox" checked={p.autoIncome} onChange={p.onToggleAutoIncome} />
                <span style={{ fontSize: 13 }}>Auto-calculate from income transactions</span>
              </label>
              {!p.autoIncome && (
                <div className="budget-input-with">
                  <label className="budget-label">Monthly Income</label>
                  <span className="prefix">$</span>
                  <input
                    className="budget-input"
                    type="number"
                    value={p.income}
                    onChange={(e) => p.onSetIncome(Number(e.target.value || 0))}
                    disabled={p.autoIncome}
                  />
                </div>
              )}
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                <input type="checkbox" checked={p.excludePropFirm} onChange={p.onToggleExcludePropFirm} />
                <span style={{ fontSize: 13 }}>Exclude "prop firm" / "challenge" from calculations</span>
              </label>
            </div>
          </div>

          {/* Categories management */}
          <div className="budget-settings-section">
            <h3>Categories</h3>
            <div style={{ display: 'grid', gap: 8 }}>
              {p.categories.map((cat) => (
                <div key={cat.id} style={{ display: 'grid', gridTemplateColumns: '1fr 80px auto', gap: 8, alignItems: 'center' }}>
                  <input
                    className="budget-input"
                    type="text"
                    value={cat.name}
                    onChange={(e) => p.onUpdateCategory(cat.id, { name: e.target.value.trim() || 'Category' })}
                  />
                  <input
                    className="budget-input"
                    type="number"
                    step="0.5"
                    min="0"
                    max="100"
                    value={cat.percent}
                    onChange={(e) => p.onUpdateCategory(cat.id, { percent: Math.min(100, Math.max(0, Number(e.target.value || 0))) })}
                    style={{ textAlign: 'right' }}
                  />
                  <button className="budget-btn budget-btn-ghost budget-btn-sm" onClick={() => p.onDeleteCategory(cat.id)}>✕</button>
                </div>
              ))}
              <CategoryAddForm onAdd={p.onAddCategory} />
              <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>
                {p.totalPercent}% allocated · {Math.max(0, p.unallocatedPct)}% unallocated
              </div>
            </div>
          </div>

          {/* Reset / danger zone */}
          <div className="budget-settings-section">
            <h3>Data Management</h3>
            <div className="budget-settings-actions">
              <button className="budget-btn budget-btn-outline" onClick={p.onOpenReset}>Reset Options</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── Reset Modal ────────────────────────────────────────────────────────── */
export interface ResetModalProps {
  open: boolean;
  onResetTransactions: () => void;
  onResetBalances: () => void;
  onResetAll: () => void;
  onClose: () => void;
}

export function ResetModal(p: ResetModalProps) {
  if (!p.open) return null;
  return (
    <div className="budget-modal" onClick={(e) => { if (e.target === e.currentTarget) p.onClose(); }}>
      <div className="budget-modal-content">
        <div className="budget-modal-header">
          <h2>Reset Data</h2>
          <button className="budget-btn budget-btn-ghost" onClick={p.onClose}>✕</button>
        </div>
        <div style={{ display: 'grid', gap: 10 }}>
          <button className="budget-btn budget-btn-outline" onClick={p.onResetTransactions}>Reset All Transactions</button>
          <button className="budget-btn budget-btn-outline" onClick={p.onResetBalances}>Reset All Balances to $0</button>
          <button className="budget-btn budget-btn-danger" onClick={p.onResetAll}>Reset EVERYTHING</button>
        </div>
      </div>
    </div>
  );
}

/* ─── Category Add Form (moved here; used only by SettingsModal) ─────────── */
function CategoryAddForm({ onAdd }: { onAdd: (name: string, percent: number) => void }) {
  const [name, setName] = useState('');
  const [percent, setPercent] = useState('');
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 80px auto', gap: 8, alignItems: 'center' }}>
      <input className="budget-input" type="text" placeholder="New category name" value={name} onChange={(e) => setName(e.target.value)} />
      <input className="budget-input" type="number" step="0.5" min="0" max="100" placeholder="%" value={percent} onChange={(e) => setPercent(e.target.value)} style={{ textAlign: 'right' }} />
      <button
        className="budget-btn budget-btn-primary budget-btn-sm"
        onClick={() => { if (name.trim()) { onAdd(name.trim(), Number(percent || 0)); setName(''); setPercent(''); } }}
      >Add</button>
    </div>
  );
}
