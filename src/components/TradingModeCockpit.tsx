import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { TradingModeWidget } from './TradingModeWidget';
import { NeonCard } from './NeonCard';
import netlifyIdentity from 'netlify-identity-widget';

const fmtUSD = (n: number | null | undefined) => {
  if (n == null) return '—';
  const sign = n < 0 ? '-' : '';
  return `${sign}$${Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

// --- Cockpit Voice System ---
const VOICE_CATEGORIES: Record<string, string[]> = {
  pre_trade: [
    '/cockpit-voice/pretrade-waiting.mp3',
    '/cockpit-voice/pretrade-would-do.mp3',
    '/cockpit-voice/pretrade-let-them-trade.mp3',
    '/cockpit-voice/pretrade-unpredictable.mp3',
    '/cockpit-voice/pretrade-peaceful-trading.mp3',
    '/cockpit-voice/pretrade-speech1.mp3',
    '/cockpit-voice/pretrade-speech2.mp3',
    '/cockpit-voice/pretrade-speech3.mp3',
    '/cockpit-voice/pretrade-speech4.mp3',
    '/cockpit-voice/pretrade-speech5.mp3',
  ],
  in_trade: [
    '/cockpit-voice/intrade-just-as-planned.mp3',
    '/cockpit-voice/intrade-alright.mp3',
    '/cockpit-voice/intrade-your-job.mp3',
    '/cockpit-voice/intrade-test.mp3',
    '/cockpit-voice/intrade-sound-strategy.mp3',
    '/cockpit-voice/intrade-take-it.mp3',
    '/cockpit-voice/intrade-my-money.mp3',
    '/cockpit-voice/intrade-chips.mp3',
    '/cockpit-voice/intrade-relax.mp3',
    '/cockpit-voice/intrade-respect.mp3',
  ],
  sl_hit: [
    '/cockpit-voice/slhit-king-loses-pawn.mp3',
    '/cockpit-voice/slhit-id-smile.mp3',
    '/cockpit-voice/slhit-fool-market.mp3',
    '/cockpit-voice/slhit-unworthy.mp3',
    '/cockpit-voice/slhit-expected.mp3',
    '/cockpit-voice/slhit-honest.mp3',
    '/cockpit-voice/slhit-not-failure.mp3',
    '/cockpit-voice/slhit-more-attempts.mp3',
    '/cockpit-voice/slhit-tuition.mp3',
    '/cockpit-voice/slhit-heartrate.mp3',
  ],
  trade_loss_limit: [
    '/cockpit-voice/tradeloss-limit-hit.mp3',
    '/cockpit-voice/tradeloss-session-done.mp3',
    '/cockpit-voice/tradeloss-hardstop.mp3',
    '/cockpit-voice/tradeloss-significant.mp3',
    '/cockpit-voice/tradeloss-running-low.mp3',
    '/cockpit-voice/tradeloss-career.mp3',
    '/cockpit-voice/tradeloss-integrity.mp3',
  ],
  account_lost: [
    '/cockpit-voice/accountlost-count.mp3',
    '/cockpit-voice/accountlost-one-down.mp3',
    '/cockpit-voice/accountlost-good-company.mp3',
    '/cockpit-voice/accountlost-detectives.mp3',
    '/cockpit-voice/accountlost-interested.mp3',
    '/cockpit-voice/accountlost-another-breach.mp3',
    '/cockpit-voice/accountlost-close-case.mp3',
    '/cockpit-voice/accountlost-watching.mp3',
    '/cockpit-voice/accountlost-adapt.mp3',
  ],
  max_accounts_lost: [
    '/cockpit-voice/maxaccounts-done.mp3',
    '/cockpit-voice/maxaccounts-empty.mp3',
    '/cockpit-voice/maxaccounts-exhausted.mp3',
    '/cockpit-voice/maxaccounts-protective.mp3',
  ],
};

let _voiceMuted = false;
let _voiceLastPlayMs = 0;

function playRandomVoice(category: string) {
  const files = VOICE_CATEGORIES[category];
  if (!files || files.length === 0 || _voiceMuted) return;
  // Min 2.5s gap between plays — prevents stacking/overlap
  const now = Date.now();
  if (now - _voiceLastPlayMs < 2500) return;
  _voiceLastPlayMs = now;
  const pick = files[Math.floor(Math.random() * files.length)];
  // Bridge to React — the persistent DOM element handles actual playback + flash
  (window as any).__cockpitVoice && (window as any).__cockpitVoice(pick);
}

function toggleVoiceMute() { _voiceMuted = !_voiceMuted; return _voiceMuted; }
// --- end Voice System ---

const STATE_CONFIG: Record<string, { label: string; color: string }> = {
  pre_trade:   { label: 'PRE-TRADE',   color: '#f59e0b' },
  in_trade:    { label: 'IN TRADE',    color: '#22d3ee' },
  out_trade:   { label: 'OUT',         color: '#10b981' },
  sl_hit:      { label: 'SL HIT',      color: '#ef4444' },
  tp_hit:      { label: 'TP HIT',      color: '#10b981' },
  ddl:         { label: 'DDL HIT',     color: '#dc2626' },
  breach:      { label: 'BREACH',      color: '#7f1d1d' },
};

const STATE_BUTTONS = [
  { action: 'out_trade',  label: 'OUT',         color: '#10b981', icon: '✅' },
  { action: 'tp_hit',     label: 'TP HIT',      color: '#10b981', icon: '🎯' },
  { action: 'sl_hit',     label: 'SL HIT',      color: '#ef4444', icon: '🛑' },
  { action: 'breach',     label: 'BREACH',      color: '#7f1d1d', icon: '💥' },
  { action: 'fresh_trade',label: 'FRESH',        color: '#a855f7', icon: '🔄' },
];

const DEFAULT_STRATEGIES = ['Blue Box', 'Bread & Butter', 'EW', 'Scalp', 'Momentum'];

// Personal accounts are NOT a hardcoded constant. They come from the live
// `personal_trades` table, derived from distinct `account_name` values.
// Empty list = empty list. The user wants what the DB says, nothing else.









function parseMaxLoss(rules: string[]): number {
  for (const r of rules) { const m = r.match(/^(\d+)\s*(Max Loss|Max)/i); if (m) return parseInt(m[1]); }
  return 0;
}

const todayStr = () => new Date().toISOString().slice(0, 10);

const TradingModeCockpit: React.FC<{ onExit: () => void; propMode?: boolean }> = ({ onExit, propMode }) => {
  // Read auth from React context (NOT localStorage). On the live site, the
  // endpoint returns 401 if X-User-Id is missing — and the cockpit's mount
  // useEffect used to fire before AuthContext finished populating
  // currentUser, so the first fetch went unauthenticated. Re-read on every
  // currentUser change so re-logins re-fire the picker fetch.
  const { currentUser } = useAuth();
  const [state, setState] = useState<any>({
    cockpitState: 'pre_trade', mode: 'balanced', score: 67, slHitCount: 0,
    dailyDate: todayStr(), dailyWins: 0, dailyLosses: 0, streak: 0,
    strategyStats: {}, lastAction: null, lastActionTime: 0, cooldown: false, _voiceMuted: false,
  });
  const [accounts, setAccounts] = useState<any[]>([]);
  const [accountIdx, setAccountIdx] = useState(0);
  const [personalAccounts, setPersonalAccounts] = useState<any[]>([]);
  const [rules, setRules] = useState<Record<string, string[]>>({});
  const [strategies, setStrategies] = useState(DEFAULT_STRATEGIES);
  const [showDonePrompt, setShowDonePrompt] = useState(false);
  const [showOutPrompt, setShowOutPrompt] = useState(false);
  const [showStratPrompt, setShowStratPrompt] = useState(false);
  const [showAccountPicker, setShowAccountPicker] = useState(false);
  const [showOrderArranger, setShowOrderArranger] = useState(false);
  const [selectedAccountId, setSelectedAccountId] = useState('');
  const [renamingAccount, setRenamingAccount] = useState('');
  const [renameValue, setRenameValue] = useState('');
  const [blasting, setBlasting] = useState(false);
  const [pendingAccountOrder, setPendingAccountOrder] = useState<string[]>([]);
  const [showLinkPrompt, setShowLinkPrompt] = useState(false);
  const [linkedPropId, setLinkedPropId] = useState('');
  const [pendingStrategy, setPendingStrategy] = useState('');
  const [stratSetupTf, setStratSetupTf] = useState('');
  const [stratEntryTf, setStratEntryTf] = useState('');
  const [stratSlPlace, setStratSlPlace] = useState('');
  const [stratVariant, setStratVariant] = useState('');
  const [promptOptions, setPromptOptions] = useState<Record<string, Array<{value:string;label:string}>>>({});
  const [variantHistory, setVariantHistory] = useState<string[]>([]);
  const [filteredVariants, setFilteredVariants] = useState<string[]>([]);
  const [timer, setTimer] = useState('');

  const [sessionStarted, setSessionStarted] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);

  // Audio playback bridge — module-level playRandomVoice dispatches here; the
  // persistent DOM element plays it (iOS-safe: never display:none).
  useEffect(() => {
    (window as any).__cockpitVoice = (src: string) => {
      if (audioRef.current) {
        const el = audioRef.current;
        el.src = src;
        el.load();
        el.currentTime = 0;
        el.play().catch(() => {});
      }
    };
    return () => { (window as any).__cockpitVoice = undefined; };
  }, []);

  // --- Nonstop voice loop ---
  // While in pre_trade/in_trade, keep cycling clips: after each clip ends,
  // wait ~3s and play the next random one. Gates on account-picker flow.
  // For one-shot categories (sl_hit), plays up to 2 clips then transitions to
  // the next state (pre_trade) so the loop resumes.
  const voiceLoopCatRef = useRef<string | null>(null);
  const voiceChainRef = useRef<{ category: string; played: number; max: number; thenState?: string } | null>(null);
  const voiceEndGapTimer = useRef<any>(null);

  // Play a clip now; if it's part of a chain, track how many remain and what
  // state to flip to once the chain finishes.
  const playVoiceWithChain = useCallback((category: string, max: number, thenState?: string) => {
    voiceChainRef.current = { category, played: 1, max, thenState };
    playRandomVoice(category);
  }, []);

  const scheduleVoiceContinuation = useCallback(() => {
    if (voiceEndGapTimer.current) clearTimeout(voiceEndGapTimer.current);
    voiceEndGapTimer.current = setTimeout(() => {
      // Chain in progress (e.g. SL messages): keep going or transition state
      const chain = voiceChainRef.current;
      if (chain) {
        if (chain.played < chain.max) {
          chain.played += 1;
          playRandomVoice(chain.category);
        } else {
          const then = chain.thenState;
          voiceChainRef.current = null;
          if (then) setState((p: any) => ({ ...p, cockpitState: then }));
        }
        return;
      }
      // Otherwise continue the idle loop if still in a looping state
      const cat = voiceLoopCatRef.current;
      if (cat) {
        playRandomVoice(cat);
      }
    }, 2500);
  }, []);

  // When a clip finishes playing, schedule the next one (chain or loop)
  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;
    const onEnded = () => {
      scheduleVoiceContinuation();
    };
    el.addEventListener('ended', onEnded);
    return () => el.removeEventListener('ended', onEnded);
  }, [scheduleVoiceContinuation]);

  // Loop control: pre_trade/in_trade → loop that category; anything else → stop.
  // Skips while account picker / order arranger / link prompt are open AND until
  // the user actually locked the account order (session started).
  useEffect(() => {
    if (!sessionStarted || showAccountPicker || showOrderArranger || showLinkPrompt) {
      voiceLoopCatRef.current = null;
      if (voiceEndGapTimer.current) { clearTimeout(voiceEndGapTimer.current); voiceEndGapTimer.current = null; }
      return;
    }
    const st = state?.cockpitState;
    if (st === 'pre_trade' || st === 'in_trade') {
      if (voiceLoopCatRef.current !== st) {
        voiceLoopCatRef.current = st;
        playRandomVoice(st); // kick off immediately on state entry; 2.5s gap dedupes
      }
    } else {
      voiceLoopCatRef.current = null;
      if (voiceEndGapTimer.current) { clearTimeout(voiceEndGapTimer.current); voiceEndGapTimer.current = null; }
    }
  }, [state?.cockpitState, showAccountPicker, showOrderArranger, showLinkPrompt, sessionStarted]);

  // Daily reset check — reset counters if date changed
  const ensureDailyReset = useCallback((prev: any) => {
    const td = todayStr();
    if (prev.dailyDate !== td) {
      return { ...prev, dailyDate: td, dailyWins: 0, dailyLosses: 0, streak: 0, strategyStats: {}, slHitCount: 0 };
    }
    return prev;
  }, []);

  const displayAccounts = propMode ? accounts : personalAccounts;
  const renameAccount = useCallback((aid: string) => {
    const name = renameValue.trim();
    if (!name) return;
    try {
      const overrides = JSON.parse(localStorage.getItem('personal_account_names') || '{}');
      overrides[aid] = name;
      localStorage.setItem('personal_account_names', JSON.stringify(overrides));
    } catch {}
    setRenamingAccount('');
    setRenameValue('');
  }, [renameValue]);

  const getDisplayName = useCallback((a: any) => {
    const aid = a.id || a.nickname;
    try { const overrides = JSON.parse(localStorage.getItem('personal_account_names') || '{}'); if (overrides[aid]) return overrides[aid]; } catch {}
    return a.nickname || a.displayLabel || aid;
  }, []);

  const acctList = propMode ? accounts : personalAccounts;
  const account = selectedAccountId ? (acctList.find((a: any) => a.nickname === selectedAccountId || a.displayLabel === selectedAccountId || a.id === selectedAccountId) || acctList[0]) : acctList[0];
  const nextAccount = accounts.length > 1 ? accounts[(accountIdx + 1) % accounts.length] : null;
  const modeKey = state?.mode || 'balanced';
  const currentRules = rules[modeKey] || rules.balanced || [];
  const maxLoss = parseMaxLoss(currentRules);
  const tradesLeft = maxLoss > 0 ? maxLoss - (state?.slHitCount || 0) : 0;
  const streak = state?.streak || 0;
  const inCooldown = state?.cooldown && state?.cockpitState === 'pre_trade';

  // Authenticate exactly like apiClient.makeRequest: Netlify Identity JWT
  // (Authorization: Bearer) is the canonical live auth. The working tabs rely
  // on the identity cookie, but a raw fetch here only ever sent X-User-Id from
  // localStorage, which is empty on live — so every cockpit fetch 401'd or was
  // gated off. The JWT is what reliably populates clientContext server-side.
  // localStorage X-User-Id stays as a dev/legacy fallback.
  const getAuthHeaders = useCallback(async (): Promise<Record<string, string>> => {
    const h: Record<string, string> = {};
    try {
      const u = netlifyIdentity.currentUser();
      if (u && typeof u.jwt === 'function') {
        const jwt = await u.jwt();
        if (jwt) h['Authorization'] = `Bearer ${jwt}`;
      }
    } catch {}
    try {
      const u = JSON.parse(localStorage.getItem('user') || '{}');
      if (u?.id) h['X-User-Id'] = String(u.id);
      if (u?.email) h['X-User-Email'] = String(u.email);
      if (u?.name) h['X-User-Name'] = String(u.name);
    } catch {}
    return h;
  }, []);

  const advanceAccount = useCallback(async (_rulesFollowed: boolean) => {
    setShowDonePrompt(false);
    const h = { 'Content-Type': 'application/json', ...(await getAuthHeaders()) };
    setTimeout(() => {
    setBlasting(true);
    setTimeout(() => {
    try {
      fetch('/.netlify/functions/db-calendar', { method: 'POST', headers: h, body: JSON.stringify({ action: 'upsert-entry', calendarAccountId: `${acct?.nickname || acct?.displayLabel || 'account'}_cockpit`, date: todayStr(), followedRules: _rulesFollowed, balanceSnapshot: parseFloat(acct?.balance) || 0, pnlSnapshot: (parseFloat(acct?.balance) || 0) - (parseFloat(acct?.highWaterMark) || 0) }) }).catch(() => {});
    } catch {}
    if (pendingAccountOrder.length > 1) {
      const currentName = acct?.nickname || acct?.displayLabel || acct?.id || '';
      const ci = pendingAccountOrder.indexOf(currentName);
      const nextName = pendingAccountOrder[(ci + 1) % pendingAccountOrder.length];
      const next = acctList.find((a: any) => (a.nickname || a.displayLabel || a.id) === nextName);
      if (next) setSelectedAccountId(next.nickname || next.displayLabel || next.id);
      else if (accounts.length > 1) setAccountIdx((accountIdx + 1) % accounts.length);
    } else if (accounts.length > 1) setAccountIdx((accountIdx + 1) % accounts.length);
    setState({ cockpitState: 'pre_trade', mode: state?.mode || 'balanced', score: state?.score || 67, slHitCount: 0, dailyDate: todayStr(), dailyWins: state?.dailyWins || 0, dailyLosses: state?.dailyLosses || 0, streak: state?.streak || 0, strategyStats: state?.strategyStats || {}, lastAction: null, lastActionTime: 0, cooldown: false, _voiceMuted: state?._voiceMuted || false,  });
    setTimeout(() => setBlasting(false), 100);
    setTimeout(() => playRandomVoice('pre_trade'), 100);
  }, 600);
  }, 150);
  }, [accounts, accountIdx, state, pendingAccountOrder, acctList, getAuthHeaders]);

  const sendAction = useCallback(async (action: string, extra: Record<string, any> = {}) => {
    // Voice: fire synchronously — guaranteed to be in the user-gesture chain
    if (action === 'strategy') playRandomVoice('in_trade');
    // Strategy presses ALWAYS open the details prompt (TF/SL/variant) — the
    // durable write happens on Confirm. The state-machine POST is best-effort
    // and must never gate the prompt: before the auth fix a 401 fell through to
    // mockAction and opened it, but a successful POST skipped it entirely.
    if (action === 'strategy') {
      mockAction(action, extra);
      fetch('/.netlify/functions/trading-mode', { method: 'POST', headers: { 'Content-Type': 'application/json', ...(await getAuthHeaders()) }, body: JSON.stringify({ action, ...extra }) }).catch(() => {});
      return;
    }
    const res = await fetch('/.netlify/functions/trading-mode', { method: 'POST', headers: { 'Content-Type': 'application/json', ...(await getAuthHeaders()) }, body: JSON.stringify({ action, ...extra }) });
    if (res.ok) { const r = await res.json(); if (r.cockpitState && action !== 'out_trade') setState((p: any) => ({ ...p, ...r })); if (action === 'out_trade') mockAction(action, extra); }
    else mockAction(action, extra);
    // Voice + auto-reset for action-driven states
    if (action === 'sl_hit') playVoiceWithChain('sl_hit', 2, 'pre_trade');
    if (action === 'tp_hit') setTimeout(() => setState((p: any) => ({ ...p, cockpitState: 'pre_trade' })), 1400);
    if (action === 'breach') playRandomVoice('account_lost'); /* max-accounts check handled by effect */
  }, [getAuthHeaders, playVoiceWithChain]);

  const mockAction = useCallback((action: string, extra: Record<string, any>) => {
    const now = Date.now();
    setState((prev: any) => {
      let p = ensureDailyReset(prev);
      // Save for undo
      const history: any[] = p.actionHistory || [];
      history.push({ action, strategy: p.currentStrategy, ts: now });
      if (history.length > 10) history.shift();

      if (action === 'strategy') {
        setPendingStrategy(extra.strategy || '');
        setStratSetupTf(''); setStratEntryTf(''); setStratSlPlace(''); setStratVariant('');
        setShowStratPrompt(true);
        return p;
      }
      if (action === 'tp_hit') {
        const s = p.currentStrategy || '?';
        const ss = { ...(p.strategyStats || {}), [s]: { wins: ((p.strategyStats||{})[s]?.wins || 0) + 1, losses: ((p.strategyStats||{})[s]?.losses || 0) } };
        return { ...p, actionHistory: history, cockpitState: 'tp_hit', dailyWins: (p.dailyWins || 0) + 1, streak: (p.streak || 0) > 0 ? (p.streak || 0) + 1 : 1, strategyStats: ss, lastAction: 'tp_hit', lastActionTime: now, cooldown: false };
      }
      if (action === 'sl_hit') {
        const s = p.currentStrategy || '?';
        const ss = { ...(p.strategyStats || {}), [s]: { wins: ((p.strategyStats||{})[s]?.wins || 0), losses: ((p.strategyStats||{})[s]?.losses || 0) + 1 } };
        return { ...p, actionHistory: history, cockpitState: 'sl_hit', dailyLosses: (p.dailyLosses || 0) + 1, slHitCount: (p.slHitCount || 0) + 1, streak: (p.streak || 0) < 0 ? (p.streak || 0) - 1 : -1, strategyStats: ss, lastAction: 'sl_hit', lastActionTime: now, cooldown: true };
      }
      if (action === 'out_trade') { setShowOutPrompt(true); return p; }
      const ns = action === 'fresh_trade' ? p.cockpitState : action === 'in_trade' ? 'in_trade' : action in STATE_CONFIG ? action : p.cockpitState;
      return { ...p, actionHistory: history, cockpitState: ns, freshSetup: action === 'fresh_trade' || action === 'enter_cockpit', lastAction: action, lastActionTime: now };
    });
    // out_trade auto-reset handled by the prompt
  }, [ensureDailyReset]);

  // Undo last action
  const undoLast = useCallback(() => {
    setState((prev: any) => {
      const h = prev.actionHistory || [];
      if (h.length < 2) return prev; // Need at least 2 to undo (current + previous)
      const last = h[h.length - 1];
      const prevAction = h[h.length - 2];
      // Revert the last action
      let s = { ...prev, actionHistory: h.slice(0, -1) };
      if (last.action === 'tp_hit') {
        s.dailyWins = Math.max(0, (s.dailyWins || 0) - 1);
        const strat = last.strategy;
        if (strat && s.strategyStats?.[strat]) {
          const ss = { ...s.strategyStats };
          ss[strat] = { ...ss[strat], wins: Math.max(0, (ss[strat].wins || 0) - 1) };
          s.strategyStats = ss;
        }
      } else if (last.action === 'sl_hit') {
        s.dailyLosses = Math.max(0, (s.dailyLosses || 0) - 1);
        s.slHitCount = Math.max(0, (s.slHitCount || 0) - 1);
      } else if (last.action === 'strategy') {
        // Undo strategy press — revert to previous
        s.currentStrategy = prevAction.strategy || null;
        s.freshSetup = !prevAction.strategy || prevAction.action !== 'strategy';
        s.strategyAttempts = prevAction.strategy === last.strategy ? Math.max(1, (s.strategyAttempts || 1) - 1) : 1;
        if (!prevAction.action || prevAction.action === 'pre_trade' || prevAction.action === 'fresh_trade' || prevAction.action === 'enter_cockpit') {
          s.cockpitState = 'pre_trade';
        }
      }
      s.cockpitState = prevAction.action === 'in_trade' ? 'in_trade' : prevAction.action === 'strategy' ? 'in_trade' : prevAction.action === 'out_trade' ? 'out_trade' : s.cockpitState || 'pre_trade';
      s.lastAction = prevAction.action;
      return s;
    });
  }, []);

  // Confirm strategy with full details
  const confirmStrategy = useCallback(async () => {
    setShowStratPrompt(false);
    const s = pendingStrategy;
    if (!s) return;
    const h = { 'Content-Type': 'application/json', ...(await getAuthHeaders()) } as Record<string, string>;
    // Prop phase comes from the account actually being copied to, not a
    // hardcoded 'eval'. trading_accounts.phase is 'challenge'|'funded'; map it
    // to prop_trades.phase ('eval'|'funded'|'live').
    // 'none' is the "Skip \u2014 Just Personal" sentinel \u2014 NOT a prop link, so a
    // skipped personal session must not write a prop_trade with account id "none".
    const propLink = propMode ? selectedAccountId : (linkedPropId && linkedPropId !== 'none' ? linkedPropId : '');
    const hasPropLink = !!(propMode || propLink);
    const targetAcct = accounts.find((a: any) => (a.nickname || a.displayLabel || a.id) === propLink);
    const propPhase = targetAcct?.phase === 'funded' ? 'funded' : targetAcct?.phase === 'live' ? 'live' : 'eval';
    const body = hasPropLink
      ? JSON.stringify({ action: 'create', instrument: '\u2014', side: 'buy', quantity: 0, strategy: s, setupTf: stratSetupTf, entryTf: stratEntryTf, slPlacement: stratSlPlace, variant: stratVariant, accountId: propLink, phase: propPhase })
      : JSON.stringify({ action: 'log-strategy', strategy: s, setupTf: stratSetupTf, entryTf: stratEntryTf, slPlacement: stratSlPlace, variant: stratVariant });
    // Log to prop trades if linking
    if (hasPropLink) {
      fetch('/.netlify/functions/db-prop-trades', { method: 'POST', headers: h, body }).catch(() => {});
    }
    // Log to personal trades if personal mode (even if linked)
    if (!propMode) {
      const logBody = JSON.stringify({ action: 'log-strategy', strategy: s, setupTf: stratSetupTf, entryTf: stratEntryTf, slPlacement: stratSlPlace, variant: stratVariant, accountName: selectedAccountId || 'NinjaTrader' });
      fetch('/.netlify/functions/db-personal-trades', { method: 'POST', headers: h, body: logBody }).catch(() => {});
    }
    setState((prev: any) => {
      const history = prev.actionHistory || [];
      history.push({ action: 'strategy', strategy: s, setupTf: stratSetupTf, entryTf: stratEntryTf, slPlacement: stratSlPlace, variant: stratVariant, ts: Date.now() });
      if (history.length > 10) history.shift();
      const same = prev.currentStrategy === s && !prev.freshSetup;
      return { ...prev, actionHistory: history, currentStrategy: s, strategyAttempts: same ? (prev.strategyAttempts || 1) + 1 : 1, freshSetup: false, cockpitState: 'in_trade', lastAction: 'strategy', lastActionTime: Date.now(), cooldown: false };
    });
    setTimeout(() => playRandomVoice('in_trade'), 400);
  }, [pendingStrategy, stratSetupTf, stratEntryTf, stratSlPlace, stratVariant, getAuthHeaders, accounts, propMode, linkedPropId, selectedAccountId]);

  // Handle OUT prompt result
  const handleOutResult = useCallback((result: 'green' | 'red' | 'even') => {
    setState((prev: any) => {
      let p = ensureDailyReset(prev);
      const history = p.actionHistory || [];
      history.push({ action: 'out_trade', result, strategy: p.currentStrategy, ts: Date.now() });
      if (history.length > 10) history.shift();
      if (result === 'green') {
        const s = p.currentStrategy || '?';
        const ss = { ...(p.strategyStats || {}), [s]: { wins: ((p.strategyStats||{})[s]?.wins || 0) + 1, losses: ((p.strategyStats||{})[s]?.losses || 0) } };
        return { ...p, actionHistory: history, cockpitState: 'out_trade', dailyWins: (p.dailyWins || 0) + 1, streak: (p.streak || 0) > 0 ? (p.streak || 0) + 1 : 1, strategyStats: ss, lastActionTime: Date.now() };
      }
      if (result === 'red') {
        const s = p.currentStrategy || '?';
        const ss = { ...(p.strategyStats || {}), [s]: { wins: ((p.strategyStats||{})[s]?.wins || 0), losses: ((p.strategyStats||{})[s]?.losses || 0) + 1 } };
        return { ...p, actionHistory: history, cockpitState: 'out_trade', dailyLosses: (p.dailyLosses || 0) + 1, streak: (p.streak || 0) < 0 ? (p.streak || 0) - 1 : -1, strategyStats: ss, lastActionTime: Date.now() };
      }
      // Breakeven
      return { ...p, actionHistory: history, cockpitState: 'out_trade', dailyEven: (p.dailyEven || 0) + 1, lastActionTime: Date.now() };
    });
    setShowOutPrompt(false);
    setTimeout(() => setState((p: any) => ({ ...p, cockpitState: 'pre_trade' })), 1500);
    setTimeout(() => playRandomVoice('pre_trade'), 1700);
  }, [ensureDailyReset]);

  // Load data — db-accounts for the picker (full contract: id, displayLabel,
  // status, phase, etc.) and db-state-full for the enrichment every card
  // shows below the picker (totalProfit, trueProfitTarget, rules, bestDay,
  // consistencyOk). Without db-accounts the picker's `a.nickname ||
  // a.displayLabel || a.id` keys collapsed to blanks because db-state-full
  // omits those fields.
  useEffect(() => {
    const load = async () => {
      const h = await getAuthHeaders();
      const [accountsRes, fullRes, stratRes, tradesRes, statsRes] = await Promise.all([
        fetch('/.netlify/functions/db-accounts', { headers: h }).catch(() => null),
        fetch('/.netlify/functions/db-state-full', { headers: h }).catch(() => null),
        fetch('/.netlify/functions/db-personal-trades', { method: 'POST', headers: { 'Content-Type': 'application/json', ...h }, body: JSON.stringify({ action: 'strategies' }) }).catch(() => null),
        // Personal trades → derive distinct account_name values for the
        // personal-mode picker. Read-only; the user manages add/remove/
        // rename on the Personal tab, not here.
        fetch('/.netlify/functions/db-personal-trades?limit=500', { headers: h }).catch(() => null),
        // Personal account balance (personal_account_balance — the NinjaTrader
        // live balance the trade-monitor bot pushes). Populates the personal
        // card's balance instead of a bare $0. NOTE: `stats` is a GET query
        // action on the live handler, not a POST body action.
        fetch('/.netlify/functions/db-personal-trades?action=stats', { headers: h }).catch(() => null),
      ]);
      // 1) Picker list — full contract from db-accounts (active rows only).
      if (accountsRes?.ok) {
        const d = await accountsRes.json();
        const a = (d.accounts || []).filter((x: any) => x.status === 'active' || !x.status);
        if (a.length > 0) setAccounts(a);
      }
      // 2) Enrichment (rules, totals, trueProfitTarget) from db-state-full.
      if (fullRes?.ok) { const d = await fullRes.json(); if (d.rules) setRules(d.rules); }
      else { setRules({}); }
      if (stratRes?.ok) { const d = await stratRes.json(); if (d.strategies?.length > 0) setStrategies([...DEFAULT_STRATEGIES, ...d.strategies]); }
      // 3) Personal accounts — distinct `account_name` values from
      //    personal_trades, plus the NinjaTrader live balance so the card
      //    doesn't render a bare $0.
      let personalBalance: number | null = null;
      if (statsRes?.ok) {
        try { const sd = await statsRes.json(); personalBalance = sd?.stats?.balance ?? null; } catch {}
      }
      if (tradesRes?.ok) {
        try {
          const d = await tradesRes.json();
          const names = Array.from(new Set(
            (d.trades || []).map((t: any) => t.accountName || 'NinjaTrader')
          )).sort() as string[];
          setPersonalAccounts(names.map((n) => ({
            nickname: n,
            displayLabel: n,
            phase: 'personal',
            // personal_account_balance is the NinjaTrader live balance (one row
            // per user). Attach it to the NinjaTrader account; other personal
            // accounts (e.g. Crypto) carry no tracked balance yet.
            balance: String(n).toLowerCase() === 'ninjatrader' ? personalBalance : null,
          })));
        } catch {}
      }
    };
    // Load prompt options + variant history
    getAuthHeaders().then(h => {
      fetch('/.netlify/functions/db-personal-trades', { method: 'POST', headers: { 'Content-Type': 'application/json', ...h }, body: JSON.stringify({ action: 'prompt-options' }) }).then(r => r.ok && r.json()).then(d => { if (d?.options) setPromptOptions(d.options); }).catch(() => {});
      fetch('/.netlify/functions/db-personal-trades', { method: 'POST', headers: { 'Content-Type': 'application/json', ...h }, body: JSON.stringify({ action: 'variant-history' }) }).then(r => r.ok && r.json()).then(d => { if (d?.variants) setVariantHistory(d.variants); }).catch(() => {});
    });
    load();
  }, [currentUser?.id]); // eslint-disable-line

  // Show account picker on mount — always, no conditions
  useEffect(() => {
    setShowAccountPicker(true);
  }, [propMode]);

  // SL hit auto-prompt + trade loss voice
  const prevSlHitRef = useRef(state?.slHitCount || 0);
  useEffect(() => {
    if (maxLoss > 0 && (state?.slHitCount || 0) >= maxLoss && !showDonePrompt) {
      setShowDonePrompt(true);
      playRandomVoice('trade_loss_limit');
    }
    // Fire a warning when halfway to the max loss (at least 2 loss minimum threshold)
    const half = Math.floor(maxLoss / 2);
    if (maxLoss > 0 && half >= 1 && (state?.slHitCount || 0) === half) {
      playRandomVoice('trade_loss_limit');
    }
    prevSlHitRef.current = state?.slHitCount || 0;
  }, [state?.slHitCount, maxLoss, showDonePrompt]);

  // Cooldown timer: 20 seconds after SL hit
  useEffect(() => {
    if (!state?.cooldown) return;
    const t = setTimeout(() => setState((p: any) => ({ ...p, cooldown: false })), 20000);
    return () => clearTimeout(t);
  }, [state?.cooldown, state?.cockpitState]);

  // Timer tick — counts up only while a trade is LIVE (cockpitState 'in_trade')
  // and clears the moment the trade ends (sl_hit / tp_hit / out_trade / ddl /
  // breach). It used to count from lastActionTime regardless of state, so an SL
  // press kept the clock running even though the trade was over.
  const lastActionRef = useRef(state?.lastActionTime || 0);
  useEffect(() => { lastActionRef.current = state?.lastActionTime || 0; }, [state?.lastActionTime]);
  const cockpitStateRef = useRef(state?.cockpitState);
  useEffect(() => { cockpitStateRef.current = state?.cockpitState; }, [state?.cockpitState]);
  useEffect(() => {
    const tick = setInterval(() => {
      if (cockpitStateRef.current !== 'in_trade') { setTimer(''); return; }
      const last = lastActionRef.current;
      if (last > 0) {
        const secs = Math.floor((Date.now() - last) / 1000);
        if (secs > 0 && secs < 3600) setTimer(secs >= 60 ? `${Math.floor(secs / 60)}:${(secs % 60).toString().padStart(2, '0')}` : `${secs}`);
        else if (secs >= 3600) setTimer('3600+');
        else setTimer('');
      }
    }, 1000);
    return () => clearInterval(tick);
  }, []);

  const cfg = STATE_CONFIG[state?.cockpitState] || STATE_CONFIG.pre_trade;
  const acct = account;
  const bal = parseFloat(acct?.balance) || 0;
  const maxDD = parseFloat(acct?.maxDrawdown) || 0;
  const ddUsed = parseFloat(acct?.drawdownUsed) || 0;
  const ddPct = maxDD > 0 ? Math.min(100, (ddUsed / maxDD) * 100) : 0;
  const dailyDD = parseFloat(acct?.dailyDrawdown) || 0;
  const dayStart = parseFloat(acct?.dayStartBalance) || bal;
  const dayDrawdownUsed = dayStart > 0 ? Math.max(0, dayStart - bal) : 0;
  const dailyDDRemaining = dailyDD > 0 ? Math.max(0, dailyDD - dayDrawdownUsed) : 0;
  const acctSize = parseFloat(acct?.accountSize) || 0;
  const totalProfit = parseFloat(acct?.totalProfit) || 0;
  const trueTarget = parseFloat(acct?.trueProfitTarget) || 0;
  const payoutPct = trueTarget > 0 ? Math.min(100, (totalProfit / trueTarget) * 100) : 0;
  const phaseInfo = acct?.phase === 'live' ? { color: '#a3e635', label: 'LIVE' } : acct?.phase === 'funded' ? { color: '#22d3ee', label: 'FUNDED' } : acct?.phase === 'personal' ? { color: '#22d3ee', label: 'PERSONAL' } : { color: '#a855f7', label: 'EVAL' };
  const streakIcon = streak > 2 ? '🔥' : streak > 0 ? '✅' : streak < -1 ? '💀' : streak < 0 ? '❌' : '—';

  return (
    <div className="fixed inset-0 z-50 flex flex-col lg:flex-row overflow-y-auto lg:overflow-hidden animate-[cockpitFadeIn_0.3s_ease-out]" style={{ background: '#020408' }}>
      <audio ref={audioRef} preload="auto" style={{ position: 'absolute', width: 0, height: 0, opacity: 0, pointerEvents: 'none' }} />
      <style>{`
        @keyframes cockpitFadeIn { from { opacity: 0; transform: scale(0.97); } to { opacity: 1; transform: scale(1); } }
        @keyframes slideUp { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes glowPulse { 0%, 100% { box-shadow: 0 0 15px ${cfg.color}20; } 50% { box-shadow: 0 0 30px ${cfg.color}40; } }
        @keyframes blastOff { 0% { opacity: 1; transform: translateY(0) scale(1); } 20% { opacity: 1; transform: translateY(-20px) scale(1.08); } 100% { opacity: 0; transform: translateY(-250px) scale(0.6); } }
        @keyframes blastIn { 0% { opacity: 0; transform: translateY(80px) scale(0.9); } 60% { opacity: 1; transform: translateY(-5px) scale(1.02); } 100% { opacity: 1; transform: translateY(0) scale(1); } }
        @keyframes fireParticle { 0% { opacity: 1; transform: translateY(0) scale(1); } 100% { opacity: 0; transform: translateY(-120px) scale(0); } }
        @keyframes smokeParticle { 0% { opacity: 0.6; transform: translateY(0) scale(1); } 100% { opacity: 0; transform: translateY(-80px) scale(2.5); } }
        @keyframes timerPulse { 0% { transform: scale(1); } 50% { transform: scale(1.15); } 100% { transform: scale(1); } }
        .cockpit-card { animation: slideUp 0.4s ease-out; }
        .cockpit-card:nth-child(2) { animation-delay: 0.1s; }
        .cockpit-card:nth-child(3) { animation-delay: 0.2s; }
        .blast-off { animation: blastOff 0.5s ease-in forwards; }
        .blast-in { animation: blastIn 0.5s ease-out forwards; }
      `}</style>
      <button onClick={onExit} className="fixed top-3 right-3 z-50 w-10 h-10 lg:w-8 lg:h-8 rounded-full bg-white/10 hover:bg-white/25 border border-white/20 flex items-center justify-center text-sm lg:text-xs text-white/60 transition-all hover:scale-110">✕</button>

      {/* Left: Widget + Buttons */}
      <div className="w-full lg:w-72 lg:h-full overflow-y-auto p-3 border-b lg:border-r lg:border-b-0 border-white/5 shrink-0 flex flex-col gap-3">
        <TradingModeWidget apiBase="/.netlify/functions" getAuthHeaders={getAuthHeaders} />
        
        <div className="text-[10px] text-white/30 uppercase tracking-widest">STATE</div>
        <div className="grid grid-cols-2 lg:flex lg:flex-col gap-1.5">
          {STATE_BUTTONS.map(btn => (
            <button key={btn.action} onClick={() => sendAction(btn.action)}
              className="text-sm font-bold px-4 py-2.5 rounded-xl transition-all border hover:scale-105 w-full text-left"
              style={{ background: `${btn.color}12`, color: btn.color, borderColor: `${btn.color}30` }}
              onMouseEnter={e => { e.currentTarget.style.background = `${btn.color}25`; }}
              onMouseLeave={e => { e.currentTarget.style.background = `${btn.color}12`; }}
            >{btn.icon} {btn.label}</button>
          ))}
        </div>
        
        {/* Voice toggle */}
        <div className="flex items-center gap-2 mt-1">
          <button onClick={() => { const m = toggleVoiceMute(); setState((p: any) => ({ ...p, _voiceMuted: m })); }}
            className="text-xs px-3 py-1.5 rounded-lg border transition-all hover:scale-105"
            style={{ borderColor: state?._voiceMuted ? '#ef444450' : '#10b98150', background: state?._voiceMuted ? '#ef444412' : '#10b98112', color: state?._voiceMuted ? '#ef4444' : '#10b981' }}
          >{state?._voiceMuted ? '🔇 Voice OFF' : '🔊 Voice ON'}</button>
        </div>

        <div className="text-[10px] text-white/30 uppercase tracking-widest mt-1">STRATEGIES</div>
        <div className="grid grid-cols-2 lg:flex lg:flex-col gap-1.5">
          {strategies.map(s => {
            const ss = state?.strategyStats?.[s];
            const sWins = ss?.wins || 0;
            const sLosses = ss?.losses || 0;
            const sTotal = sWins + sLosses;
            const sRate = sTotal > 0 ? Math.round((sWins / sTotal) * 100) : null;
            return (
              <button key={s} onClick={() => sendAction('strategy', { strategy: s })}
                className={`text-sm font-medium px-4 py-2.5 rounded-xl transition-all border hover:scale-105 w-full text-left ${state?.currentStrategy === s ? 'text-purple-300 border-purple-400/40' : 'text-white/70 border-white/15'}`}
                style={{ background: state?.currentStrategy === s ? 'rgba(168,85,247,0.2)' : 'rgba(255,255,255,0.04)' }}
              >{s}{sRate != null ? <span className={`ml-1.5 text-xs ${sRate >= 50 ? 'text-emerald-400' : 'text-red-400'}`}>({sRate}%)</span> : ''}</button>
            );
          })}
        </div>
      </div>

      {/* Center */}
      <div className="flex-1 flex flex-col items-center justify-start lg:justify-center gap-4 px-3 lg:px-6 pt-3 lg:pt-0">
        {/* Timer - centered top */}
      <div className="flex justify-center mt-2" style={{ position: 'relative', zIndex: 10 }}>
        {timer && <span className="text-3xl font-bold text-white/80 rounded-full bg-white/5 border border-white/15 flex items-center justify-center animate-[timerPulse_1s_ease-in-out_infinite]" style={{ width: 110, height: 110, boxShadow: '0 0 30px rgba(168,85,247,0.25)' }}><span className="text-xl mr-2">⏱</span>{timer}</span>}
      </div>

      {/* Top info bar */}
        <div className="flex items-center gap-4 flex-wrap justify-center">
          <span className="text-2xl font-bold uppercase tracking-tight transition-all duration-300" style={{ color: cfg.color }}>{cfg.label}</span>
          {state?.currentStrategy && <span className="text-base text-purple-400/80 px-4 py-1.5 rounded-lg bg-purple-500/10 border border-purple-400/30">{state.freshSetup ? '⚡ ' : '🔁 '}{state.currentStrategy}{state.freshSetup ? '' : ` #${state.strategyAttempts}`}</span>}
          {!propMode && linkedPropId && linkedPropId !== 'none' && <span className="text-xs text-yellow-400/60 px-2 py-1 rounded bg-yellow-500/5 border border-yellow-400/20">📋 Copying to {linkedPropId.slice(0, 8)}</span>}
          {propMode && selectedAccountId && <span className="text-xs text-purple-400/60 px-2 py-1 rounded bg-purple-500/5 border border-purple-400/20">🏢 {selectedAccountId.slice(0, 8)}</span>}
          {/* Daily stats */}
          <span className="text-lg font-bold text-white/70 px-4 py-2 rounded-lg bg-white/5 border border-white/10">
            📊 {state?.dailyWins || 0}W / {state?.dailyLosses || 0}L
          </span>
          <span className={`text-lg font-bold px-4 py-2 rounded-lg border ${streak > 2 ? 'bg-emerald-500/20 text-emerald-300 border-emerald-400/50' : streak < -1 ? 'bg-red-500/20 text-red-300 border-red-400/50' : 'bg-white/5 text-white/50 border-white/10'}`}>
            {streakIcon} {streak > 0 ? `${streak} in a row` : streak < 0 ? `${Math.abs(streak)} in a row` : '—'}
          </span>
          {/* Timer - big, round, pulsing */}
        </div>

        {/* Account card */}
        <div style={{ position: 'relative' }}>
          {blasting && (
            <div style={{ position: 'absolute', inset: 0, zIndex: 20, pointerEvents: 'none', display: 'flex', justifyContent: 'center', alignItems: 'flex-end', paddingBottom: '10px' }}>
              {/* Rocket fire plume */}
              <div style={{ position: 'absolute', bottom: -10, left: '30%', width: '40%', height: 80, background: 'linear-gradient(to top, #ef4444 0%, #f97316 30%, #eab308 60%, transparent 100%)', borderRadius: '50% 50% 30% 30%', filter: 'blur(12px)', animation: 'fireParticle 0.5s ease-out forwards' }} />
              <div style={{ position: 'absolute', bottom: -5, left: '35%', width: '30%', height: 60, background: 'linear-gradient(to top, #fbbf24 0%, #f97316 40%, transparent 100%)', borderRadius: '50%', filter: 'blur(20px)', animation: 'fireParticle 0.45s ease-out 0.05s forwards' }} />
              <div style={{ position: 'absolute', bottom: 0, left: '38%', width: '24%', height: 40, background: 'linear-gradient(to top, #fef3c7 0%, #f59e0b 50%, transparent 100%)', borderRadius: '50%', filter: 'blur(8px)', animation: 'fireParticle 0.4s ease-out 0.1s forwards' }} />
              {/* Smoke clouds */}
              <div style={{ position: 'absolute', bottom: 5, left: '20%', width: 60, height: 50, borderRadius: '50%', background: 'rgba(200,200,200,0.4)', filter: 'blur(20px)', animation: 'smokeParticle 0.7s ease-out forwards' }} />
              <div style={{ position: 'absolute', bottom: 5, right: '20%', width: 50, height: 45, borderRadius: '50%', background: 'rgba(180,180,180,0.35)', filter: 'blur(18px)', animation: 'smokeParticle 0.8s ease-out 0.1s forwards' }} />
              <div style={{ position: 'absolute', bottom: 0, left: '30%', width: 40, height: 40, borderRadius: '50%', background: 'rgba(220,220,220,0.3)', filter: 'blur(15px)', animation: 'smokeParticle 0.65s ease-out 0.05s forwards' }} />
              <div style={{ position: 'absolute', bottom: 0, right: '30%', width: 35, height: 35, borderRadius: '50%', background: 'rgba(200,200,200,0.25)', filter: 'blur(14px)', animation: 'smokeParticle 0.75s ease-out 0.15s forwards' }} />
            </div>
          )}
          <div className="w-full max-w-md lg:max-w-xl ${blasting ? 'blast-off' : 'blast-in'}">
          <div className="group">
            <NeonCard glow={ddPct > 80 ? 'pink' : 'purple'} className="relative overflow-hidden p-6">
              <div className="absolute inset-0 opacity-0 group-hover:opacity-25 transition-opacity duration-700 pointer-events-none" style={{ background: `conic-gradient(from 0deg at 50% 50%, transparent 0deg, rgba(34,211,238,0.08) 60deg, rgba(168,85,247,0.08) 120deg, rgba(236,72,153,0.08) 180deg, rgba(34,211,238,0.08) 240deg, rgba(168,85,247,0.08) 300deg, transparent 360deg)`, filter: 'blur(2px)' }} />
              <div className="relative z-10">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <span className="text-3xl font-bold text-white/90">{acct?.nickname || acct?.displayLabel || 'Account'}</span>
                    <span className="px-3 py-1 text-sm font-bold uppercase rounded" style={{ background: `${phaseInfo.color}20`, color: phaseInfo.color, border: `1px solid ${phaseInfo.color}50` }}>{phaseInfo.label}</span>
                    {acctList.length > 1 && <span className="text-sm text-white/50">({accountIdx + 1}/{acctList.length})</span>}
                    {nextAccount && <span className="text-xs text-white/30 ml-2">Next: {nextAccount.nickname || nextAccount.displayLabel}</span>}
                  </div>
                  {acctSize > 0 && <span className="text-base text-white/40 font-mono">${(acctSize / 1000).toFixed(0)}K</span>}
                </div>
                <div className="flex items-end gap-6 mb-3">
                  <div>
                    <div className="text-xs text-white/40 uppercase mb-1">Balance</div>
                    <div className="text-4xl font-bold tracking-tight" style={{ color: bal >= 0 ? '#22d3ee' : '#ef4444' }}>{fmtUSD(bal)}</div>
                  </div>
                  <div>
                    <div className="text-xs text-white/40 uppercase mb-1">Daily DD Remaining</div>
                    <div className={`text-2xl font-bold ${dailyDDRemaining <= 200 ? 'text-red-400' : dailyDDRemaining <= 500 ? 'text-amber-400' : 'text-emerald-400'}`}>{fmtUSD(dailyDDRemaining)}</div>
                  </div>
                  <div>
                    <div className="text-xs text-white/40 uppercase mb-1">Drawdown</div>
                    <div className={`text-xl font-bold ${ddPct > 80 ? 'text-pink-400' : 'text-amber-400'}`}>{fmtUSD(ddUsed)}<span className="text-xs ml-1">/ {fmtUSD(maxDD)}</span></div>
                  </div>
                </div>
                {/* Drawdown bar */}
                {maxDD > 0 && (
                  <div className="mb-2 relative h-2 bg-white/5 rounded-full overflow-hidden">
                    <div className="h-full rounded-full transition-all duration-500" style={{ width: `${ddPct}%`, background: ddPct > 80 ? 'linear-gradient(90deg, #f59e0b, #ef4444)' : 'linear-gradient(90deg, #22d3ee, #a855f7)' }}/>
                  </div>
                )}
                {/* Payout progress */}
                {trueTarget > 0 && (
                  <div>
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="text-white/40">Payout Progress</span>
                      <span className={totalProfit >= trueTarget ? 'text-emerald-400' : 'text-white/50'}>{fmtUSD(totalProfit)} / {fmtUSD(trueTarget)}</span>
                    </div>
                    <div className="relative h-2 bg-white/5 rounded-full overflow-hidden">
                      <div className="h-full rounded-full transition-all duration-500" style={{ width: `${payoutPct}%`, background: payoutPct >= 100 ? 'linear-gradient(90deg, #10b981, #22d3ee)' : 'linear-gradient(90deg, #a855f7, #22d3ee)' }}/>
                    </div>
                  </div>
                )}
              </div>
            </NeonCard>
          </div>
          </div>
        </div>

        {/* Done Trading + Undo + Cooldown */}
        <div className="flex items-center gap-3">
          {inCooldown && <span className="text-lg font-bold text-red-400 animate-pulse">🕐 COOLDOWN</span>}
          <button onClick={() => setShowDonePrompt(true)} className="px-8 py-4 rounded-2xl border-2 font-bold text-lg transition-all hover:scale-110" style={{ background: '#ef444415', color: '#ef4444', borderColor: '#ef444450', boxShadow: '0 0 30px rgba(239,68,68,0.2)' }} onMouseEnter={e => { e.currentTarget.style.background = '#ef444430'; }} onMouseLeave={e => { e.currentTarget.style.background = '#ef444415'; }}>⏭ DONE TRADING</button>
          <button onClick={undoLast} className="px-4 py-3 rounded-xl border font-bold text-sm transition-all hover:scale-105" style={{ background: 'rgba(245,158,11,0.1)', color: '#f59e0b', borderColor: 'rgba(245,158,11,0.3)' }}>↩ Undo</button>
        </div>
      </div>

      {/* Right: Rules + Daily stats */}
      <div className="w-full lg:w-80 lg:h-full overflow-y-auto p-5 border-t lg:border-l lg:border-t-0 border-white/5 shrink-0 cockpit-card">
        <h4 className="text-xs uppercase tracking-widest mb-4" style={{ color: cfg.color }}>RULES · {modeKey.toUpperCase()}</h4>
        <div className="rounded-2xl border p-5 space-y-3" style={{ borderColor: `${cfg.color}30`, background: `${cfg.color}06`, boxShadow: `0 0 30px ${cfg.color}10` }}>
          {currentRules.length > 0 ? currentRules.map((rule, i) => (
            <div key={i} className="text-xl font-bold tracking-tight leading-relaxed" style={{ color: cfg.color, textShadow: `0 0 20px ${cfg.color}40` }}>{rule}</div>
          )) : <div className="text-white/40 text-sm">No rules set for this mode.</div>}
        </div>
        {/* Daily trade summary */}
        <div className="mt-4 rounded-2xl border border-white/10 p-4 bg-white/5">
          <h5 className="text-xs uppercase text-white/30 tracking-widest mb-2">Today</h5>
          <div className="flex items-center justify-between text-sm">
            <span>Wins: <span className="text-emerald-400 font-bold">{state?.dailyWins || 0}</span></span>
            <span>Losses: <span className="text-red-400 font-bold">{state?.dailyLosses || 0}</span></span>
            <span>Streak: <span className={`font-bold ${streak > 0 ? 'text-emerald-400' : streak < 0 ? 'text-red-400' : 'text-white/50'}`}>{streakIcon} {streak > 0 ? streak : streak < 0 ? Math.abs(streak) : '0'}</span></span>
          </div>
        </div>
        {/* Trades left */}
        {maxLoss > 0 && (
          <div className="mt-3 rounded-2xl border p-4 text-center" style={{ borderColor: `${tradesLeft <= 1 ? '#ef4444' : cfg.color}30`, background: `${tradesLeft <= 1 ? '#ef4444' : cfg.color}06` }}>
            <div className="text-[10px] text-white/40 uppercase tracking-widest mb-1">TRADES LEFT</div>
            <div className={`text-4xl font-bold ${tradesLeft <= 1 ? 'text-red-400' : 'text-white/90'}`}>{tradesLeft}</div>
          </div>
        )}
      </div>



      {/* Strategy Prompt */}
      {showStratPrompt && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-[#020408] border border-white/15 rounded-2xl p-6 w-full max-w-md mx-4 shadow-2xl">
            <h3 className="text-lg font-bold text-white mb-1">📌 {pendingStrategy}</h3>
            <p className="text-xs text-white/40 mb-4">Tell me about this setup</p>
            
            <div className="mb-3">
              <div className="text-[10px] text-white/40 uppercase mb-1.5">Setup Timeframe</div>
              <div className="flex flex-wrap gap-1.5">
                {(promptOptions.setup_tf || [{value:'15s',label:'15s'},{value:'1m',label:'1m'},{value:'3m',label:'3m'},{value:'5m',label:'5m'},{value:'15m',label:'15m'},{value:'30m',label:'30m'},{value:'1h',label:'1h'}]).map(opt => (
                  <button key={opt.value} onClick={() => setStratSetupTf(opt.value)}
                    className={`text-sm px-3 py-1.5 rounded-lg transition-all border ${stratSetupTf === opt.value ? 'text-cyan-300 border-cyan-400/50 bg-cyan-500/15' : 'text-white/50 border-white/10 bg-white/5'}`}
                  >{opt.label}</button>
                ))}
              </div>
            </div>
            
            <div className="mb-3">
              <div className="text-[10px] text-white/40 uppercase mb-1.5">Entry Timeframe</div>
              <div className="flex flex-wrap gap-1.5">
                {(promptOptions.entry_tf || [{value:'15s',label:'15s'},{value:'1m',label:'1m'},{value:'3m',label:'3m'},{value:'5m',label:'5m'},{value:'15m',label:'15m'},{value:'30m',label:'30m'},{value:'1h',label:'1h'}]).map(opt => (
                  <button key={opt.value} onClick={() => setStratEntryTf(opt.value)}
                    className={`text-sm px-3 py-1.5 rounded-lg transition-all border ${stratEntryTf === opt.value ? 'text-purple-300 border-purple-400/50 bg-purple-500/15' : 'text-white/50 border-white/10 bg-white/5'}`}
                  >{opt.label}</button>
                ))}
              </div>
            </div>
            
            <div className="mb-3">
              <div className="text-[10px] text-white/40 uppercase mb-1.5">SL Placement</div>
              <div className="flex flex-wrap gap-1.5">
                {(promptOptions.sl_placement || [{value:'below_entry',label:'Below Entry'},{value:'below_setup',label:'Below Setup'},{value:'wide',label:'Wide SL'},{value:'hard',label:'Hard SL'},{value:'mental',label:'Mental SL'}]).map(opt => (
                  <button key={opt.value} onClick={() => setStratSlPlace(opt.value)}
                    className={`text-sm px-3 py-1.5 rounded-lg transition-all border ${stratSlPlace === opt.value ? 'text-amber-300 border-amber-400/50 bg-amber-500/15' : 'text-white/50 border-white/10 bg-white/5'}`}
                  >{opt.label}</button>
                ))}
              </div>
            </div>

            <div className="mb-5">
              <div className="text-[10px] text-white/40 uppercase mb-1.5">Variant Notes</div>
              <input type="text" value={stratVariant} onChange={e => { setStratVariant(e.target.value); setFilteredVariants(variantHistory.filter(v => v.toLowerCase().includes(e.target.value.toLowerCase()))); }}
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white/80 placeholder-white/30 outline-none focus:border-purple-400/50 transition-colors"
                placeholder="e.g. RSI div in lower TF, below structure..."
              />
              {filteredVariants.length > 0 && stratVariant && (
                <div className="mt-1 flex flex-wrap gap-1">
                  {filteredVariants.slice(0, 5).map(v => (
                    <button key={v} onClick={() => { setStratVariant(v); setFilteredVariants([]); }}
                      className="text-xs px-2 py-1 rounded bg-purple-500/10 text-purple-300 border border-purple-400/20"
                    >{v}</button>
                  ))}
                </div>
              )}
            </div>

            <div className="flex gap-3">
              <button onClick={() => setShowStratPrompt(false)} className="flex-1 px-4 py-3 rounded-xl border text-sm text-white/50 border-white/15">Cancel</button>
              <button onClick={confirmStrategy} className="flex-1 px-4 py-3 rounded-xl border-2 text-sm font-bold" style={{ borderColor: '#a855f750', background: '#a855f715', color: '#a855f7' }}>✅ Confirm Strategy</button>
            </div>
          </div>
        </div>
      )}

      {/* Account Picker (Prop mode) */}
      {showAccountPicker && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-[#020408] border border-white/15 rounded-2xl p-6 w-full max-w-md mx-4 shadow-2xl">
            <h3 className="text-lg font-bold text-white mb-2">Select Account</h3>
            <p className="text-sm text-white/50 mb-4">Choose which account to trade this session</p>
            <div className="space-y-2 mb-5">
              {displayAccounts.map((a: any) => (
                <button key={a.id || a.nickname} onClick={() => { setSelectedAccountId(a.nickname || a.displayLabel || a.id); setAccountIdx(0); setShowAccountPicker(false); if (propMode) { const items = accounts.map((x: any) => x.nickname || x.displayLabel || x.id); setPendingAccountOrder(items); setShowOrderArranger(true); } else { setShowLinkPrompt(true); } }}
                  className={`w-full text-left px-4 py-3 rounded-xl border transition-all hover:scale-[1.02]`}
                  style={{ borderColor: `${a.phase === 'live' ? '#a3e635' : a.phase === 'funded' ? '#22d3ee' : a.phase === 'personal' ? '#22d3ee' : '#a855f7'}40`, background: `${a.phase === 'live' ? '#a3e635' : a.phase === 'funded' ? '#22d3ee' : a.phase === 'personal' ? '#22d3ee' : '#a855f7'}08` }}
                >
                  <div className="font-bold text-white">{getDisplayName(a)}</div>
                  <div className="flex items-center gap-2">
                    <div className="text-xs text-white/40">{a.phase?.toUpperCase()} · {a.balance ? '$' + parseFloat(a.balance).toFixed(0) : ''} {a.linkingSupported ? '🔗' : ''}</div>
                    <button onClick={(e) => { e.stopPropagation(); setRenamingAccount(a.id || a.nickname); setRenameValue(getDisplayName(a)); }} className="text-white/20 hover:text-white/60 text-xs ml-1">✎</button>
                  </div>
                </button>
              ))}
            </div>
            <button onClick={() => setShowAccountPicker(false)} className="text-sm text-white/40">Cancel</button>
          </div>
        </div>
      )}

      {/* Rename Account Modal */}
      {renamingAccount && (
        <div className="fixed inset-0 z-[65] flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setRenamingAccount('')}>
          <div className="bg-[#020408] border border-white/15 rounded-xl p-4 w-full max-w-xs mx-4 shadow-2xl" onClick={e => e.stopPropagation()}>
            <h4 className="text-sm font-bold text-white mb-3">Rename Account</h4>
            <input type="text" value={renameValue} onChange={e => setRenameValue(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white/80 outline-none focus:border-purple-400/50 mb-3"
              autoFocus onKeyDown={e => e.key === 'Enter' && renameAccount(renamingAccount)}
            />
            <div className="flex gap-2">
              <button onClick={() => setRenamingAccount('')} className="flex-1 px-3 py-2 rounded-lg border text-xs text-white/50 border-white/15">Cancel</button>
              <button onClick={() => renameAccount(renamingAccount)} className="flex-1 px-3 py-2 rounded-lg border-2 text-xs font-bold" style={{ borderColor: '#a855f750', background: '#a855f715', color: '#a855f7' }}>Save</button>
            </div>
          </div>
        </div>
      )}

      {/* Link to Prop Account (personal mode) */}
      {showLinkPrompt && (
        <div className="fixed inset-0 z-[65] flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-[#020408] border border-white/15 rounded-2xl p-6 w-full max-w-md mx-4 shadow-2xl">
            <h3 className="text-lg font-bold text-white mb-2">Link to Prop Account</h3>
            <p className="text-sm text-white/50 mb-4">Which prop account will you copy these trades to?</p>
            <div className="space-y-2 mb-5">
              {accounts.filter((a: any) => a.phase !== 'personal').map((a: any) => (
                <button key={a.id || a.nickname} onClick={() => { setLinkedPropId(a.nickname || a.displayLabel || a.id); setShowLinkPrompt(false); const items = accounts.filter((x: any) => x.phase !== 'personal').map((x: any) => x.nickname || x.displayLabel || x.id); setPendingAccountOrder(items); setShowOrderArranger(true); }}
                  className="w-full text-left px-4 py-3 rounded-xl border transition-all hover:scale-[1.02]"
                  style={{ borderColor: `${a.phase === 'live' ? '#a3e635' : a.phase === 'funded' ? '#22d3ee' : a.phase === 'personal' ? '#22d3ee' : '#a855f7'}40`, background: `${a.phase === 'live' ? '#a3e635' : a.phase === 'funded' ? '#22d3ee' : a.phase === 'personal' ? '#22d3ee' : '#a855f7'}08` }}
                >
                  <div className="font-bold text-white">{a.nickname || a.displayLabel || a.name}</div>
                  <div className="text-xs text-white/40">{a.phase?.toUpperCase()} · {a.balance ? '$' + parseFloat(a.balance).toFixed(0) : ''}</div>
                </button>
              ))}
            </div>
            <button onClick={() => { setLinkedPropId('none'); setShowLinkPrompt(false); setShowOrderArranger(!!propMode); }} className="text-sm text-white/40 hover:text-white/60">Skip — Just Personal</button>
          </div>
        </div>
      )}

      {/* Order Arranger (prop mode only) */}
      {showOrderArranger && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-[#020408] border border-white/15 rounded-2xl p-6 w-full max-w-sm mx-4 shadow-2xl">
            <h3 className="text-lg font-bold text-white mb-2">Session Order</h3>
            <p className="text-sm text-white/50 mb-4">Arrange the account order (Done Trading cycles through this)</p>
            <div className="space-y-2 mb-5">
              {pendingAccountOrder.map((aid: string, idx: number) => {
                return (
                  <div key={aid}
                    draggable
                    onDragStart={e => e.dataTransfer.setData('text/plain', aid)}
                    onDragOver={e => e.preventDefault()}
                    onDrop={e => { e.preventDefault(); const from = e.dataTransfer.getData('text/plain'); const arr = [...pendingAccountOrder]; const fi = arr.indexOf(from); if (fi >= 0) { arr.splice(fi, 1); arr.splice(idx, 0, from); setPendingAccountOrder(arr); } }}
                    className="flex items-center gap-3 px-4 py-3 rounded-xl border border-white/10 bg-white/5 cursor-grab active:cursor-grabbing">
                    <span className="text-lg font-bold text-white/30 w-6">{idx + 1}</span>
                    <span className="flex-1 font-medium text-white">{aid}</span>
                    <button onClick={(e) => { e.stopPropagation(); const arr = [...pendingAccountOrder]; if (idx > 0) { arr[idx] = arr[idx-1]; arr[idx-1] = aid; setPendingAccountOrder(arr); } }}
                      className="text-white/30 hover:text-white/60 disabled:opacity-20 text-xs px-2" disabled={idx === 0}>▲</button>
                    <button onClick={(e) => { e.stopPropagation(); const arr = [...pendingAccountOrder]; if (idx < arr.length - 1) { const t = arr[idx]; arr[idx] = arr[idx+1]; arr[idx+1] = t; setPendingAccountOrder(arr); } }}
                      className="text-white/30 hover:text-white/60 disabled:opacity-20 text-xs px-2" disabled={idx === pendingAccountOrder.length - 1}>▼</button>
                  </div>
                );
              })}
            </div>
            <button onClick={() => { setSessionStarted(true); setShowOrderArranger(false); if (pendingAccountOrder.length > 0) { const first = pendingAccountOrder[0]; const a = (propMode ? displayAccounts : accounts).find((x: any) => (x.nickname || x.displayLabel || x.id) === first); if (a) setSelectedAccountId(a.nickname || a.displayLabel || a.id); } }}
              className="w-full px-4 py-3 rounded-xl border-2 text-sm font-bold"
              style={{ borderColor: '#a855f750', background: '#a855f715', color: '#a855f7' }}
            >✅ Lock Order & Start Trading</button>
          </div>
        </div>
      )}

      {/* OUT Trade Prompt */}
      {showOutPrompt && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-[#020408] border border-white/15 rounded-2xl p-6 w-full max-w-sm mx-4 shadow-2xl text-center">
            <h3 className="text-lg font-bold text-white mb-4">How was the trade?</h3>
            <div className="flex flex-col gap-3">
              <button onClick={() => handleOutResult('green')} className="w-full px-6 py-4 rounded-xl border-2 text-base font-bold transition-all hover:scale-105" style={{ background: '#10b98115', color: '#10b981', borderColor: '#10b98150' }}>✅ Green (Win)</button>
              <button onClick={() => handleOutResult('even')} className="w-full px-6 py-4 rounded-xl border-2 text-base font-bold transition-all hover:scale-105" style={{ background: 'rgba(245,158,11,0.1)', color: '#f59e0b', borderColor: 'rgba(245,158,11,0.3)' }}>⚖️ Breakeven</button>
              <button onClick={() => handleOutResult('red')} className="w-full px-6 py-4 rounded-xl border-2 text-base font-bold transition-all hover:scale-105" style={{ background: '#ef444415', color: '#ef4444', borderColor: '#ef444450' }}>❌ Red (Loss)</button>
            </div>
          </div>
        </div>
      )}

      {/* Done Trading Prompt */}
      {showDonePrompt && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-[#020408] border border-white/15 rounded-2xl p-6 w-full max-w-sm mx-4 shadow-2xl">
            <h3 className="text-lg font-bold text-white mb-2">Done with {acct?.nickname || 'this account'}?</h3>
            <div className="flex items-center gap-3 text-sm text-white/50 mb-2">
              <span>📊 {state?.dailyWins || 0}W / {state?.dailyLosses || 0}L</span>
              <span>{streakIcon} {streak > 0 ? `${streak} streak` : streak < 0 ? `${Math.abs(streak)} streak` : ''}</span>
              {nextAccount && <span className="text-xs text-white/30">Next: {nextAccount.nickname || nextAccount.displayLabel}</span>}
            </div>
            <p className="text-sm text-white/50 mb-5">Were the trading rules followed?</p>
            <div className="flex gap-3">
              <button onClick={() => advanceAccount(false)} className="flex-1 px-4 py-3 rounded-xl border-2 text-sm font-bold transition-all hover:scale-105" style={{ background: '#ef444415', color: '#ef4444', borderColor: '#ef444450' }}>❌ Rules NOT followed</button>
              <button onClick={() => advanceAccount(true)} className="flex-1 px-4 py-3 rounded-xl border-2 text-sm font-bold transition-all hover:scale-105" style={{ background: '#10b98115', color: '#10b981', borderColor: '#10b98150' }}>✅ Rules followed</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TradingModeCockpit;