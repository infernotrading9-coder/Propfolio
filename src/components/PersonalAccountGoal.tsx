import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Target, Pencil, Check, X, Loader2 } from 'lucide-react';
import { CoinTower } from './CoinTower';

/**
 * PersonalAccountGoal — the personal account's climb, with the coin tower.
 *
 * WHY IT LIVES HERE (Trading → Personal) and not in Life → Goals any more:
 * everything it needs is already on this tab. The balance, the daily P&L and the equity
 * curve all come from `db-personal-trades`, and it sits right above Personal Trades, which
 * is its own data source. In Life → Goals it was a trading metric among life goals; Daniel
 * moved it here and re-scoped that tab to life goals only ("keep the goals but it will be
 * goals for life related stuff not trading").
 *
 * WHICH GOAL IT DRIVES: any goal whose body carries the `[balance]` marker. That marker
 * already meant "measured by the live account balance", so it doubles as the routing rule —
 * no new column, no migration, and Life just filters those goals out.
 *
 * WHY THE TARGET IS EDITABLE: "once i hit 50k i m going to aim higher." Nothing else needs
 * touching when he does — the coin count, stack count, rail and milestone stars are all
 * derived from the target, so raising it recounts the whole tower automatically.
 *
 * ⚠️ IMPORTANT: this is mounted from Dashboard.tsx, NOT from inside PersonalTab.tsx.
 * PersonalTab currently holds another agent's uncommitted refactor, and staging that file
 * would sweep their work into the commit. Dashboard is clean and already renders
 * `<PersonalTab />` for this view, so the mount lives there.
 */

const API = '/.netlify/functions/db-notes';
const TRADES_API = '/.netlify/functions/db-personal-trades';

/** Mirrors GoalsTab's marker — a goal whose body has this is measured by the account. */
const BALANCE_MARKER = /\[balance\b[^\]]*\]/i;
const DEFAULT_UNIT = 100;

const fmtMoney = (n: number): string =>
  '$' + n.toLocaleString('en-US', { maximumFractionDigits: 0 });

/** The first money amount in a title — must match GoalsTab's `moneyFromTitle`. */
function moneyFromTitle(title: string): number | null {
  const m = title.match(/\$\s?(\d[\d,]*(?:\.\d+)?)\s*([kK])?/);
  if (!m) return null;
  const n = parseFloat(m[1].replace(/,/g, ''));
  if (!isFinite(n)) return null;
  return m[2] ? n * 1000 : n;
}

/** `unit:$100` out of the marker, else the default. */
function unitFromBody(body: string | null | undefined): number {
  const m = (body || '').match(/unit:\s*\$?\s*([\d,]+)/i);
  const v = m ? parseFloat(m[1].replace(/,/g, '')) : NaN;
  return Number.isFinite(v) && v > 0 ? v : DEFAULT_UNIT;
}

/**
 * Swap the FIRST money token in a title for a new amount, leaving the rest of the wording
 * alone — "Personal account → $50,000" becomes "Personal account → $100,000" rather than
 * being regenerated, so any phrasing he has added survives. If there is no money token at
 * all (perhaps he typed an amount wrong), one is appended so the goal stays machine-readable.
 */
function withTarget(title: string, next: number): string {
  const formatted = fmtMoney(next);
  return /\$\s?\d[\d,]*(?:\.\d+)?\s*[kK]?/.test(title)
    ? title.replace(/\$\s?\d[\d,]*(?:\.\d+)?\s*[kK]?/, formatted)
    : `${title.trim()} → ${formatted}`;
}

/** Rewrite just the marker inside the body, keeping the prose around it. */
function withUnit(body: string | null, unit: number): string {
  const marker = `[balance unit:$${unit}]`;
  const b = body || '';
  if (BALANCE_MARKER.test(b)) return b.replace(BALANCE_MARKER, marker);
  return b ? `${b}\n\n${marker}` : marker;
}

interface PlanNote {
  id: string;
  title: string;
  body: string | null;
  parentId: string | null;
  horizon: string;
  completed: boolean | null;
}

