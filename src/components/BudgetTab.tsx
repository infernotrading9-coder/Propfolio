/**
 * BudgetTab — React + TypeScript port of BudgetFlow app.js
 * Features: accounts, transactions, spending breakdown, balance history,
 *           budget planning, savings goals, emergency fund, projections,
 *           spending calendar heatmap, loan management.
 * Theme selector has been removed.
 * Data flows through props (no localStorage); parent persists to API.
 */
import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  Chart,
  Chart as ChartJS,
  registerables,
} from 'chart.js';
import '../budget.css';

// ─── Register Chart.js ──────────────────────────────────────────────────────
ChartJS.register(...registerables);

// ─── Types ──────────────────────────────────────────────────────────────────

export type AccountIcon = 'cash' | 'card' | 'bank' | 'phone' | 'savings' | 'bag' | 'coin' | 'gem' | 'target';
export type AccountColor = 'purple' | 'blue' | 'green' | 'orange' | 'pink' | 'cyan';
export type LoanKind = 'lend' | 'borrow' | 'debt' | 'credit' | '';
export type TxnType = 'income' | 'expense' | 'transfer' | 'adjustment' | 'trade' | 'internal';

export interface SubAccount {
  id: string;
  name: string;
  balance: number;
  isUnallocated?: boolean;
}

export interface Account {
  id: string;
  name: string;
  balance: number;
  icon: AccountIcon | string;
  color: AccountColor;
  loanKind?: LoanKind;
  loanFee?: number;
  loanApr?: number;
  loanOriginal?: number;
  loanDocumentTotal?: number;
  loanTermMonths?: number;
  loanPayoffBalance?: number;
  loanLinkedAccountId?: string;
  goalId?: string;
  goalTarget?: number;
  subAccounts?: SubAccount[];
}

export interface Category {
  id: string;
  name: string;
  percent: number;
}

export interface Transaction {
  id: string;
  name: string;
  amount: number;
  type: TxnType;
  categoryId?: string;
  accountId?: string;
  toAccountId?: string;
  date: string; // YYYY-MM-DD
  excluded?: boolean;
  transferFee?: number;
  delta?: number;
  pnl?: number;
  loanChargeAdded?: boolean;
  loanPaymentApplied?: number;
  loanPrincipalPaid?: number;
  loanInterestPaid?: number;
  fromSubId?: string;
  toSubId?: string;
  parentAccountId?: string;
}

export interface SavingsGoal {
  id: string;
  name: string;
  target: number;
  current: number;
  accountId: string;
}

export interface CompletedGoal extends SavingsGoal {
  completedDate: string;
  finalAmount: number;
}

export interface BudgetState {
  income: number;
  autoIncome: boolean;
  excludePropFirm: boolean;
  categories: Category[];
  transactions: Transaction[];
  accounts: Account[];
  savingsGoals: SavingsGoal[];
  completedGoals: CompletedGoal[];
}

export interface BudgetTabProps {
  state?: BudgetState;
  onChange?: (newState: BudgetState) => void;
}

// ─── Utilities ─────────────────────────────────────────────────────────────

const fmt = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 2,
});

function uid(): string {
  return Math.random().toString(36).slice(2, 9);
}

function round2(n: number): number {
  return Math.round((Number(n) || 0) * 100) / 100;
}

function formatLocalDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function parseLocalDateString(s: string): Date {
  const [y, m, d] = String(s).split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

// escapeHtml not needed — React handles HTML escaping by default

function stripEmoji(str: string): string {
  try {
    const emojiRegex = /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}\u{FE00}-\u{FE0F}\u{200D}]/gu;
    return String(str).replace(emojiRegex, '').trim();
  } catch {
    return String(str);
  }
}

function accountTypeFromValue(val: string): AccountIcon {
  const allowed: AccountIcon[] = ['cash', 'card', 'bank', 'phone', 'savings', 'bag', 'coin', 'gem', 'target'];
  if (allowed.includes(val as AccountIcon)) return val as AccountIcon;
  const map: Record<string, AccountIcon> = {
    '💵': 'cash', '💳': 'card', '🏦': 'bank', '📱': 'phone',
    '🏦 Savings': 'savings', '💰': 'bag', '🪙': 'coin', '💎': 'gem', '🎯': 'target',
  };
  return map[val] || 'cash';
}

function getThemeColorForType(kind: AccountIcon): AccountColor {
  switch (kind) {
    case 'cash': return 'green';
    case 'card': return 'cyan';
    case 'bank': return 'blue';
    case 'savings': return 'green';
    case 'phone': return 'cyan';
    case 'bag': return 'orange';
    case 'coin': return 'cyan';
    case 'gem': return 'pink';
    case 'target': return 'purple';
    default: return 'purple';
  }
}

function isLoanAccount(acc: Account | null | undefined): boolean {
  return !!acc && (acc.loanKind === 'lend' || acc.loanKind === 'borrow' || acc.loanKind === 'debt' || acc.loanKind === 'credit');
}

function isBorrowLiabilityLoan(acc: Account | null | undefined): boolean {
  return !!acc && (acc.loanKind === 'borrow' || acc.loanKind === 'debt' || acc.loanKind === 'credit');
}

function displayBalance(acc: Account | null | undefined): number {
  if (!acc) return 0;
  return round2(Number(acc.balance || 0));
}

function calculateLoanAmortization(principal: number, apr: number, termMonths: number, fee: number) {
  const p = round2(Number(principal || 0));
  const a = Math.max(0, Number(apr || 0));
  const f = round2(Number(fee || 0));
  const t = Math.max(0, Math.round(Number(termMonths || 0)));
  if (p <= 0 || t <= 0) return null;
  if (a <= 0) {
    const monthly = round2(p / t);
    return { termMonths: t, monthlyPayment: monthly, totalInterest: 0, totalWithoutFee: p, totalWithFee: round2(p + f) };
  }
  const rate = a / 100 / 12;
  const monthly = p * (rate / (1 - Math.pow(1 + rate, -t)));
  const total = round2(monthly * t);
  return { termMonths: t, monthlyPayment: round2(monthly), totalInterest: round2(total - p), totalWithoutFee: total, totalWithFee: round2(total + f) };
}

function getLoanStartingPayoff(acc: Account): number {
  if (!acc) return 0;
  const principal = Math.max(0, round2(Number(acc.loanOriginal != null ? acc.loanOriginal : acc.balance || 0)));
  const docTotal = acc.loanDocumentTotal != null ? round2(Number(acc.loanDocumentTotal || 0)) : undefined;
  if (docTotal != null) return Math.max(principal, docTotal);
  const amortized = calculateLoanAmortization(principal, acc.loanApr || 0, acc.loanTermMonths || 0, acc.loanFee || 0);
  if (amortized) return Math.max(principal, round2(Number(amortized.totalWithFee || 0)));
  return Math.max(principal, round2(principal + Number(acc.loanFee || 0)));
}

function getLoanRemainingPayoff(acc: Account | null | undefined): number {
  if (!acc || !isBorrowLiabilityLoan(acc)) return Math.max(0, displayBalance(acc));
  const principal = Math.max(0, displayBalance(acc));
  const payoff = acc.loanPayoffBalance != null ? round2(Number(acc.loanPayoffBalance || 0)) : principal;
  return Math.max(principal, payoff);
}

function toOptionalMoney(value: string | number | undefined): number | undefined {
  if (value == null || value === '') return undefined;
  const amount = round2(Number(value));
  return amount > 0 ? amount : undefined;
}

function toOptionalTermMonths(value: string | number | undefined): number | undefined {
  if (value == null || value === '') return undefined;
  const months = Math.round(Number(value));
  return months > 0 ? months : undefined;
}

// ─── Levenshtein / name clustering ──────────────────────────────────────────

function normalizeSpendingName(name: string): string {
  return String(name || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function levenshteinDistance(s: string, t: string): number {
  const m = s.length, n = t.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const dp = new Array(n + 1);
  for (let j = 0; j <= n; j++) dp[j] = j;
  for (let i = 1; i <= m; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= n; j++) {
      const tmp = dp[j];
      const cost = s.charAt(i - 1) === t.charAt(j - 1) ? 0 : 1;
      dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + cost);
      prev = tmp;
    }
  }
  return dp[n];
}