export const PersonalAccountGoal: React.FC = () => {
  const [notes, setNotes] = useState<PlanNote[]>([]);
  const [balance, setBalance] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draftTarget, setDraftTarget] = useState('');
  const [draftUnit, setDraftUnit] = useState('');
  const [error, setError] = useState<string | null>(null);

  /**
   * DEV ONLY. Once the ± buttons are used the feed poll stops writing the balance, or the
   * real value would snap back mid-test and the animation would look like it fired at random.
   */
  const devManual = useRef(false);

  const getAuthHeaders = useCallback(() => {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    try {
      const raw = localStorage.getItem('user');
      if (raw) {
        const u = JSON.parse(raw);
        if (u?.id) headers['X-User-Id'] = String(u.id);
        if (u?.email) headers['X-User-Email'] = String(u.email);
        if (u?.name) headers['X-User-Name'] = String(u.name);
      }
    } catch { /* not signed in yet */ }
    return headers;
  }, []);

  const loadNotes = useCallback(async () => {
    try {
      const res = await fetch(`${API}?action=list-notes`, { headers: getAuthHeaders() });
      if (!res.ok) throw new Error(`Failed to load goals (${res.status})`);
      const data = await res.json();
      setNotes(data.notes || []);
    } catch (e: any) {
      setError(e?.message || 'Failed to load goals');
    } finally {
      setLoading(false);
    }
  }, [getAuthHeaders]);

  useEffect(() => { void loadNotes(); }, [loadNotes]);

  useEffect(() => {
    let alive = true;
    const pull = async () => {
      try {
        const res = await fetch(`${TRADES_API}?action=stats`, { headers: getAuthHeaders() });
        if (!res.ok) return;
        const d = await res.json();
        const b = d?.stats?.balance;
        if (alive && !devManual.current && typeof b === 'number' && Number.isFinite(b)) setBalance(b);
      } catch { /* leave it null — the tower says it is waiting */ }
    };
    void pull();
    // Re-pulled on a timer: the coin animation fires on the CHANGE in coins held, so a
    // one-shot fetch could never trigger it.
    const t = window.setInterval(pull, 60_000);
    return () => { alive = false; window.clearInterval(t); };
  }, [getAuthHeaders]);

  /** The account goal — first balance-tracked note with a parseable target. */
  const goal = useMemo(
    () => notes.find((n) => BALANCE_MARKER.test(n.body || '') && (moneyFromTitle(n.title) ?? 0) > 0) ?? null,
    [notes],
  );

  const target = goal ? moneyFromTitle(goal.title) ?? 0 : 0;
  const unit = goal ? unitFromBody(goal.body) : DEFAULT_UNIT;

  /** The goal's own children, as read-only milestone markers. */
  const milestones = useMemo(() => {
    if (!goal) return [];
    return notes
      .filter((n) => n.parentId === goal.id)
      .map((n) => ({ note: n, value: moneyFromTitle(n.title) }))
      .filter((x): x is { note: PlanNote; value: number } => x.value != null && x.value > 0 && x.value <= target)
      .sort((a, b) => a.value - b.value);
  }, [notes, goal, target]);

  const startEdit = () => {
    if (!goal) return;
    setDraftTarget(String(target));
    setDraftUnit(String(unit));
    setEditing(true);
  };

  const saveEdit = async () => {
    if (!goal) return;
    const nextTarget = Math.round(Number(String(draftTarget).replace(/[^\d.]/g, '')));
    const nextUnit = Math.round(Number(String(draftUnit).replace(/[^\d.]/g, '')));
    if (!Number.isFinite(nextTarget) || nextTarget <= 0) {
      setError('Enter a target above zero.');
      return;
    }
    if (!Number.isFinite(nextUnit) || nextUnit <= 0 || nextUnit > nextTarget) {
      setError('Coin size must be above zero and no larger than the target.');
      return;
    }
    setSaving(true);
    setError(null);
    const title = withTarget(goal.title, nextTarget);
    const body = withUnit(goal.body, nextUnit);
    // Optimistic, so the tower and its ring update on the same frame rather than after a
    // round-trip — raising the target should feel instant.
    setNotes((prev) => prev.map((n) => (n.id === goal.id ? { ...n, title, body } : n)));
    setEditing(false);
    try {
      const res = await fetch(API, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ action: 'update-note', id: goal.id, title, body }),
      });
      if (!res.ok) throw new Error(`Save failed (${res.status})`);
    } catch (e: any) {
      setError(e?.message || 'Could not save the target');
      void loadNotes();   // put the real state back
    } finally {
      setSaving(false);
    }
  };

  /** DEV ONLY — ± one coin so the animation can be watched. Local state, never the account. */
  const devNudge = (delta: number) => {
    devManual.current = true;
    setBalance((b) => Math.max(0, (b ?? 0) + delta));
  };

  if (loading) {
    return (
      <div className="mb-6 flex items-center gap-2 text-sm text-white/40">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading your account goal…
      </div>
    );
  }

  // Nothing to show if he has no balance-tracked goal — better than an empty tower frame.
  if (!goal) {
    return (
      <div className="mb-6 rounded-xl border border-dashed border-white/10 p-3 text-[11px] text-white/35">
        No account goal yet. A goal whose notes contain <code className="text-amber-200/70">[balance]</code> is
        measured by your live account balance and grows the coin tower here.
      </div>
    );
  }

  return (
    <section className="mb-6">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Target className="h-4 w-4 text-amber-300" />
          <h2 className="text-sm font-bold text-amber-200">Personal account</h2>
        </div>

        {editing ? (
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-1 text-[11px] text-white/50">
              Target
              <input
                autoFocus
                value={draftTarget}
                onChange={(e) => setDraftTarget(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') void saveEdit(); if (e.key === 'Escape') setEditing(false); }}
                inputMode="numeric"
                className="w-24 rounded-md border border-white/15 bg-white/5 px-2 py-1 text-xs text-white outline-none focus:border-amber-400/60"
              />
            </label>
            <label className="flex items-center gap-1 text-[11px] text-white/50">
              Per coin $
              <input
                value={draftUnit}
                onChange={(e) => setDraftUnit(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') void saveEdit(); if (e.key === 'Escape') setEditing(false); }}
                inputMode="numeric"
                className="w-16 rounded-md border border-white/15 bg-white/5 px-2 py-1 text-xs text-white outline-none focus:border-amber-400/60"
              />
            </label>
            <button
              onClick={() => void saveEdit()}
              disabled={saving}
              className="flex items-center gap-1 rounded-md border border-emerald-400/50 bg-emerald-400/15 px-2 py-1 text-[11px] font-bold text-emerald-100 hover:bg-emerald-400/25 disabled:opacity-50"
            >
              {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />} Save
            </button>
            <button
              onClick={() => setEditing(false)}
              className="rounded-md border border-white/15 p-1 text-white/50 hover:text-white"
              aria-label="Cancel"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        ) : (
          <button
            onClick={startEdit}
            title="Change the target — the tower recounts itself"
            className="flex items-center gap-1.5 rounded-md border border-white/15 bg-white/5 px-2.5 py-1 text-xs font-bold text-white/70 transition-colors hover:bg-white/10 hover:text-white"
          >
            {fmtMoney(target)}
            <Pencil className="h-3 w-3 opacity-60" />
          </button>
        )}
      </div>

      {/* Milestone markers. Read-only by design: they light up when the BALANCE crosses them,
          so they can never say 100% while the account says otherwise. */}
      {milestones.length > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-x-2 gap-y-1">
          {milestones.map((m) => {
            const passed = (balance ?? 0) >= m.value;
            return (
              <span
                key={m.note.id}
                title={`${m.note.title} — lights up on its own at ${fmtMoney(m.value)}`}
                className={`rounded px-1.5 py-0.5 text-[10px] font-medium transition-colors ${
                  passed ? 'bg-amber-400/15 text-amber-200' : 'bg-white/5 text-white/40'
                }`}
              >
                {passed ? '★ ' : ''}{fmtMoney(m.value)}
              </span>
            );
          })}
        </div>
      )}

      <CoinTower
        target={target}
        unit={unit}
        balance={balance}
        onNudge={import.meta.env.DEV ? devNudge : undefined}
      />

      {error && <p className="mt-2 text-[11px] text-rose-300">{error}</p>}
    </section>
  );
};

export default PersonalAccountGoal;