function isLikelyTypo(a: string, b: string): boolean {
  const na = normalizeSpendingName(a);
  const nb = normalizeSpendingName(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  const wa = na.split(' ')[0] || '';
  const wb = nb.split(' ')[0] || '';
  if (!wa || wa !== wb) return false;
  const dist = levenshteinDistance(na, nb);
  const maxLen = Math.max(na.length, nb.length);
  return dist > 0 && dist <= 2 && maxLen >= 4;
}

function buildNameClusters(names: string[]) {
  const uniques = Array.from(new Set(names));
  const canonicalFor: Record<string, string> = {};
  const clusters: { canonical: string; variants: string[] }[] = [];
  uniques.forEach((name) => {
    let matched: { canonical: string; variants: string[] } | null = null;
    for (const cluster of clusters) {
      if (isLikelyTypo(cluster.canonical, name)) { matched = cluster; break; }
    }
    if (matched) {
      if (!matched.variants.includes(name)) matched.variants.push(name);
    } else {
      matched = { canonical: name, variants: [name] };
      clusters.push(matched);
    }
    canonicalFor[name] = matched.canonical;
  });
  const clustersByCanonical: Record<string, { canonical: string; variants: string[] }> = {};
  clusters.forEach((c) => { clustersByCanonical[c.canonical] = c; });
  return { canonicalFor, clustersByCanonical };
}

function getMostCommonDay(days: number[]): string | null {
  if (days.length === 0) return null;
  const counts: Record<number, number> = {};
  days.forEach((d) => { counts[d] = (counts[d] || 0) + 1; });
  const maxDay = Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  return dayNames[Number(maxDay)];
}

// ─── Account Icon SVGs ──────────────────────────────────────────────────────

function AccountIconSvg({ icon }: { icon: string }) {
  const kind = accountTypeFromValue(icon);
  // SVG attributes are applied directly in JSX
  void kind; // used in switch below
  switch (kind) {
    case 'card':
      return <svg className="icon-svg" viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" rx="3" ry="3" width="18" height="14" {...{ stroke: 'currentColor', strokeWidth: 1.6 }} fill="none" /><path d="M3 10h18" stroke="currentColor" strokeWidth={1.6} /><path d="M7.5 15h3" stroke="currentColor" strokeWidth={1.6} /></svg>;
    case 'bank':
      return <svg className="icon-svg" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 10h16M6 10v7M10 10v7M14 10v7M18 10v7M3 10l9-5 9 5M4 17h16" stroke="currentColor" strokeWidth={1.6} fill="none" strokeLinecap="round" /></svg>;
    case 'savings':
      return <svg className="icon-svg" viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="5" width="16" height="14" rx="2" stroke="currentColor" strokeWidth={1.6} fill="none" /><circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth={1.6} fill="none" /><path d="M6 19v2M18 19v2" stroke="currentColor" strokeWidth={1.6} /></svg>;
    case 'phone':
      return <svg className="icon-svg" viewBox="0 0 24 24" aria-hidden="true"><rect x="7" y="3" width="10" height="18" rx="2" stroke="currentColor" strokeWidth={1.6} fill="none" /><path d="M10 5h4" stroke="currentColor" strokeWidth={1.6} /><circle cx="12" cy="18" r="1" stroke="currentColor" strokeWidth={1.6} fill="none" /></svg>;
    case 'bag':
      return <svg className="icon-svg" viewBox="0 0 24 24" aria-hidden="true"><path d="M8 7h8l1.6 3.5a2 2 0 0 1 .2.9V18a3 3 0 0 1-3 3H9.2A3.2 3.2 0 0 1 6 17.8V11.4a2 2 0 0 1 .2-.9L8 7z" stroke="currentColor" strokeWidth={1.6} fill="none" /><path d="M9 7a3 3 0 0 1 6 0" stroke="currentColor" strokeWidth={1.6} fill="none" /></svg>;
    case 'coin':
      return <svg className="icon-svg" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="6.5" stroke="currentColor" strokeWidth={1.6} fill="none" /><path d="M9 12h6M12 9v6" stroke="currentColor" strokeWidth={1.6} /></svg>;
    case 'gem':
      return <svg className="icon-svg" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 6h10l3 4-8 8-8-8 3-4zM7 6l5 12 5-12" stroke="currentColor" strokeWidth={1.6} fill="none" strokeLinecap="round" /></svg>;
    case 'target':
      return <svg className="icon-svg" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="7" stroke="currentColor" strokeWidth={1.6} fill="none" /><circle cx="12" cy="12" r="3.5" stroke="currentColor" strokeWidth={1.6} fill="none" /><circle cx="12" cy="12" r="1" stroke="currentColor" strokeWidth={1.6} fill="none" /></svg>;
    default:
      return <svg className="icon-svg" viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="7" width="18" height="10" rx="2.5" stroke="currentColor" strokeWidth={1.6} fill="none" /><path d="M6 7V6a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v1" stroke="currentColor" strokeWidth={1.6} fill="none" /><circle cx="16" cy="12" r="1.5" stroke="currentColor" strokeWidth={1.6} fill="none" /></svg>;
  }
}

// ─── Palette for Chart.js ────────────────────────────────────────────────────
// Propfolio theme palette (purple/cyan/pink/lime/amber)

function palette(n: number): { bg: string[]; border: string[] } {
  const colors = ['#a855f7', '#22d3ee', '#f472b6', '#a3e635', '#f59e0b', '#8b5cf6', '#06b6d4', '#ec4899', '#84cc16', '#fbbf24', '#7c3aed', '#14b8a6'];
  const bg: string[] = [];
  const border: string[] = [];
  for (let i = 0; i < n; i++) {
    bg.push(colors[i % colors.length]);
    border.push('rgba(255, 255, 255, 0.9)');
  }
  return { bg, border };
}

function percentOf(arr: number[], val: number): number {
  const sum = arr.reduce((a, b) => a + b, 0);
  return sum ? Math.round((val / sum) * 100) : 0;
}

// ─── Crosshair focus plugin for Chart.js ─────────────────────────────────────

const crosshairFocusPlugin: any = {
  id: 'crosshairFocus',
  afterEvent(chart: any, args: any) {
    const opts = chart?.options?.plugins?.crosshairFocus;
    if (!opts || opts.enable !== true) return;
    const e = args.event;
    if (!e) return;
    if (e.type === 'mousemove') {
      const elements = chart.getElementsAtEventForMode(e, 'nearest', { intersect: false }, false);
      const idx = elements?.[0]?.index ?? null;
      if (idx !== chart.$hoverIndex) {
        chart.$hoverIndex = idx;
        chart.update('none');
      }
    } else if (e.type === 'mouseout' || e.type === 'mouseleave') {
      if (chart.$hoverIndex != null) {
        chart.$hoverIndex = null;
        chart.update('none');
      }
    }
  },
  afterDatasetsDraw(chart: any, _args: any, pluginOpts: any) {
    if (!pluginOpts || pluginOpts.enable !== true) return;
    const meta = chart.getDatasetMeta(0);
    if (!meta || !meta.data) return;
    const ctx = chart.ctx;
    const { top, bottom } = chart.chartArea;
    const hi = chart.$hoverIndex;
    if (hi != null && meta.data[hi]) {
      const pt = meta.data[hi];
      ctx.save();
      ctx.strokeStyle = 'rgba(148,163,184,0.35)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(pt.x + 0.5, top);
      ctx.lineTo(pt.x + 0.5, bottom);
      ctx.stroke();
      ctx.shadowColor = 'rgba(168,85,247,0.5)';
      ctx.shadowBlur = 10;
      ctx.fillStyle = '#a855f7';
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.strokeStyle = 'rgba(168,85,247,0.4)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, 7, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  },
};

// ─── Sub-components ──────────────────────────────────────────────────────────

/** Account card with 3D tilt, drag-and-drop, icon */
function AccountCard({
  acc,
  onDoubleClick,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDragLeave,
  onDrop,
}: {
  acc: Account;
  onDoubleClick: () => void;
  onDragStart: (e: React.DragEvent) => void;
  onDragEnd: () => void;
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: () => void;
  onDrop: (e: React.DragEvent) => void;
}) {
  const cardRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number>(0);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    const card = cardRef.current;
    if (!card || card.classList.contains('dragging')) return;
    const r = card.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width;
    const py = (e.clientY - r.top) / r.height;
    const rx = (0.5 - py) * 24;
    const ry = (px - 0.5) * 24;
    cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => {
      card.style.transform = `perspective(900px) rotateX(${rx.toFixed(2)}deg) rotateY(${ry.toFixed(2)}deg)`;
    });
  }, []);

  const handleMouseLeave = useCallback(() => {
    const card = cardRef.current;
    if (!card) return;
    cancelAnimationFrame(rafRef.current);
    card.style.transform = '';
  }, []);

  useEffect(() => {
    return () => cancelAnimationFrame(rafRef.current);
  }, []);

  const fullBalance = displayBalance(acc);
  const balanceColor = fullBalance < 0 ? { color: '#ef4444' } : {};
  const colorClass = acc.color || 'purple';

  // Goal progress extra HTML
  let extra: React.ReactNode = null;
  if (acc.goalId && acc.goalTarget) {
    const progress = Math.min(100, round2((fullBalance / acc.goalTarget) * 100));
    extra = (
      <div style={{ marginTop: 8 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--muted)', marginBottom: 4 }}>
          <span>Goal Progress</span>
          <span>{progress}%</span>
        </div>
        <div style={{ height: 6, background: 'rgba(0,0,0,0.3)', borderRadius: 999, overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${progress}%`, background: 'linear-gradient(90deg,#a3e635,#10b981)', transition: 'width 0.5s ease' }} />
        </div>
        <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 4, textAlign: 'center' }}>
          {fmt.format(fullBalance)} / {fmt.format(acc.goalTarget)}
        </div>
      </div>
    );
  } else if (isLoanAccount(acc) && (acc.loanOriginal || 0) > 0) {
    const total = round2(Number(acc.loanOriginal || 0));
    const remaining = Math.max(0, fullBalance);
    const paidPct = total > 0 ? Math.min(100, Math.max(0, round2((1 - remaining / total) * 100))) : 0;
    const roleLabel = acc.loanKind === 'lend' ? 'They have repaid' : 'You have repaid';
    const payoffRemaining = isBorrowLiabilityLoan(acc) ? getLoanRemainingPayoff(acc) : remaining;
    const fee = Number(acc.loanFee || 0);
    const apr = Number(acc.loanApr || 0);
    let metaRight = '';
    if (fee > 0 && apr > 0) metaRight = `Flat fee: ${fmt.format(fee)} · APR: ${apr.toFixed(2)}%`;
    else if (fee > 0) metaRight = `Flat fee: ${fmt.format(fee)}`;
    else if (apr > 0) metaRight = `APR: ${apr.toFixed(2)}%`;
    extra = (
      <div style={{ marginTop: 8 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--muted)', marginBottom: 4 }}>
          <span>{roleLabel}: {paidPct}%</span>
          {metaRight ? <span>{metaRight}</span> : null}
        </div>
        <div style={{ height: 6, background: 'rgba(0,0,0,0.3)', borderRadius: 999, overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${paidPct}%`, background: 'linear-gradient(90deg,#f97316,#fb923c)', transition: 'width 0.5s ease' }} />
        </div>
        <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 4, textAlign: 'center' }}>
          {fmt.format(remaining)} principal remaining of {fmt.format(total)}
          {isBorrowLiabilityLoan(acc) ? <br /> : null}
          {isBorrowLiabilityLoan(acc) ? `${fmt.format(payoffRemaining)} payoff remaining` : null}
        </div>
      </div>
    );
  }

  return (
    <div
      ref={cardRef}
      className={`budget-account-card ${colorClass}`}
      draggable
      onDoubleClick={onDoubleClick}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      title="Double-click to view details"
    >
      <div className="budget-card-top">
        <div className="budget-icon-wrap">
          <AccountIconSvg icon={acc.icon || 'cash'} />
        </div>
        <div className="name">{stripEmoji(acc.name)}</div>
      </div>
      <div className="budget-card-bottom">
        <div className="balance" style={balanceColor} title="Double-click to adjust">
          {fmt.format(fullBalance)}
        </div>
      </div>
      {extra}
      <div className="circuit" aria-hidden="true" />
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────

const defaultBudgetState: BudgetState = {
  income: 0,
  autoIncome: false,
  excludePropFirm: true,
  categories: [
    { id: 'needs', name: 'Needs', percent: 50 },
    { id: 'wants', name: 'Wants', percent: 30 },
  ],
  transactions: [],
  accounts: [],
  savingsGoals: [],
  completedGoals: [],
};

const BudgetTab: React.FC<BudgetTabProps> = ({ state: propState, onChange }) => {
  const [internalState, setInternalState] = useState<BudgetState>(propState || defaultBudgetState);
  const state = propState || internalState;
  const handleChange = onChange || ((newState: BudgetState) => setInternalState(newState));
  // ─── Modal state ─────────────────────────────────────────────────────────
  const [showTxnModal, setShowTxnModal] = useState(false);
  const [showAccountModal, setShowAccountModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showGoalModal, setShowGoalModal] = useState(false);
  const [showResetModal, setShowResetModal] = useState(false);
  const [showBreakdown, setShowBreakdown] = useState(false);

  // ─── Transaction modal state ──────────────────────────────────────────────
  const [editingTxn, setEditingTxn] = useState<Transaction | null>(null);
  const [txnName, setTxnName] = useState('');
  const [txnAmount, setTxnAmount] = useState('');
  const [txnType, setTxnType] = useState<TxnType>('expense');
  const [txnAccountId, setTxnAccountId] = useState('');
  const [txnToAccountId, setTxnToAccountId] = useState('');
  const [txnTransferFee, setTxnTransferFee] = useState('');
  const [txnCategoryId, setTxnCategoryId] = useState('');
  const [txnDate, setTxnDate] = useState(formatLocalDate(new Date()));
  const [txnExcluded, setTxnExcluded] = useState(false);
  const [txnNameSuggestionsList, setTxnNameSuggestionsList] = useState<string[]>([]);
  const [showNameSuggestions, setShowNameSuggestions] = useState(false);

  // ─── Account modal state ──────────────────────────────────────────────────
  const [accName, setAccName] = useState('');
  const [accBalance, setAccBalance] = useState('');
  const [accType, setAccType] = useState<AccountIcon>('cash');
  const [accLoanKind, setAccLoanKind] = useState<LoanKind>('');
  const [accLoanFee, setAccLoanFee] = useState('');
  const [accLoanApr, setAccLoanApr] = useState('');
  const [accLoanDocumentTotal, setAccLoanDocumentTotal] = useState('');
  const [accLoanTermMonths, setAccLoanTermMonths] = useState('');
  const [accBorrowTo, setAccBorrowTo] = useState('');
  const [accLendFrom, setAccLendFrom] = useState('');
  const [editingAccountId, setEditingAccountId] = useState<string | null>(null);

  // ─── Goal modal state ─────────────────────────────────────────────────────
  const [goalName, setGoalName] = useState('');
  const [goalTarget, setGoalTarget] = useState('');
  const [goalCurrent, setGoalCurrent] = useState('');

  // ─── Filters ──────────────────────────────────────────────────────────────
  const [currentTimeFrame, setCurrentTimeFrame] = useState<'week' | 'month' | 'quarter' | 'year'>('month');
  const [txnFilter, setTxnFilter] = useState<'month' | 'year' | 'all'>('month');
  const [txnDayFilter, setTxnDayFilter] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [heatmapMonthOffset, setHeatmapMonthOffset] = useState(0);
  const transactionsPerPage = 20;

  // ─── Chart refs ────────────────────────────────────────────────────────────
  const allocChartRef = useRef<HTMLCanvasElement>(null);
  const allocChartInstance = useRef<Chart | null>(null);
  const balanceChartRef = useRef<HTMLCanvasElement>(null);
  const balanceChartInstance = useRef<Chart | null>(null);

  // ─── Derived data ──────────────────────────────────────────────────────────
  const totalPercent = useMemo(() => round2(state.categories.reduce((a, c) => a + Number(c.percent || 0), 0)), [state.categories]);
  const unallocatedPct = useMemo(() => round2(100 - totalPercent), [totalPercent]);

  const budgetAmount = useCallback((percent: number) => round2(state.income * (Number(percent) || 0) / 100), [state.income]);

  const categoryBudgetMap = useMemo(() => {
    const map: Record<string, number> = {};
    state.categories.forEach((c) => { map[c.id] = budgetAmount(c.percent); });
    return map;
  }, [state.categories, budgetAmount]);

  const incomesThisMonthTotal = useMemo(() => {
    const now = new Date();
    const m = now.getMonth(), y = now.getFullYear();
    return round2(state.transactions.reduce((a, t) => {
      if (t.type !== 'income') return a;
      const d = parseLocalDateString(t.date);
      return d.getMonth() === m && d.getFullYear() === y ? a + Number(t.amount || 0) : a;
    }, 0));
  }, [state.transactions]);

  const expensesThisMonthTotal = useMemo(() => {
    const now = new Date();
    const m = now.getMonth(), y = now.getFullYear();
    return round2(state.transactions.reduce((a, t) => {
      if (t.type !== 'expense') return a;
      const d = parseLocalDateString(t.date);
      if (d.getMonth() === m && d.getFullYear() === y) {
        const name = String(t.name || '').toLowerCase();
        const catName = String((state.categories.find((c) => c.id === t.categoryId)?.name) || '').toLowerCase();
        if (t.excluded || (state.excludePropFirm && (name.includes('prop firm') || name.includes('challenge') || catName.includes('prop firm')))) return a;
        return a + Number(t.amount || 0);
      }
      return a;
    }, 0));
  }, [state.transactions, state.categories, state.excludePropFirm]);

  // tradingPnLThisMonth is not displayed in the current UI layout

  const netCashFlow = useMemo(() => round2(incomesThisMonthTotal - expensesThisMonthTotal), [incomesThisMonthTotal, expensesThisMonthTotal]);

  const avgDailySpend = useMemo(() => {
    const now = new Date();
    const currentDay = now.getDate();
    return currentDay > 0 ? round2(expensesThisMonthTotal / currentDay) : 0;
  }, [expensesThisMonthTotal]);

  const sumBudgeted = useMemo(() => round2(state.categories.reduce((a, c) => a + budgetAmount(c.percent), 0)), [state.categories, budgetAmount]);

  const spentByCategoryMap = useMemo(() => {
    const map: Record<string, number> = {};
    state.categories.forEach((c) => { map[c.id] = 0; });
    const now = new Date();
    const m = now.getMonth(), y = now.getFullYear();
    state.transactions.forEach((t) => {
      if (t.type !== 'expense') return;
      const d = parseLocalDateString(t.date);
      if (d.getMonth() === m && d.getFullYear() === y && map[t.categoryId!] != null) {
        const name = String(t.name || '').toLowerCase();
        const catName = String((state.categories.find((c) => c.id === t.categoryId)?.name) || '').toLowerCase();
        if (t.excluded || (state.excludePropFirm && (name.includes('prop firm') || name.includes('challenge') || catName.includes('prop firm')))) return;
        map[t.categoryId!] += Number(t.amount || 0);
      }
    });
    // Prop Stash inflows
    const stashCat = state.categories.find((c) => /prop\s*stash/i.test(String(c.name || '')));
    const stashAcc = state.accounts.find((a) => /prop\s*stash/i.test(String(a.name || '')));
    if (stashCat && stashAcc) {
      let monthInflows = 0;
      state.transactions.forEach((t) => {
        if (t.type !== 'transfer' || t.toAccountId !== stashAcc.id) return;
        const d = parseLocalDateString(t.date);
        if (d.getMonth() !== m || d.getFullYear() !== y) return;
        if (t.excluded) return;
        const amt = Math.max(0, Number(t.amount || 0) - Number(t.transferFee || 0));
        if (amt > 0) monthInflows += amt;
      });
      if (monthInflows > 0) {
        if (map[stashCat.id] == null) map[stashCat.id] = 0;
        map[stashCat.id] += monthInflows;
      }
    }
    Object.keys(map).forEach((k) => { map[k] = round2(map[k]); });
    return map;
  }, [state.transactions, state.categories, state.accounts, state.excludePropFirm]);

  // totalSpent is available for future use; not currently rendered
  const _totalSpent = useMemo(() => round2(state.transactions
    .filter((t) => t.type === 'expense' && !(t.excluded || (state.excludePropFirm && String(t.name || '').toLowerCase().includes('prop firm'))))
    .reduce((a, t) => a + Number(t.amount || 0), 0)), [state.transactions, state.excludePropFirm]);
  void _totalSpent;

  // ─── Average monthly income / expenses ─────────────────────────────────────
  const getAverageMonthlyIncome = useCallback(() => {
    const incomeByMonth: Record<string, number> = {};
    state.transactions.forEach((t) => {
      if (t.type !== 'income') return;
      const d = parseLocalDateString(t.date);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      incomeByMonth[key] = (incomeByMonth[key] || 0) + Number(t.amount || 0);
    });
    const months = Object.keys(incomeByMonth);
    if (months.length === 0) return 0;
    return round2(Object.values(incomeByMonth).reduce((a, b) => a + b, 0) / months.length);
  }, [state.transactions]);

  const getAverageMonthlyExpenses = useCallback(() => {
    const expensesByMonth: Record<string, number> = {};
    state.transactions.forEach((t) => {
      if (t.type !== 'expense') return;
      const name = String(t.name || '').toLowerCase();
      const catName = String((state.categories.find((c) => c.id === t.categoryId)?.name) || '').toLowerCase();
      if (t.excluded || (state.excludePropFirm && (name.includes('prop firm') || name.includes('challenge') || catName.includes('prop firm')))) return;
      const d = parseLocalDateString(t.date);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      expensesByMonth[key] = (expensesByMonth[key] || 0) + Number(t.amount || 0);
    });
    const months = Object.keys(expensesByMonth);
    if (months.length === 0) return 0;
    return round2(Object.values(expensesByMonth).reduce((a, b) => a + b, 0) / months.length);
  }, [state.transactions, state.categories, state.excludePropFirm]);

  const getAverageMonthlyLivingExpenses = useCallback(() => {
    const expensesByMonth: Record<string, number> = {};
    const investmentKeywords = ['futures', 'crypto', 'prop firm', 'options', 'trading', 'leverage', 'challenge'];
    state.transactions.forEach((t) => {
      if (t.type !== 'expense') return;
      const txnName = String(t.name || '').toLowerCase();
      const cat = state.categories.find((c) => c.id === t.categoryId);
      const catName = cat ? String(cat.name || '').toLowerCase() : '';
      const combinedText = txnName + ' ' + catName;
      const isInvestmentRelated = investmentKeywords.some((kw) => combinedText.includes(kw));
      if (t.excluded || (state.excludePropFirm && isInvestmentRelated)) return;
      const d = parseLocalDateString(t.date);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      expensesByMonth[key] = (expensesByMonth[key] || 0) + Number(t.amount || 0);
    });
    const months = Object.keys(expensesByMonth);
    if (months.length === 0) return 0;
    return round2(Object.values(expensesByMonth).reduce((a, b) => a + b, 0) / months.length);
  }, [state.transactions, state.categories, state.excludePropFirm]);

  // ─── Last month totals for trend ───────────────────────────────────────────
  const getLastMonthTotals = useCallback(() => {
    const now = new Date();
    const lastMonth = now.getMonth() === 0 ? 11 : now.getMonth() - 1;
    const lastMonthYear = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();
    let income = 0, expenses = 0, tradePnL = 0;
    state.transactions.forEach((t) => {
      const d = parseLocalDateString(t.date);
      if (d.getMonth() === lastMonth && d.getFullYear() === lastMonthYear) {
        if (t.type === 'income') income += Number(t.amount || 0);
        else if (t.type === 'expense') expenses += Number(t.amount || 0);
        else if (t.type === 'trade') tradePnL += Number(t.pnl || 0);
      }
    });
    return { income: round2(income), expenses: round2(expenses), tradePnL: round2(tradePnL) };
  }, [state.transactions]);

  const getTrendHTML = (current: number, previous: number, inverse = false): React.ReactNode => {
    if (previous === 0) return null;
    const diff = current - previous;
    const pct = Math.abs(round2((diff / previous) * 100));
    if (Math.abs(diff) < 0.01) return <span style={{ color: 'var(--muted)', fontSize: 11, marginLeft: 6 }}>→ 0%</span>;
    const isGood = inverse ? diff < 0 : diff > 0;
    const arrow = diff > 0 ? '↗' : '↘';
    const color = isGood ? '#a3e635' : '#ef4444';
    return <span style={{ color, fontSize: 11, marginLeft: 6, fontWeight: 600 }}>{arrow} {pct}%</span>;
  };

  // ─── Spending breakdown by name ───────────────────────────────────────────
  const spendingBreakdown = useMemo(() => {
    const now = new Date();
    const m = now.getMonth(), y = now.getFullYear();
    const lastMonth = m === 0 ? 11 : m - 1;
    const lastMonthYear = m === 0 ? y - 1 : y;
    const currentExpenses: { name: string; amount: number; dayIndex: number }[] = [];
    const lastMonthExpenses: { name: string; amount: number }[] = [];
    state.transactions.forEach((t) => {
      if (t.type !== 'expense') return;
      const d = parseLocalDateString(t.date);
      const rawName = (t.name || '').trim() || 'Unnamed';
      if (d.getMonth() === m && d.getFullYear() === y) {
        const name = rawName.toLowerCase();
        if (t.excluded || (state.excludePropFirm && (name.includes('prop firm') || name.includes('challenge')))) return;
        currentExpenses.push({ name: rawName, amount: Number(t.amount || 0), dayIndex: d.getDay() });
      }
      if (d.getMonth() === lastMonth && d.getFullYear() === lastMonthYear) {
        const name = rawName.toLowerCase();
        if (t.excluded || (state.excludePropFirm && (name.includes('prop firm') || name.includes('challenge')))) return;
        lastMonthExpenses.push({ name: rawName, amount: Number(t.amount || 0) });
      }
    });
    if (currentExpenses.length === 0 && lastMonthExpenses.length === 0) return [];
    const allNames = Array.from(new Set([...currentExpenses, ...lastMonthExpenses].map((e) => e.name)));
    const { canonicalFor, clustersByCanonical } = buildNameClusters(allNames);
    const byName: Record<string, { amount: number; count: number; days: number[] }> = {};
    const lastMonthByName: Record<string, number> = {};
    currentExpenses.forEach((e) => {
      const key = canonicalFor[e.name] || e.name;
      if (!byName[key]) byName[key] = { amount: 0, count: 0, days: [] };
      byName[key].amount += e.amount;
      byName[key].count++;
      byName[key].days.push(e.dayIndex);
    });
    lastMonthExpenses.forEach((e) => {
      const key = canonicalFor[e.name] || e.name;
      lastMonthByName[key] = (lastMonthByName[key] || 0) + e.amount;
    });
    return Object.entries(byName).map(([name, data]) => {
      const lastMonthAmt = lastMonthByName[name] || 0;
      const diff = round2(data.amount - lastMonthAmt);
      const mostCommonDay = getMostCommonDay(data.days);
      const cluster = clustersByCanonical[name];
      const variants = cluster ? cluster.variants.filter((v) => v !== name) : [];
      return { name, amount: round2(data.amount), count: data.count, lastMonth: round2(lastMonthAmt), diff, trend: diff > 0 ? 'up' : diff < 0 ? 'down' : 'same', mostCommonDay, variants };
    }).sort((a, b) => b.amount - a.amount);
  }, [state.transactions, state.excludePropFirm]);

  // ─── Unique transaction names for suggestions ─────────────────────────────
  const uniqueTxnNames = useMemo(() => {
    const nameCount: Record<string, number> = {};
    state.transactions.forEach((t) => {
      if (!t.name || !t.name.trim()) return;
      const name = t.name.trim();
      if (name.startsWith('Transfer:') || name.startsWith('Internal') || name.startsWith('Adjustment')) return;
      nameCount[name] = (nameCount[name] || 0) + 1;
    });
    return Object.entries(nameCount).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([name]) => name);
  }, [state.transactions]);

  // ─── Total balance & debt ─────────────────────────────────────────────────
  const totalBalance = useMemo(() => round2(state.accounts.reduce((a, acc) => isLoanAccount(acc) ? a : a + displayBalance(acc), 0)), [state.accounts]);
  const totalDebt = useMemo(() => round2(state.accounts.reduce((a, acc) => isBorrowLiabilityLoan(acc) ? a + getLoanRemainingPayoff(acc) : a, 0)), [state.accounts]);

  // ─── Emergency fund ───────────────────────────────────────────────────────
  const emergencyFund = useMemo(() => {
    const avgExpenses = getAverageMonthlyLivingExpenses();
    const recommended = round2(avgExpenses * 6);
    const investmentTypes = new Set(['bag', 'coin', 'gem']);
    const current = round2(state.accounts.reduce((a, acc) => {
      if (isLoanAccount(acc)) return a;
      const accType = accountTypeFromValue(acc.icon || '');
      if (investmentTypes.has(accType)) return a;
      return a + displayBalance(acc);
    }, 0));
    const progress = recommended > 0 ? Math.min(100, round2((current / recommended) * 100)) : 100;
    return { recommended, current, progress };
  }, [state.accounts, getAverageMonthlyLivingExpenses]);

  // ─── Balance projection ────────────────────────────────────────────────────
  const projection = useMemo(() => {
    const avgIncome = getAverageMonthlyIncome();
    const avgExpenses = getAverageMonthlyExpenses();
    const currentBalance = round2(state.accounts.reduce((a, acc) => isLoanAccount(acc) ? a : a + displayBalance(acc), 0));
    const monthlySavings = round2(avgIncome - avgExpenses);
    return {
      current: currentBalance,
      in3: round2(currentBalance + monthlySavings * 3),
      in6: round2(currentBalance + monthlySavings * 6),
      in12: round2(currentBalance + monthlySavings * 12),
      monthlySavings,
    };
  }, [state.accounts, state.transactions, getAverageMonthlyIncome, getAverageMonthlyExpenses]);

  // ─── Balance history ────────────────────────────────────────────────────────
  const balanceHistory = useMemo(() => {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    let days = 7;
    if (currentTimeFrame === 'month') days = 30;
    else if (currentTimeFrame === 'quarter') days = 90;
    else if (currentTimeFrame === 'year') days = 365;
    const accountStartBalances: Record<string, number> = {};
    state.accounts.forEach((acc) => {
      if (isLoanAccount(acc)) return;
      accountStartBalances[acc.id] = Number(acc.balance || 0);
    });
    const dataPoints: { date: string; balance: number }[] = [];
    for (let i = days - 1; i >= 0; i--) {
      const date = new Date(now);
      date.setDate(date.getDate() - i);
      date.setHours(0, 0, 0, 0);
      const dateStr = formatLocalDate(date);
      const accountBalances = { ...accountStartBalances };
      state.transactions.forEach((t) => {
        if (t.date > dateStr) {
          if (t.type === 'income') {
            if (accountBalances[t.accountId!] != null) accountBalances[t.accountId!] -= Number(t.amount || 0);
          } else if (t.type === 'expense') {
            if (accountBalances[t.accountId!] != null) accountBalances[t.accountId!] += Number(t.amount || 0);
          } else if (t.type === 'adjustment') {
            if (accountBalances[t.accountId!] != null) accountBalances[t.accountId!] -= Number(t.delta || 0);
          } else if (t.type === 'trade') {
            if (accountBalances[t.accountId!] != null) accountBalances[t.accountId!] -= Number(t.pnl || 0);
          }
        }
      });
      const total = Object.values(accountBalances).reduce((sum, bal) => sum + bal, 0);
      dataPoints.push({ date: dateStr, balance: round2(total) });
    }
    return dataPoints;
  }, [state.accounts, state.transactions, currentTimeFrame]);

  // ─── Filtered transactions ─────────────────────────────────────────────────
  const filteredTransactions = useMemo(() => {
    const now = new Date();
    const m = now.getMonth(), y = now.getFullYear();
    return state.transactions.filter((t) => {
      if (txnDayFilter) return t.date === txnDayFilter;
      if (txnFilter === 'all') return true;
      const d = parseLocalDateString(t.date);
      if (txnFilter === 'month') return d.getMonth() === m && d.getFullYear() === y;
      if (txnFilter === 'year') return d.getFullYear() === y;
      return true;
    }).filter((t) => t.type !== 'trade');
  }, [state.transactions, txnFilter, txnDayFilter]);

  const paginatedTransactions = useMemo(() => {
    const reversed = [...filteredTransactions].reverse();
    const totalPages = Math.ceil(reversed.length / transactionsPerPage);
    const startIdx = (currentPage - 1) * transactionsPerPage;
    const endIdx = startIdx + transactionsPerPage;
    return {
      items: reversed.slice(startIdx, endIdx),
      totalPages,
      totalCount: reversed.length,
      startIdx,
      endIdx,
    };
  }, [filteredTransactions, currentPage]);

  // ─── Savings goals ──────────────────────────────────────────────────────────
  const savingsGoalsWithProgress = useMemo(() => {
    return state.savingsGoals.map((goal) => {
      const account = state.accounts.find((a) => a.id === goal.accountId);
      const current = account ? displayBalance(account) : round2(goal.current || 0);
      const pct = Math.min(100, round2((current / goal.target) * 100));
      const remaining = Math.max(0, goal.target - current);
      return { ...goal, current, pct, remaining };
    });
  }, [state.savingsGoals, state.accounts]);

  // ─── Heatmap data ───────────────────────────────────────────────────────────
  const heatmapData = useMemo(() => {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const view = new Date(now.getFullYear(), now.getMonth() + heatmapMonthOffset, 1);
    const first = view;
    const last = new Date(view.getFullYear(), view.getMonth() + 1, 0);
    const daysInMonth = last.getDate();
    const dailySpending: Record<string, number> = {};
    for (let d = 1; d <= daysInMonth; d++) {
      const date = new Date(view.getFullYear(), view.getMonth(), d);
      const key = formatLocalDate(date);
      dailySpending[key] = 0;
    }
    state.transactions.forEach((t) => {
      const isExpense = t.type === 'expense';
      const isDebtCharge = t.type === 'adjustment' && (t.loanChargeAdded || (() => {
        const acc = state.accounts.find((a) => a.id === t.accountId);
        return isBorrowLiabilityLoan(acc);
      })());
      if (!isExpense && !isDebtCharge) return;
      const dt = parseLocalDateString(t.date);
      if (dt.getFullYear() === view.getFullYear() && dt.getMonth() === view.getMonth()) {
        const key = formatLocalDate(dt);
        if (dailySpending[key] !== undefined) {
          const name = String(t.name || '').toLowerCase();
          const catName = String((state.categories.find((c) => c.id === t.categoryId)?.name) || '').toLowerCase();
          if (t.excluded || (state.excludePropFirm && (name.includes('prop firm') || name.includes('challenge') || catName.includes('prop firm')))) return;
          dailySpending[key] += Number(t.amount || 0);
        }
      }
    });
    const amounts = Object.values(dailySpending);
    const max = Math.max(...amounts, 1);
    const startDayIndex = first.getDay();
    const cells: { date: string; amount: number; level: number; day: number; dayOfWeek: string }[] = [];
    for (let d = 1; d <= daysInMonth; d++) {
      const date = new Date(view.getFullYear(), view.getMonth(), d);
      const key = formatLocalDate(date);
      const amount = dailySpending[key];
      const level = amount === 0 ? 0 : Math.min(4, Math.ceil((amount / max) * 4));
      const dayOfWeek = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][date.getDay()];
      cells.push({ date: key, amount, level, day: d, dayOfWeek });
    }
    return { view, startDayIndex, cells, max, monthLabel: new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' }).format(view) };
  }, [state.transactions, state.categories, state.excludePropFirm, state.accounts, heatmapMonthOffset]);

  // ─── Update state helper ───────────────────────────────────────────────────
  // updateState is available for external state updates via the onChange prop
  const updateState = useCallback((updater: (prev: BudgetState) => BudgetState) => {
    void updater;
  }, []);
  void updateState;

  const saveAndRender = useCallback((newState: BudgetState) => {
    // Check goals completed
    let s = { ...newState };
    s.savingsGoals.forEach((goal) => {
      const account = s.accounts.find((a) => a.id === goal.accountId);
      if (account && account.balance >= goal.target) {
        s.accounts = s.accounts.filter((a) => a.id !== goal.accountId);
        s.savingsGoals = s.savingsGoals.filter((g) => g.id !== goal.id);
      }
    });
    // Check loans completed
    const epsilon = 0.005;
    s.accounts = s.accounts.filter((acc) => {
      if (!isLoanAccount(acc)) return true;
      const remaining = Math.abs(displayBalance(acc));
      const originalAmount = Math.abs(Number(acc.loanOriginal != null ? acc.loanOriginal : acc.balance || 0));
      return remaining > epsilon || originalAmount <= epsilon;
    });
    handleChange(s);
  }, [handleChange]);

  // ─── Transaction form submit ───────────────────────────────────────────────
  const handleSubmitTxn = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    let name = txnName.trim();
    const amount = Number(txnAmount || 0);
    const type = txnType;
    const date = txnDate || formatLocalDate(new Date());
    if (!amount) return;
    if (type !== 'adjustment' && type !== 'trade' && amount <= 0) return;
    if (type !== 'transfer' && type !== 'adjustment' && type !== 'trade' && !name) return;

    let s = { ...state, accounts: [...state.accounts], transactions: [...state.transactions] };

    if (editingTxn) {
      // Reverse old transaction
      const oldAccount = s.accounts.find((a) => a.id === editingTxn.accountId);
      if (oldAccount) {
        if (editingTxn.type === 'income') oldAccount.balance = round2(oldAccount.balance - Number(editingTxn.amount || 0));
        else if (editingTxn.type === 'expense') {
          if (isBorrowLiabilityLoan(oldAccount)) {
            const charge = Math.max(0, round2(Number(editingTxn.amount || 0)));
            oldAccount.balance = round2(Math.max(0, oldAccount.balance - charge));
          } else {
            oldAccount.balance = round2(oldAccount.balance + Number(editingTxn.amount || 0));
          }
        } else if (editingTxn.type === 'transfer') {
          const oldFee = Number(editingTxn.transferFee || 0);
          oldAccount.balance = round2(oldAccount.balance + Number(editingTxn.amount || 0));
          const oldTo = s.accounts.find((a) => a.id === editingTxn.toAccountId);
          if (oldTo) oldTo.balance = round2(oldTo.balance - Math.max(0, Number(editingTxn.amount || 0) - oldFee));
        } else if (editingTxn.type === 'trade') {
          oldAccount.balance = round2(oldAccount.balance - Number(editingTxn.pnl || 0));
        }
      }

      // Update transaction
      const txnIdx = s.transactions.findIndex((t) => t.id === editingTxn.id);
      if (txnIdx !== -1) {
        const updated = { ...s.transactions[txnIdx] };
        updated.name = name;
        updated.amount = round2((type === 'adjustment' || type === 'trade') ? Math.abs(amount) : amount);
        updated.type = type;
        updated.accountId = txnAccountId;
        updated.date = date;
        if (type === 'expense') updated.categoryId = txnCategoryId;
        if (type === 'transfer') { updated.toAccountId = txnToAccountId; if (Number(txnTransferFee) > 0) updated.transferFee = round2(Number(txnTransferFee)); }
        if (type === 'adjustment') updated.delta = round2(amount);
        if (type === 'trade') updated.pnl = round2(amount);
        updated.excluded = txnExcluded;
        s.transactions[txnIdx] = updated;

        // Apply new balance change
        const newAccount = s.accounts.find((a) => a.id === txnAccountId);
        if (newAccount) {
          if (type === 'income') newAccount.balance = round2(newAccount.balance + amount);
          else if (type === 'expense') newAccount.balance = round2(newAccount.balance - amount);
          else if (type === 'adjustment') newAccount.balance = round2(newAccount.balance + amount);
          else if (type === 'trade') newAccount.balance = round2(newAccount.balance + amount);
          else if (type === 'transfer') {
            newAccount.balance = round2(newAccount.balance - amount);
            const toAccount = s.accounts.find((a) => a.id === txnToAccountId);
            if (toAccount) toAccount.balance = round2(toAccount.balance + Math.max(0, amount - Number(txnTransferFee || 0)));
          }
        }
      }
    } else {
      // Add mode
      const txn: Transaction = {
        id: uid(), name, amount: round2((type === 'adjustment' || type === 'trade') ? Math.abs(amount) : amount),
        type, date, accountId: txnAccountId, excluded: txnExcluded,
      };
      if (type === 'expense') txn.categoryId = txnCategoryId;
      if (type === 'transfer') { txn.toAccountId = txnToAccountId; if (Number(txnTransferFee) > 0) txn.transferFee = round2(Number(txnTransferFee)); }
      if (type === 'adjustment') txn.delta = round2(amount);
      if (type === 'trade') txn.pnl = round2(amount);

      // Update account balance
      const account = s.accounts.find((a) => a.id === txnAccountId);
      if (account) {
        if (type === 'income') account.balance = round2(account.balance + amount);
        else if (type === 'expense') account.balance = round2(account.balance - amount);
        else if (type === 'transfer') {
          account.balance = round2(account.balance - amount);
          const toAccount = s.accounts.find((a) => a.id === txnToAccountId);
          if (toAccount) toAccount.balance = round2(toAccount.balance + Math.max(0, amount - Number(txnTransferFee || 0)));
        } else if (type === 'adjustment') account.balance = round2(account.balance + amount);
        else if (type === 'trade') account.balance = round2(account.balance + amount);
      }
      s.transactions.push(txn);
    }

    saveAndRender(s);
    setTxnName(''); setTxnAmount(''); setTxnTransferFee(''); setTxnExcluded(false);
    setShowTxnModal(false);
    setEditingTxn(null);
  }, [editingTxn, txnName, txnAmount, txnType, txnDate, txnAccountId, txnToAccountId, txnTransferFee, txnCategoryId, txnExcluded, state, saveAndRender]);

  // ─── Delete transaction ────────────────────────────────────────────────────
  const handleDeleteTxn = useCallback((txn: Transaction) => {
    let s = { ...state, accounts: [...state.accounts], transactions: [...state.transactions] };
    if (txn.type !== 'internal') {
      const account = s.accounts.find((a) => a.id === txn.accountId);
      if (account) {
        if (txn.type === 'income') account.balance = round2(account.balance - Number(txn.amount || 0));
        else if (txn.type === 'expense') account.balance = round2(account.balance + Number(txn.amount || 0));
        else if (txn.type === 'transfer') {
          account.balance = round2(account.balance + Number(txn.amount || 0));
          const toAccount = s.accounts.find((a) => a.id === txn.toAccountId);
          if (toAccount) toAccount.balance = round2(toAccount.balance - Math.max(0, Number(txn.amount || 0) - Number(txn.transferFee || 0)));
        } else if (txn.type === 'trade') account.balance = round2(account.balance - Number(txn.pnl || 0));
      }
    }
    s.transactions = s.transactions.filter((t) => t.id !== txn.id);
    saveAndRender(s);
  }, [state, saveAndRender]);

  // ─── Edit transaction ──────────────────────────────────────────────────────
  const handleEditTxn = useCallback((txn: Transaction) => {
    setEditingTxn(txn);
    setTxnName(txn.name);
    setTxnAmount(txn.type === 'adjustment' ? String(txn.delta ?? txn.amount) : String(txn.amount));
    setTxnType(txn.type);
    setTxnAccountId(txn.accountId || '');
    setTxnToAccountId(txn.toAccountId || '');
    setTxnTransferFee(txn.transferFee ? String(txn.transferFee) : '');
    setTxnCategoryId(txn.categoryId || '');
    setTxnDate(txn.date);
    setTxnExcluded(!!txn.excluded);
    setShowTxnModal(true);
  }, []);

  // ─── Open add transaction modal ─────────────────────────────────────────────
  const openAddTxnModal = useCallback(() => {
    setEditingTxn(null);
    setTxnName(''); setTxnAmount(''); setTxnTransferFee(''); setTxnExcluded(false);
    setTxnType('expense');
    setTxnDate(formatLocalDate(new Date()));
    if (state.accounts.length > 0) setTxnAccountId(state.accounts[0].id);
    if (state.accounts.length > 1) setTxnToAccountId(state.accounts[1].id);
    if (state.categories.length > 0) setTxnCategoryId(state.categories[0].id);
    setShowTxnModal(true);
  }, [state.accounts, state.categories]);

  // ─── Account form submit ─────────────────────────────────────────────────────
  const handleSubmitAccount = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    const name = stripEmoji(accName.trim());
    const balance = Number(accBalance || 0);
    const type = accType;
    const color = getThemeColorForType(type);
    const loanKindVal = accLoanKind || undefined;
    const loanFeeVal = accLoanFee ? round2(Number(accLoanFee)) : undefined;
    const loanAprVal = accLoanApr ? round2(Number(accLoanApr)) : undefined;
    const loanDocTotal = loanKindVal ? toOptionalMoney(accLoanDocumentTotal) : undefined;
    const loanTermMonths = loanKindVal ? toOptionalTermMonths(accLoanTermMonths) : undefined;
    if (!name) return;

    let s = { ...state, accounts: [...state.accounts], transactions: [...state.transactions] };

    if (editingAccountId) {
      const account = s.accounts.find((a) => a.id === editingAccountId);
      if (account) {
        account.name = name;
        account.balance = round2(balance);
        account.icon = type;
        account.color = color;
        account.loanKind = loanKindVal;
        account.loanFee = loanFeeVal;
        account.loanApr = loanAprVal;
        account.loanDocumentTotal = loanDocTotal;
        account.loanTermMonths = loanTermMonths;
        if (account.loanKind && account.loanOriginal == null) account.loanOriginal = round2(balance);
      }
    } else {
      const base = round2(balance);
      const loanOriginal = loanKindVal ? base : undefined;
      let loanLinkedAccountId: string | undefined;
      if (loanKindVal === 'borrow') {
        const destId = accBorrowTo;
        if (destId) {
          loanLinkedAccountId = destId;
          const destAcc = s.accounts.find((a) => a.id === destId);
          if (destAcc) destAcc.balance = round2(Number(destAcc.balance || 0) + base);
        }
      } else if (loanKindVal === 'lend') {
        const srcId = accLendFrom;
        if (srcId) {
          loanLinkedAccountId = srcId;
          const srcAcc = s.accounts.find((a) => a.id === srcId);
          if (srcAcc) srcAcc.balance = round2(Number(srcAcc.balance || 0) - base);
        }
      }
      const newAccount: Account = {
        id: uid(), name, balance: base, icon: type, color,
        loanKind: loanKindVal, loanFee: loanFeeVal, loanApr: loanAprVal,
        loanDocumentTotal: loanDocTotal, loanTermMonths: loanTermMonths,
        loanOriginal, loanLinkedAccountId,
        subAccounts: [{ id: uid(), name: 'Unallocated', balance: base, isUnallocated: true }],
      };
      if (loanKindVal === 'borrow' || loanKindVal === 'debt' || loanKindVal === 'credit') {
        newAccount.loanPayoffBalance = getLoanStartingPayoff(newAccount);
      }
      s.accounts.push(newAccount);
    }

    saveAndRender(s);
    setAccName(''); setAccBalance(''); setAccType('cash'); setAccLoanKind(''); setAccLoanFee(''); setAccLoanApr('');
    setAccLoanDocumentTotal(''); setAccLoanTermMonths(''); setAccBorrowTo(''); setAccLendFrom('');
    setEditingAccountId(null);
    setShowAccountModal(false);
  }, [accName, accBalance, accType, accLoanKind, accLoanFee, accLoanApr, accLoanDocumentTotal, accLoanTermMonths, accBorrowTo, accLendFrom, editingAccountId, state, saveAndRender]);

  // ─── Delete account ──────────────────────────────────────────────────────────
  // handleDeleteAccount is available for account deletion from modals/menus
  const handleDeleteAccount = useCallback((accId: string) => {
    if (!confirm('Delete this account?')) return;
    let s = { ...state, accounts: state.accounts.filter((a) => a.id !== accId) };
    saveAndRender(s);
  }, [state, saveAndRender]);
  void handleDeleteAccount;

  // ─── Add category ───────────────────────────────────────────────────────────
  const handleAddCategory = useCallback((name: string, percent: number) => {
    if (!name) return;
    let s = { ...state, categories: [...state.categories, { id: uid(), name, percent: Math.min(100, percent) }] };
    saveAndRender(s);
  }, [state, saveAndRender]);

  // ─── Update category ─────────────────────────────────────────────────────────
  const handleUpdateCategory = useCallback((id: string, updates: Partial<Category>) => {
    let s = { ...state, categories: state.categories.map((c) => c.id === id ? { ...c, ...updates } : c) };
    saveAndRender(s);
  }, [state, saveAndRender]);

  // ─── Delete category ──────────────────────────────────────────────────────────
  const handleDeleteCategory = useCallback((id: string) => {
    let s = { ...state, categories: state.categories.filter((c) => c.id !== id), transactions: state.transactions.filter((t) => t.categoryId !== id) };
    saveAndRender(s);
  }, [state, saveAndRender]);

  // ─── Add savings goal ─────────────────────────────────────────────────────────
  const handleSubmitGoal = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    const name = goalName.trim();
    const target = round2(Number(goalTarget || 0));
    const current = round2(Number(goalCurrent || 0));
    if (!name || target <= 0) return;
    const goalId = uid();
    const accountId = uid();
    let s = { ...state, accounts: [...state.accounts], savingsGoals: [...state.savingsGoals] };
    s.accounts.push({ id: accountId, name, balance: current, icon: 'target', color: 'pink', goalId, goalTarget: target });
    s.savingsGoals.push({ id: goalId, name, target, current, accountId });
    saveAndRender(s);
    setGoalName(''); setGoalTarget(''); setGoalCurrent('');
    setShowGoalModal(false);
  }, [goalName, goalTarget, goalCurrent, state, saveAndRender]);

  // ─── Delete/complete goal ─────────────────────────────────────────────────────
  const handleDeleteGoal = useCallback((id: string) => {
    if (!confirm('Delete this goal?')) return;
    const goal = state.savingsGoals.find((g) => g.id === id);
    let s = { ...state, accounts: state.accounts, savingsGoals: state.savingsGoals };
    if (goal?.accountId) s.accounts = s.accounts.filter((a) => a.id !== goal.accountId);
    s.savingsGoals = s.savingsGoals.filter((g) => g.id !== id);
    saveAndRender(s);
  }, [state, saveAndRender]);

  const handleCompleteGoal = useCallback((id: string) => {
    const goal = state.savingsGoals.find((g) => g.id === id);
    if (!goal) return;
    const account = state.accounts.find((a) => a.id === goal.accountId);
    const current = account ? displayBalance(account) : round2(goal.current || 0);
    let msg = 'Complete this goal and close the associated account?';
    if (current < goal.target) msg = `This goal is not fully funded (${fmt.format(current)} / ${fmt.format(goal.target)}). Complete anyway?`;
    if (!confirm(msg)) return;
    let s = { ...state };
    s.completedGoals = [...(s.completedGoals || []), { ...goal, completedDate: new Date().toISOString(), finalAmount: current }];
    if (goal.accountId) s.accounts = s.accounts.filter((a) => a.id !== goal.accountId);
    s.savingsGoals = s.savingsGoals.filter((g) => g.id !== id);
    saveAndRender(s);
  }, [state, saveAndRender]);

  // ─── Reset actions ────────────────────────────────────────────────────────────
  const handleResetTransactions = useCallback(() => {
    if (!confirm('Reset all transactions? This cannot be undone.')) return;
    saveAndRender({ ...state, transactions: [] });
    setShowResetModal(false);
  }, [state, saveAndRender]);

  const handleResetBalances = useCallback(() => {
    if (!confirm('Reset balances for all accounts (set to 0.00)?')) return;
    saveAndRender({ ...state, accounts: state.accounts.map((a) => ({ ...a, balance: 0 })) });
    setShowResetModal(false);
  }, [state, saveAndRender]);

  const handleResetAll = useCallback(() => {
    if (!confirm('Reset EVERYTHING? This cannot be undone.')) return;
    handleChange({
      income: 0, autoIncome: true, excludePropFirm: true,
      categories: [{ id: uid(), name: 'Needs', percent: 95 }, { id: uid(), name: 'Wants', percent: 5 }],
      transactions: [], accounts: [], savingsGoals: [], completedGoals: [],
    });
    setShowResetModal(false);
  }, [state, handleChange]);

  // ─── Toggle auto income ───────────────────────────────────────────────────────
  const handleToggleAutoIncome = useCallback(() => {
    saveAndRender({ ...state, autoIncome: !state.autoIncome });
  }, [state, saveAndRender]);

  // ─── Toggle exclude prop firm ─────────────────────────────────────────────────
  const handleToggleExcludePropFirm = useCallback(() => {
    saveAndRender({ ...state, excludePropFirm: !state.excludePropFirm });
  }, [state, saveAndRender]);

  // ─── Set income ────────────────────────────────────────────────────────────────
  const handleSetIncome = useCallback((val: number) => {
    saveAndRender({ ...state, income: round2(val) });
  }, [state, saveAndRender]);

  // ─── Name suggestions ────────────────────────────────────────────────────────
  const handleTxnNameInput = useCallback((val: string) => {
    setTxnName(val);
    const query = val.trim().toLowerCase();
    if (!query) { setShowNameSuggestions(false); return; }
    const filtered = uniqueTxnNames.filter((n) => n.toLowerCase().includes(query)).slice(0, 5);
    setTxnNameSuggestionsList(filtered);
    setShowNameSuggestions(filtered.length > 0);
  }, [uniqueTxnNames]);

  // ─── Drag and drop for accounts ──────────────────────────────────────────────
  const [draggedAccId, setDraggedAccId] = useState<string | null>(null);
  const [dragOverAccId, setDragOverAccId] = useState<string | null>(null);
  void dragOverAccId; // used for visual feedback during drag (set but not read in current render)

  const handleAccDragStart = useCallback((e: React.DragEvent, accId: string) => {
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', accId);
    setDraggedAccId(accId);
  }, []);

  const handleAccDragEnd = useCallback(() => {
    setDraggedAccId(null);
    setDragOverAccId(null);
  }, []);

  const handleAccDragOver = useCallback((e: React.DragEvent, accId: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (accId !== draggedAccId) setDragOverAccId(accId);
  }, [draggedAccId]);

  const handleAccDrop = useCallback((e: React.DragEvent, accId: string) => {
    e.preventDefault();
    const draggedId = e.dataTransfer.getData('text/plain');
    if (draggedId === accId) return;
    const draggedIdx = state.accounts.findIndex((a) => a.id === draggedId);
    const targetIdx = state.accounts.findIndex((a) => a.id === accId);
    if (draggedIdx !== -1 && targetIdx !== -1) {
      const accounts = [...state.accounts];
      const [moved] = accounts.splice(draggedIdx, 1);
      accounts.splice(targetIdx, 0, moved);
      saveAndRender({ ...state, accounts });
    }
    setDragOverAccId(null);
    setDraggedAccId(null);
  }, [state, saveAndRender]);

  // ─── Chart effects ────────────────────────────────────────────────────────────
  // Allocation doughnut chart
  useEffect(() => {
    if (!allocChartRef.current) return;
    const breakdown = spendingBreakdown;
    let labels: string[] = [];
    let data: number[] = [];
    if (breakdown && breakdown.length) {
      const MAX_SLICES = 12;
      const top = breakdown.slice(0, MAX_SLICES);
      labels = top.map((item) => item.name);
      data = top.map((item) => item.amount);
      if (breakdown.length > MAX_SLICES) {
        const remaining = breakdown.slice(MAX_SLICES);
        const otherTotal = remaining.reduce((sum, item) => sum + item.amount, 0);
        if (otherTotal > 0.01) { labels.push('Other'); data.push(round2(otherTotal)); }
      }
    }
    if (labels.length === 0) { labels.push('No spending yet'); data.push(1); }
    const colors = palette(labels.length);

    if (allocChartInstance.current) {
      allocChartInstance.current.data.labels = labels;
      allocChartInstance.current.data.datasets[0].data = data;
      allocChartInstance.current.data.datasets[0].backgroundColor = colors.bg;
      allocChartInstance.current.data.datasets[0].borderColor = colors.border;
      allocChartInstance.current.update();
    } else {
      allocChartInstance.current = new Chart(allocChartRef.current, {
        type: 'doughnut',
        data: {
          labels,
          datasets: [{ data, backgroundColor: colors.bg, borderColor: colors.border, borderWidth: 4, hoverOffset: 18 }],
        },
        options: {
          responsive: true, maintainAspectRatio: false, aspectRatio: 1,
          plugins: { legend: { display: false }, tooltip: { callbacks: { label: (ctx: any) => {
            if (ctx.label === 'No spending yet') return ctx.label;
            return `${ctx.label}: ${fmt.format(ctx.parsed)} (${percentOf(data, ctx.parsed)}%)`;
          } } } },
          cutout: '50%',
        },
      });
    }
  }, [spendingBreakdown]);

  // Balance history line chart
  useEffect(() => {
    if (!balanceChartRef.current) return;
    const history = balanceHistory;
    const labels = history.map((h) => {
      const d = parseLocalDateString(h.date);
      if (currentTimeFrame === 'week') return d.toLocaleDateString('en-US', { weekday: 'short' });
      if (currentTimeFrame === 'year') return d.toLocaleDateString('en-US', { month: 'short' });
      return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    });
    const data = history.map((h) => h.balance);
    const canvas = balanceChartRef.current;
    const ctx2d = canvas.getContext('2d');
    let gradient: CanvasGradient | string = 'transparent';
    if (ctx2d) {
      gradient = ctx2d.createLinearGradient(0, 0, 0, 220);
      gradient.addColorStop(0, 'rgba(168,85,247,0.35)');
      gradient.addColorStop(1, 'rgba(34,211,238,0.12)');
    }

    if (balanceChartInstance.current) {
      balanceChartInstance.current.data.labels = labels;
      balanceChartInstance.current.data.datasets[0].data = data;
      balanceChartInstance.current.data.datasets[0].borderColor = '#a855f7';
      balanceChartInstance.current.data.datasets[0].backgroundColor = gradient;
      balanceChartInstance.current.update();
    } else {
      balanceChartInstance.current = new Chart(canvas, {
        type: 'line',
        data: {
          labels,
          datasets: [{
            label: 'Net Worth', data, borderColor: '#a855f7', backgroundColor: gradient,
            borderWidth: 2, fill: true, tension: 0, spanGaps: true,
            pointRadius: 2, pointHoverRadius: 4, pointBackgroundColor: '#a855f7',
          }],
        },
        options: {
          responsive: true, maintainAspectRatio: false, animation: false,
          interaction: { mode: 'nearest', intersect: false },
          plugins: {
            legend: { display: false },
            tooltip: {
              backgroundColor: 'rgba(15,23,42,0.95)', titleColor: '#cbd5e1', bodyColor: '#e2e8f0',
              borderColor: '#a855f7', borderWidth: 2, padding: 16, displayColors: false,
              callbacks: { label: (ctx: any) => fmt.format(ctx.parsed.y) },
            },
          },
          scales: {
            y: { beginAtZero: false, grid: { color: 'rgba(148,163,184,0.1)' }, ticks: { color: '#94a3b8', callback: (val: any) => fmt.format(val) } },
            x: { grid: { display: false }, ticks: { color: '#94a3b8', maxRotation: 0 } },
          },
        },
        plugins: [crosshairFocusPlugin as any],
      } as any);
    }
  }, [balanceHistory, currentTimeFrame]);

  // ─── Auto income ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (state.autoIncome) {
      saveAndRender({ ...state, income: incomesThisMonthTotal });
    }
  }, [state.autoIncome, incomesThisMonthTotal]);

  // ─── Apply auto income on mount ──────────────────────────────────────────────────
  const lastMonthTotals = useMemo(() => getLastMonthTotals(), [getLastMonthTotals]);

  // ─── Render ────────────────────────────────────────────────────────────────────
  return (
    <div className="budget-container">
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '28px 0 12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ display: 'grid', placeItems: 'center', padding: 8, background: 'rgba(168,85,247,0.08)', borderRadius: 12, border: '1px solid var(--border)' }}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
              <path d="M12 3l7.5 4.5v9L12 21 4.5 16.5v-9L12 3z" stroke="#a855f7" strokeWidth={1.5} fill="rgba(168,85,247,0.08)" />
              <path d="M8 13l2.5 2.5L16 10" stroke="#22d3ee" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <h1 style={{ fontSize: 22, margin: 0, letterSpacing: '0.3px', fontWeight: 700 }}>BudgetFlow</h1>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="budget-btn budget-btn-ghost" onClick={() => setShowSettingsModal(true)}>⚙️</button>
          <button className="budget-btn budget-btn-primary" onClick={openAddTxnModal}>Add Transaction</button>
        </div>
      </div>

      {/* Main grid */}
      <div className="budget-grid">
        {/* Accounts Section */}
        <section className="budget-card full">
          <div className="budget-card-header">
            <h2>Accounts</h2>
            <span className="hint">Track balances across your accounts</span>
          </div>
          <div className="budget-accounts-grid">
            {state.accounts.map((acc) => (
              <AccountCard
                key={acc.id}
                acc={acc}
                onDoubleClick={() => { /* account details would open here */ }}
                onDragStart={(e) => handleAccDragStart(e, acc.id)}
                onDragEnd={handleAccDragEnd}
                onDragOver={(e) => handleAccDragOver(e, acc.id)}
                onDragLeave={() => setDragOverAccId(null)}
                onDrop={(e) => handleAccDrop(e, acc.id)}
              />
            ))}
            <div
              className="budget-add-account-card"
              onClick={() => { setEditingAccountId(null); setAccName(''); setAccBalance(''); setAccType('cash'); setAccLoanKind(''); setShowAccountModal(true); }}
            >
              <div className="add-icon">+</div>
              <div className="add-text">Add / Borrow / Lend / Debt</div>
            </div>
          </div>
          <div className="budget-total-balance-container">
            <div className="budget-total-pair">
              <div className="budget-total-label">Balance</div>
              <div className="budget-total-balance">{fmt.format(totalBalance)}</div>
            </div>
            <div className="budget-total-pair">
              <div className="budget-total-label">Total Debt</div>
              <div className="budget-total-balance budget-total-balance-sm budget-total-debt-amount">{fmt.format(totalDebt)}</div>
            </div>
          </div>
        </section>

        {/* Balance History Chart */}
        <section className="budget-card full">
          <div className="budget-card-header">
            <h2>Net Worth History</h2>
            <div className="budget-time-frame-selector">
              {(['week', 'month', 'quarter', 'year'] as const).map((tf) => (
                <button key={tf} className={`budget-time-btn ${currentTimeFrame === tf ? 'active' : ''}`} onClick={() => setCurrentTimeFrame(tf)}>
                  {tf.charAt(0).toUpperCase() + tf.slice(1)}
                </button>
              ))}
            </div>
          </div>
          <div className="budget-chart-card" style={{ height: 220 }}>
            <canvas ref={balanceChartRef} />
          </div>
        </section>

        {/* Budget & Planning Overview */}
        <section className="budget-card full">
          <div className="budget-card-header">
            <h2>Budget &amp; Planning</h2>
            <span className="hint">Overview, goals &amp; projections</span>
          </div>

          {/* Stats row */}
          <div className="budget-stats">
            <div className="budget-stat">
              <span className="label">Income</span>
              <span className="value">{fmt.format(state.autoIncome ? incomesThisMonthTotal : state.income)}</span>
            </div>
            <div className="budget-stat">
              <span className="label">Budgeted</span>
              <span className="value">{fmt.format(sumBudgeted)}</span>
            </div>
            <div className="budget-stat">
              <span className="label">Unallocated</span>
              <span className={`value ${unallocatedPct !== 0 ? 'warn' : ''}`}>{unallocatedPct}%</span>
            </div>
            <div className="budget-stat">
              <span className="label">Spent this month</span>
              <span className="value">{fmt.format(expensesThisMonthTotal)}</span>
            </div>
          </div>

          {/* Spending breakdown doughnut */}
          <div className="budget-chart-card budget-chart-big">
            <h3 className="budget-chart-title">Spending Breakdown (This Month)</h3>
            <canvas ref={allocChartRef} />
          </div>

          {/* Progress bars per category */}
          <div className="budget-progress-list">
            {state.categories.map((c) => {
              const b = categoryBudgetMap[c.id] || 0;
              const s = spentByCategoryMap[c.id] || 0;
              const pct = b > 0 ? Math.min(100, Math.round((s / b) * 100)) : 0;
              const over = s > b;
              return (
                <div key={c.id} className={`budget-progress ${over ? 'over' : ''}`}>
                  <div className="meta">
                    <span className="name">{c.name}</span>
                    <span className="pct">{c.percent}% • {fmt.format(s)} / {fmt.format(b)}</span>
                  </div>
                  <div className="sp">
                    {over ? <span className="budget-over-badge">Over Budget!</span> : <span className="budget-usage-pct">{pct}% used</span>}
                  </div>
                  <div className="bar">
                    <div className="fill" style={{ width: `${pct}%` }} />
                    <div className="bar-shine" />
                  </div>
                </div>
              );
            })}
          </div>

          {/* Financial planning grid */}
          <div className="budget-planning-grid">
            {/* Emergency Fund */}
            <div className="budget-planning-card">
              <h3>Emergency Fund</h3>
              <div className="budget-planning-stat">
                <span className="label">Recommended (6 months)</span>
                <span className="value">{fmt.format(emergencyFund.recommended)}</span>
              </div>
              <div className="budget-planning-stat">
                <span className="label">Current savings</span>
                <span className="value" style={{ color: emergencyFund.current >= emergencyFund.recommended ? '#a3e635' : '#f59e0b' }}>
                  {fmt.format(emergencyFund.current)}
                </span>
              </div>
              <div style={{ height: 12, background: 'rgba(0,0,0,0.3)', borderRadius: 999, overflow: 'hidden', marginTop: 12 }}>
                <div style={{ height: '100%', width: `${emergencyFund.progress}%`, background: 'linear-gradient(90deg, var(--glow-1), var(--glow-2))', transition: 'width 0.5s' }} />
              </div>
              <div style={{ textAlign: 'center', marginTop: 8, fontSize: 12, color: 'var(--muted)' }}>{emergencyFund.progress}% funded</div>
            </div>

            {/* Savings Goals */}
            <div className="budget-planning-card">
              <h3>Savings Goals</h3>
              {savingsGoalsWithProgress.length === 0 ? (
                <div style={{ color: 'var(--muted)', fontSize: 12, textAlign: 'center', padding: '20px 0' }}>No goals yet</div>
              ) : (
                savingsGoalsWithProgress.map((goal) => (
                  <div key={goal.id} className="budget-goal-item">
                    <div className="budget-goal-header">
                      <span className="budget-goal-name">{goal.name}</span>
                      <div style={{ display: 'flex', gap: 4 }}>
                        <button className="budget-btn budget-btn-ghost budget-btn-sm" onClick={() => handleCompleteGoal(goal.id)}>✓</button>
                        <button className="budget-btn budget-btn-ghost budget-btn-sm" onClick={() => handleDeleteGoal(goal.id)}>✕</button>
                      </div>
                    </div>
                    <div className="budget-goal-progress-bar-enhanced">
                      <div className="budget-goal-progress-fill-enhanced" style={{ width: `${goal.pct}%` }}>
                        <div className="budget-progress-shine" />
                      </div>
                      <span className="budget-progress-percentage">{goal.pct}%</span>
                    </div>
                    <div className="budget-goal-meta">
                      <span>{fmt.format(goal.current)} / {fmt.format(goal.target)}</span>
                      <span>{fmt.format(goal.remaining)} to go</span>
                    </div>
                  </div>
                ))
              )}
              {(state.completedGoals || []).length > 0 && (
                <>
                  <h4 style={{ marginTop: 16, fontSize: 13, color: 'var(--muted)' }}>Completed Goals</h4>
                  {(state.completedGoals || []).map((goal) => (
                    <div key={goal.id} className="budget-goal-item completed" style={{ opacity: 0.7 }}>
                      <div className="budget-goal-header">
                        <span className="budget-goal-name">{goal.name}</span>
                        <span style={{ fontSize: 11, color: 'var(--muted)' }}>Completed {new Date(goal.completedDate).toLocaleDateString()}</span>
                      </div>
                      <div className="budget-goal-meta">
                        <span>Achieved: {fmt.format(goal.finalAmount)} / {fmt.format(goal.target)}</span>
                      </div>
                    </div>
                  ))}
                </>
              )}
              <button className="budget-btn budget-btn-outline budget-btn-sm" style={{ width: '100%', marginTop: 10 }} onClick={() => setShowGoalModal(true)}>+ Add Goal</button>
            </div>

            {/* Balance Projection */}
            <div className="budget-planning-card">
              <h3>Balance Projection</h3>
              <div className="budget-planning-stat">
                <span className="label">Current</span>
                <span className="value">{fmt.format(projection.current)}</span>
              </div>
              <div className="budget-planning-stat">
                <span className="label">In 3 months</span>
                <span className="value" style={{ color: projection.in3 > projection.current ? '#a3e635' : '#ef4444' }}>{fmt.format(projection.in3)}</span>
              </div>
              <div className="budget-planning-stat">
                <span className="label">In 6 months</span>
                <span className="value" style={{ color: projection.in6 > projection.current ? '#a3e635' : '#ef4444' }}>{fmt.format(projection.in6)}</span>
              </div>
              <div className="budget-planning-stat">
                <span className="label">In 12 months</span>
                <span className="value" style={{ color: projection.in12 > projection.current ? '#a3e635' : '#ef4444' }}>{fmt.format(projection.in12)}</span>
              </div>
              <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 10, textAlign: 'center' }}>
                Based on {fmt.format(projection.monthlySavings)}/mo avg savings
              </div>
            </div>

            {/* Spending Calendar Heatmap */}
            <div className="budget-planning-card full-width">
              <h3>Spending Calendar ({heatmapData.monthLabel})</h3>
              <div className="budget-heatmap-nav">
                <div className="budget-heatmap-nav-arrows">
                  <button className="budget-btn budget-btn-outline budget-btn-sm" onClick={() => setHeatmapMonthOffset((prev) => prev - 1)}>◀</button>
                  <button className="budget-btn budget-btn-outline budget-btn-sm" onClick={() => setHeatmapMonthOffset((prev) => prev + 1)}>▶</button>
                </div>
                <span style={{ fontSize: 16, fontWeight: 800, color: 'var(--accent)' }}>{heatmapData.monthLabel}</span>
                {txnDayFilter ? (
                  <button className="budget-btn budget-btn-ghost budget-btn-sm" onClick={() => { setTxnDayFilter(null); setCurrentPage(1); }}>Clear Day Filter</button>
                ) : (
                  <span style={{ width: 100 }} />
                )}
              </div>
              <div className="budget-heatmap-weekday-row">
                {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((label, i) => (
                  <div key={i} className="budget-heatmap-weekday-label">{label}</div>
                ))}
              </div>
              <div className="budget-heatmap-grid">
                {Array.from({ length: heatmapData.startDayIndex }).map((_, i) => (
                  <div key={`empty-${i}`} className="budget-heatmap-day heatmap-empty" />
                ))}
                {heatmapData.cells.map((cell) => (
                  <div
                    key={cell.date}
                    className={`budget-heatmap-day level-${cell.level} ${txnDayFilter === cell.date ? 'selected' : ''}`}
                    title={`${cell.dayOfWeek} ${cell.date}: ${fmt.format(cell.amount)}`}
                    onClick={() => { setTxnDayFilter(cell.date); setCurrentPage(1); }}
                  >
                    <span className="budget-heatmap-day-num">{cell.day}</span>
                    {cell.amount > 0 && (
                      <span className="budget-heatmap-amount">
                        {cell.amount >= 1000 ? `$${Math.round(cell.amount / 100) / 10}k` : `$${Math.round(cell.amount)}`}
                      </span>
                    )}
                  </div>
                ))}
              </div>
              <div className="budget-heatmap-legend">
                <span>Less</span>
                {[0, 1, 2, 3, 4].map((level) => (
                  <div key={level} className={`budget-heatmap-day level-${level}`} style={{ width: 16, height: 16 }} />
                ))}
                <span>More</span>
              </div>
            </div>
          </div>
        </section>

        {/* Transactions Section */}
        <section className="budget-card full">
          <div className="budget-card-header">
            <h2>Transactions</h2>
            <div className="budget-time-frame-selector">
              {(['month', 'year', 'all'] as const).map((f) => (
                <button
                  key={f}
                  className={`budget-time-btn ${txnFilter === f ? 'active' : ''}`}
                  onClick={() => { setTxnFilter(f); setCurrentPage(1); setTxnDayFilter(null); }}
                >
                  {f === 'month' ? 'This Month' : f === 'year' ? 'Year' : 'All Time'}
                </button>
              ))}
            </div>
          </div>

          {/* Transaction stats */}
          <div className="budget-stats">
            <div className="budget-stat">
              <span className="label">Income this month</span>
              <span className="value">{fmt.format(incomesThisMonthTotal)} {getTrendHTML(incomesThisMonthTotal, lastMonthTotals.income)}</span>
            </div>
            <div className="budget-stat">
              <span className="label">Expenses this month</span>
              <span className="value">{fmt.format(expensesThisMonthTotal)} {getTrendHTML(expensesThisMonthTotal, lastMonthTotals.expenses, true)}</span>
            </div>
            <div className="budget-stat">
              <span className="label">Net cash flow</span>
              <span className="value" style={{ color: netCashFlow >= 0 ? '#a3e635' : '#ef4444' }}>
                {fmt.format(netCashFlow)} {getTrendHTML(netCashFlow, round2(lastMonthTotals.income - lastMonthTotals.expenses))}
              </span>
            </div>
            <div className="budget-stat">
              <span className="label">Avg daily spending</span>
              <span className="value">{fmt.format(avgDailySpend)}</span>
            </div>
          </div>

          {/* Spending breakdown toggle */}
          <div className="budget-card-header" style={{ marginTop: 16 }}>
            <h3 style={{ fontSize: 14, margin: 0 }}>Spending Breakdown (This Month)</h3>
            <button className="budget-btn budget-btn-ghost budget-btn-sm" onClick={() => setShowBreakdown(!showBreakdown)}>
              {showBreakdown ? '▼' : '▶'}
            </button>
          </div>
          {showBreakdown && (
            <div className="budget-breakdown-list">
              {spendingBreakdown.length === 0 ? (
                <div style={{ color: 'var(--muted)', fontSize: 13, padding: 8 }}>No expenses this month</div>
              ) : (
                spendingBreakdown.map((item, idx) => {
                  const isTop3 = idx < 3;
                  const trendIcon = item.trend === 'up' ? '↗' : item.trend === 'down' ? '↘' : '→';
                  const trendColor = item.trend === 'up' ? '#ef4444' : item.trend === 'down' ? '#a3e635' : '#94a3b8';
                  const trendText = item.lastMonth > 0 ? `${trendIcon} ${fmt.format(Math.abs(item.diff))}` : 'New';
                  return (
                    <div key={item.name} className={`budget-breakdown-item ${isTop3 ? 'top-item' : ''}`}>
                      <div className="budget-breakdown-header">
                        <div className="budget-breakdown-title">
                          {isTop3 && <span className="budget-top-badge">#{idx + 1}</span>}
                          <span className="name">{item.name}</span>
                          <span className="budget-frequency">{item.count}x</span>
                        </div>
                        <span className="amount">{fmt.format(item.amount)}</span>
                      </div>
                      <div className="budget-breakdown-meta">
                        <span className="budget-trend" style={{ color: trendColor }}>{trendText}</span>
                        {item.mostCommonDay && <span className="budget-day-pattern">Most on {item.mostCommonDay}s</span>}
                        {item.variants && item.variants.length > 0 && (
                          <span className="budget-typo-hint">Includes: {item.variants.map((v) => `"${v}"`).join(', ')}</span>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}

          {/* Transaction table */}
          <div className="budget-table budget-table-compact">
            <div className="budget-thead" style={{ display: 'grid', gridTemplateColumns: '1fr 1.4fr 1fr 0.8fr 0.2fr', gap: 8, alignItems: 'center' }}>
              <div>When</div>
              <div>Name</div>
              <div>Category</div>
              <div>Amount</div>
              <div style={{ width: 80 }} />
            </div>
            <div className="budget-tbody">
              {paginatedTransactions.items.length === 0 ? (
                <div style={{ padding: 20, textAlign: 'center', color: 'var(--muted)' }}>No transactions for this period</div>
              ) : (
                paginatedTransactions.items.map((t) => {
                  const catById = Object.fromEntries(state.categories.map((c) => [c.id, c.name]));
                  let catName: string, amtStr: string, color: string;
                  const nameLower = String(t.name || '').toLowerCase();
                  const catLower = String(catById[t.categoryId || ''] || '').toLowerCase();
                  const autoExcluded = !!state.excludePropFirm && (nameLower.includes('prop firm') || nameLower.includes('challenge') || catLower.includes('prop firm'));
                  const isExcluded = !!t.excluded || autoExcluded;
                  if (t.type === 'income') {
                    catName = 'Income'; amtStr = `+${fmt.format(Number(t.amount || 0))}`; color = '#a3e635';
                  } else if (t.type === 'transfer') {
                    const toAccount = state.accounts.find((a) => a.id === t.toAccountId);
                    catName = `Transfer → ${toAccount ? stripEmoji(toAccount.name) : 'Unknown'}`;
                    amtStr = fmt.format(Number(t.amount || 0)); color = '#22d3ee';
                  } else if (t.type === 'adjustment') {
                    const account = state.accounts.find((a) => a.id === t.accountId);
                    catName = `Adjustment — ${account ? stripEmoji(account.name) : 'Unknown'}`;
                    const delta = Number(t.delta || 0);
                    amtStr = (delta >= 0 ? '+' : '-') + fmt.format(Math.abs(delta));
                    color = '#94a3b8';
                  } else {
                    catName = catById[t.categoryId || ''] || '—';
                    amtStr = `-${fmt.format(Number(t.amount || 0))}`; color = '#ef4444';
                  }
                  return (
                    <div key={t.id} className="budget-rowline" style={{ display: 'grid', gridTemplateColumns: '1fr 1.4fr 1fr 0.8fr 0.2fr', gap: 8, alignItems: 'center' }}>
                      <div>{t.date}</div>
                      <div>{t.name} {isExcluded && <span className="budget-chip budget-chip-excluded">Excluded</span>}</div>
                      <div>{catName}</div>
                      <div className="amount" style={{ color, textAlign: 'right', fontWeight: 700 }}>{amtStr}</div>
                      <div style={{ display: 'flex', gap: 4 }}>
                        <button className="budget-btn budget-btn-ghost budget-btn-sm" onClick={() => handleEditTxn(t)} title="Edit">✏️</button>
                        <button className="budget-btn budget-btn-ghost budget-btn-sm" onClick={() => handleDeleteTxn(t)} title="Delete">✕</button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Pagination */}
          {paginatedTransactions.totalPages > 1 && (
            <div className="budget-pagination">
              <span className="budget-pagination-info">
                Showing {paginatedTransactions.startIdx + 1}-{Math.min(paginatedTransactions.endIdx, paginatedTransactions.totalCount)} of {paginatedTransactions.totalCount}
              </span>
              <div className="budget-pagination-buttons">
                <button className="budget-btn budget-btn-ghost budget-btn-sm" disabled={currentPage <= 1} onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}>← Prev</button>
                <span style={{ padding: '0 8px', color: 'var(--muted)' }}>Page {currentPage} of {paginatedTransactions.totalPages}</span>
                <button className="budget-btn budget-btn-ghost budget-btn-sm" disabled={currentPage >= paginatedTransactions.totalPages} onClick={() => setCurrentPage((p) => Math.min(paginatedTransactions.totalPages, p + 1))}>Next →</button>
              </div>
            </div>
          )}
        </section>
      </div>

      {/* ─── Transaction Modal ─────────────────────────────────────────────────── */}
      {showTxnModal && (
        <div className="budget-modal" onClick={(e) => { if (e.target === e.currentTarget) setShowTxnModal(false); }}>
          <div className="budget-modal-content">
            <div className="budget-modal-header">
              <h2>{editingTxn ? 'Edit Transaction' : 'Add Transaction'}</h2>
              <button className="budget-btn budget-btn-ghost" onClick={() => { setShowTxnModal(false); setEditingTxn(null); }}>✕</button>
            </div>
            <form onSubmit={handleSubmitTxn}>
              <div style={{ display: 'grid', gap: 14 }}>
                {/* Type selector */}
                <div>
                  <label className="budget-label">Type</label>
                  <select className="budget-select" value={txnType} onChange={(e) => setTxnType(e.target.value as TxnType)}>
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
                      value={txnName}
                      onChange={(e) => handleTxnNameInput(e.target.value)}
                      onBlur={() => setTimeout(() => setShowNameSuggestions(false), 160)}
                      required={(txnType as string) !== 'transfer' && (txnType as string) !== 'adjustment' && (txnType as string) !== 'trade'}
                    />
                    {showNameSuggestions && txnNameSuggestionsList.length > 0 && (
                      <div className="budget-name-suggestions">
                        {txnNameSuggestionsList.map((n) => (
                          <button
                            key={n}
                            type="button"
                            className="budget-name-suggestion-item"
                            onClick={() => { setTxnName(n); setShowNameSuggestions(false); }}
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
                    value={txnAmount}
                    onChange={(e) => setTxnAmount(e.target.value)}
                    placeholder="0.00"
                    required
                  />
                </div>

                {/* Account selector */}
                {txnType === 'transfer' ? (
                  <>
                    <div>
                      <label className="budget-label">From Account</label>
                      <select className="budget-select" value={txnAccountId} onChange={(e) => setTxnAccountId(e.target.value)}>
                        {state.accounts.map((a) => <option key={a.id} value={a.id}>{stripEmoji(a.name)}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="budget-label">To Account</label>
                      <select className="budget-select" value={txnToAccountId} onChange={(e) => setTxnToAccountId(e.target.value)}>
                        {state.accounts.map((a) => <option key={a.id} value={a.id}>{stripEmoji(a.name)}</option>)}
                      </select>
                    </div>
                    <div className="budget-input-with">
                      <label className="budget-label">Transfer Fee (optional)</label>
                      <span className="prefix">$</span>
                      <input className="budget-input" type="number" step="0.01" value={txnTransferFee} onChange={(e) => setTxnTransferFee(e.target.value)} placeholder="0.00" />
                    </div>
                  </>
                ) : (
                  <div>
                    <label className="budget-label">{txnType === 'income' ? 'Money going to' : 'Money from'}</label>
                    <select className="budget-select" value={txnAccountId} onChange={(e) => setTxnAccountId(e.target.value)} required>
                      <option value="">Select account</option>
                      {state.accounts.map((a) => <option key={a.id} value={a.id}>{stripEmoji(a.name)}</option>)}
                    </select>
                  </div>
                )}

                {/* Category for expenses */}
                {txnType === 'expense' && (
                  <div>
                    <label className="budget-label">Category</label>
                    <select className="budget-select" value={txnCategoryId} onChange={(e) => setTxnCategoryId(e.target.value)} required>
                      <option value="">Select category</option>
                      {state.categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </div>
                )}

                {/* Date */}
                <div>
                  <label className="budget-label">Date</label>
                  <input className="budget-input" type="date" value={txnDate} onChange={(e) => setTxnDate(e.target.value)} required />
                </div>

                {/* Excluded toggle */}
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                  <input type="checkbox" checked={txnExcluded} onChange={(e) => setTxnExcluded(e.target.checked)} />
                  <span style={{ fontSize: 13, color: 'var(--muted)' }}>Exclude from calculations</span>
                </label>

                <div style={{ display: 'flex', gap: 8 }}>
                  <button type="submit" className="budget-btn budget-btn-primary">{editingTxn ? 'Save Changes' : 'Add Transaction'}</button>
                  {editingTxn && (
                    <button type="button" className="budget-btn budget-btn-danger" onClick={() => { handleDeleteTxn(editingTxn); setShowTxnModal(false); setEditingTxn(null); }}>Delete</button>
                  )}
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─── Account Modal ─────────────────────────────────────────────────────── */}
      {showAccountModal && (
        <div className="budget-modal" onClick={(e) => { if (e.target === e.currentTarget) setShowAccountModal(false); }}>
          <div className="budget-modal-content">
            <div className="budget-modal-header">
              <h2>{editingAccountId ? 'Edit Account' : 'Create Account'}</h2>
              <button className="budget-btn budget-btn-ghost" onClick={() => { setShowAccountModal(false); setEditingAccountId(null); }}>✕</button>
            </div>
            <form onSubmit={handleSubmitAccount}>
              <div style={{ display: 'grid', gap: 14 }}>
                <div>
                  <label className="budget-label">Account Name</label>
                  <input className="budget-input" type="text" value={accName} onChange={(e) => setAccName(e.target.value)} placeholder="e.g. Checking, Savings..." required />
                </div>
                <div className="budget-input-with">
                  <label className="budget-label">Initial Balance</label>
                  <span className="prefix">$</span>
                  <input className="budget-input" type="number" step="0.01" value={accBalance} onChange={(e) => setAccBalance(e.target.value)} placeholder="0.00" />
                </div>
                {(!accLoanKind || (accLoanKind as string) === '') && (
                  <div>
                    <label className="budget-label">Account Type</label>
                    <select className="budget-select" value={accType} onChange={(e) => setAccType(e.target.value as AccountIcon)}>
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
                  <select className="budget-select" value={accLoanKind} onChange={(e) => setAccLoanKind(e.target.value as LoanKind)}>
                    <option value="">None (regular account)</option>
                    <option value="borrow">Borrowed (I owe)</option>
                    <option value="lend">Lent (they owe me)</option>
                    <option value="debt">Debt</option>
                    <option value="credit">Credit Card</option>
                  </select>
                </div>
                {accLoanKind === 'borrow' && (
                  <div>
                    <label className="budget-label">Borrow to (deposit into)</label>
                    <select className="budget-select" value={accBorrowTo} onChange={(e) => setAccBorrowTo(e.target.value)}>
                      <option value="">Select account</option>
                      {state.accounts.filter((a) => !isLoanAccount(a)).map((a) => <option key={a.id} value={a.id}>{stripEmoji(a.name)}</option>)}
                    </select>
                  </div>
                )}
                {accLoanKind === 'lend' && (
                  <div>
                    <label className="budget-label">Lend from (withdraw from)</label>
                    <select className="budget-select" value={accLendFrom} onChange={(e) => setAccLendFrom(e.target.value)}>
                      <option value="">Select account</option>
                      {state.accounts.filter((a) => !isLoanAccount(a)).map((a) => <option key={a.id} value={a.id}>{stripEmoji(a.name)}</option>)}
                    </select>
                  </div>
                )}
                {accLoanKind && (
                  <>
                    <div className="budget-input-with">
                      <label className="budget-label">Flat Fee (optional)</label>
                      <span className="prefix">$</span>
                      <input className="budget-input" type="number" step="0.01" value={accLoanFee} onChange={(e) => setAccLoanFee(e.target.value)} placeholder="0.00" />
                    </div>
                    <div>
                      <label className="budget-label">APR % (optional)</label>
                      <input className="budget-input" type="number" step="0.01" value={accLoanApr} onChange={(e) => setAccLoanApr(e.target.value)} placeholder="0.00" />
                    </div>
                    <div className="budget-input-with">
                      <label className="budget-label">Document Total (optional)</label>
                      <span className="prefix">$</span>
                      <input className="budget-input" type="number" step="0.01" value={accLoanDocumentTotal} onChange={(e) => setAccLoanDocumentTotal(e.target.value)} placeholder="0.00" />
                    </div>
                    <div>
                      <label className="budget-label">Term (months, optional)</label>
                      <input className="budget-input" type="number" step="1" value={accLoanTermMonths} onChange={(e) => setAccLoanTermMonths(e.target.value)} placeholder="0" />
                    </div>
                  </>
                )}
                <button type="submit" className="budget-btn budget-btn-primary">{editingAccountId ? 'Save Changes' : 'Create Account'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─── Goal Modal ────────────────────────────────────────────────────────── */}
      {showGoalModal && (
        <div className="budget-modal" onClick={(e) => { if (e.target === e.currentTarget) setShowGoalModal(false); }}>
          <div className="budget-modal-content">
            <div className="budget-modal-header">
              <h2>Add Savings Goal</h2>
              <button className="budget-btn budget-btn-ghost" onClick={() => setShowGoalModal(false)}>✕</button>
            </div>
            <form onSubmit={handleSubmitGoal}>
              <div style={{ display: 'grid', gap: 14 }}>
                <div>
                  <label className="budget-label">Goal Name</label>
                  <input className="budget-input" type="text" value={goalName} onChange={(e) => setGoalName(e.target.value)} required />
                </div>
                <div className="budget-input-with">
                  <label className="budget-label">Target Amount</label>
                  <span className="prefix">$</span>
                  <input className="budget-input" type="number" step="0.01" value={goalTarget} onChange={(e) => setGoalTarget(e.target.value)} required />
                </div>
                <div className="budget-input-with">
                  <label className="budget-label">Current Amount</label>
                  <span className="prefix">$</span>
                  <input className="budget-input" type="number" step="0.01" value={goalCurrent} onChange={(e) => setGoalCurrent(e.target.value)} placeholder="0.00" />
                </div>
                <button type="submit" className="budget-btn budget-btn-primary">Create Goal</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─── Settings Modal (no theme selector) ────────────────────────────────── */}
      {showSettingsModal && (
        <div className="budget-modal" onClick={(e) => { if (e.target === e.currentTarget) setShowSettingsModal(false); }}>
          <div className="budget-modal-content">
            <div className="budget-modal-header">
              <h2>Settings</h2>
              <button className="budget-btn budget-btn-ghost" onClick={() => setShowSettingsModal(false)}>✕</button>
            </div>
            <div className="budget-settings-sections">
              {/* Income settings */}
              <div className="budget-settings-section">
                <h3>Income</h3>
                <div style={{ display: 'grid', gap: 10 }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                    <input type="checkbox" checked={state.autoIncome} onChange={handleToggleAutoIncome} />
                    <span style={{ fontSize: 13 }}>Auto-calculate from income transactions</span>
                  </label>
                  {!state.autoIncome && (
                    <div className="budget-input-with">
                      <label className="budget-label">Monthly Income</label>
                      <span className="prefix">$</span>
                      <input
                        className="budget-input"
                        type="number"
                        value={state.income}
                        onChange={(e) => handleSetIncome(Number(e.target.value || 0))}
                        disabled={state.autoIncome}
                      />
                    </div>
                  )}
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                    <input type="checkbox" checked={state.excludePropFirm} onChange={handleToggleExcludePropFirm} />
                    <span style={{ fontSize: 13 }}>Exclude "prop firm" / "challenge" from calculations</span>
                  </label>
                </div>
              </div>

              {/* Categories management */}
              <div className="budget-settings-section">
                <h3>Categories</h3>
                <div style={{ display: 'grid', gap: 8 }}>
                  {state.categories.map((cat) => (
                    <div key={cat.id} style={{ display: 'grid', gridTemplateColumns: '1fr 80px auto', gap: 8, alignItems: 'center' }}>
                      <input
                        className="budget-input"
                        type="text"
                        value={cat.name}
                        onChange={(e) => handleUpdateCategory(cat.id, { name: e.target.value.trim() || 'Category' })}
                      />
                      <input
                        className="budget-input"
                        type="number"
                        step="0.5"
                        min="0"
                        max="100"
                        value={cat.percent}
                        onChange={(e) => handleUpdateCategory(cat.id, { percent: Math.min(100, Math.max(0, Number(e.target.value || 0))) })}
                        style={{ textAlign: 'right' }}
                      />
                      <button className="budget-btn budget-btn-ghost budget-btn-sm" onClick={() => handleDeleteCategory(cat.id)}>✕</button>
                    </div>
                  ))}
                  <CategoryAddForm onAdd={handleAddCategory} />
                  <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>
                    {totalPercent}% allocated · {Math.max(0, unallocatedPct)}% unallocated
                  </div>
                </div>
              </div>

              {/* Reset / danger zone */}
              <div className="budget-settings-section">
                <h3>Data Management</h3>
                <div className="budget-settings-actions">
                  <button className="budget-btn budget-btn-outline" onClick={() => setShowResetModal(true)}>Reset Options</button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─── Reset Modal ────────────────────────────────────────────────────────── */}
      {showResetModal && (
        <div className="budget-modal" onClick={(e) => { if (e.target === e.currentTarget) setShowResetModal(false); }}>
          <div className="budget-modal-content">
            <div className="budget-modal-header">
              <h2>Reset Data</h2>
              <button className="budget-btn budget-btn-ghost" onClick={() => setShowResetModal(false)}>✕</button>
            </div>
            <div style={{ display: 'grid', gap: 10 }}>
              <button className="budget-btn budget-btn-outline" onClick={handleResetTransactions}>Reset All Transactions</button>
              <button className="budget-btn budget-btn-outline" onClick={handleResetBalances}>Reset All Balances to $0</button>
              <button className="budget-btn budget-btn-danger" onClick={handleResetAll}>Reset EVERYTHING</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ─── Category Add Form (mini component) ──────────────────────────────────────────
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

export default BudgetTab;