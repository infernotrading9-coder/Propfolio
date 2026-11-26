import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  StickyNote, Plus, Trash2, Pencil, Check, ChevronDown, ChevronRight,
  ListChecks, Zap, Target, Mountain, X, Loader2, AlertCircle, CornerDownRight, Link2,
} from 'lucide-react';

export type Horizon = 'daily' | 'short_term' | 'mid_term' | 'long_term';

interface PlanNote {
  id: string;
  horizon: Horizon;
  title: string;
  body: string | null;
  priority: number | null;
  parentId: string | null;
  sortOrder: number | null;
  completed: boolean | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

// Full class strings per horizon — never interpolate Tailwind fragments, they
// get purged and silently render unstyled.
const HORIZONS: {
  key: Horizon;
  label: string;
  blurb: string;
  icon: React.ComponentType<{ className?: string }>;
  accentText: string;
  accentBorder: string;
  accentBg: string;
  barBg: string;
}[] = [
  {
    key: 'daily',
    label: 'Daily',
    blurb: 'Today’s checklist',
    icon: ListChecks,
    accentText: 'text-emerald-300',
    accentBorder: 'border-emerald-400/30',
    accentBg: 'bg-emerald-400/10',
    barBg: 'bg-emerald-400',
  },
  {
    key: 'short_term',
    label: 'Short-Term',
    blurb: 'This week',
    icon: Zap,
    accentText: 'text-cyan-300',
    accentBorder: 'border-cyan-400/30',
    accentBg: 'bg-cyan-400/10',
    barBg: 'bg-cyan-400',
  },
  {
    key: 'mid_term',
    label: 'Mid-Term',
    blurb: 'This month',
    icon: Target,
    accentText: 'text-amber-300',
    accentBorder: 'border-amber-400/30',
    accentBg: 'bg-amber-400/10',
    barBg: 'bg-amber-400',
  },
  {
    key: 'long_term',
    label: 'Long-Term',
    blurb: 'The big goal',
    icon: Mountain,
    accentText: 'text-violet-300',
    accentBorder: 'border-violet-400/30',
    accentBg: 'bg-violet-400/10',
    barBg: 'bg-violet-400',
  },
];

const HORIZON_LABEL: Record<Horizon, string> = {
  daily: 'Daily',
  short_term: 'Short',
  mid_term: 'Mid',
  long_term: 'Long',
};

const API = '/.netlify/functions/db-notes';

// ── Milestone math ───────────────────────────────────────────────────────────
// Daniel's goals already ARE a ladder of money milestones: "Grow personal account
// to $20K" has mid-term children "First $500" → "Reach $1,000" → "Scale to $5K" →
// "Scale to $10K" → "Scale to $20K". Those children are the notches, so the bar is
// derived from the tree and needs no schema change. A goal whose titles carry no
// money still works — its children just become plain named steps.

/** The first money amount in a title: "Scale to $5K" → 5000, "Reach $1,000" → 1000. */
function moneyFromTitle(title: string): number | null {
  const m = title.match(/\$\s?(\d[\d,]*(?:\.\d+)?)\s*([kK])?/);
  if (!m) return null;
  const n = parseFloat(m[1].replace(/,/g, ''));
  if (!isFinite(n)) return null;
  return m[2] ? n * 1000 : n;
}

function fmtMoney(n: number): string {
  return '$' + n.toLocaleString('en-US', { maximumFractionDigits: 0 });
}

/** Short label for a milestone chip / bar segment: the money, else the name. */
function milestoneLabel(title: string): string {
  const v = moneyFromTitle(title);
  return v == null ? title : fmtMoney(v);
}

/** The chip shown on a step: the nearest mid-term milestone above it. */
const MILESTONE_CHIP = 'border border-amber-400/30 bg-amber-400/10 text-amber-200';



export const GoalsTab: React.FC = () => {
  const [notes, setNotes] = useState<PlanNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<PlanNote | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalHorizon, setModalHorizon] = useState<Horizon>('daily');
  const [modalParent, setModalParent] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  // The execution column shows what's still open; finished steps fold away behind
  // a counter so they never push today's work down the screen.
  const [showDoneSteps, setShowDoneSteps] = useState(false);

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
    } catch {}
    return headers;
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API}?action=list-notes`, { headers: getAuthHeaders() });
      if (!res.ok) throw new Error(`Failed to load notes (${res.status})`);
      const data = await res.json();
      setNotes(data.notes || []);
    } catch (e: any) {
      setError(e?.message || 'Failed to load notes');
    } finally {
      setLoading(false);
    }
  }, [getAuthHeaders]);

  useEffect(() => { load(); }, [load]);

  // ── Tree ──────────────────────────────────────────────────────────────────
  const byId = useMemo(() => {
    const m = new Map<string, PlanNote>();
    for (const n of notes) m.set(n.id, n);
    return m;
  }, [notes]);

  const childrenOf = useMemo(() => {
    const m = new Map<string, PlanNote[]>();
    for (const n of notes) {
      if (!n.parentId) continue;
      // Defensive: ignore a parent link that points outside the loaded set,
      // otherwise the child would render nowhere.
      if (!byId.has(n.parentId)) continue;
      if (!m.has(n.parentId)) m.set(n.parentId, []);
      m.get(n.parentId)!.push(n);
    }
    for (const arr of m.values()) arr.sort(sortSiblings);
    return m;
  }, [notes, byId]);

  /**
   * A note counts as done if it is ticked, OR if it has steps and every step
   * is done — that's the domino: finishing the last step completes the goal.
   * `seen` guards against a cycle the API should already have blocked.
   */
  const effectiveDone = useCallback((id: string, seen: Set<string> = new Set()): boolean => {
    if (seen.has(id)) return false;
    seen.add(id);
    const n = byId.get(id);
    if (!n) return false;
    if (n.completed) return true;
    const kids = childrenOf.get(id) || [];
    if (kids.length === 0) return false;
    return kids.every((k) => effectiveDone(k.id, seen));
  }, [byId, childrenOf]);

  const progressOf = useCallback((id: string): { done: number; total: number } | null => {
    const kids = childrenOf.get(id) || [];
    if (kids.length === 0) return null;
    return { done: kids.filter((k) => effectiveDone(k.id)).length, total: kids.length };
  }, [childrenOf, effectiveDone]);


  // ── Mutations ─────────────────────────────────────────────────────────────
  const openCreate = (horizon: Horizon, parentId: string | null = null) => {
    setEditing(null);
    setModalHorizon(horizon);
    setModalParent(parentId);
    setModalOpen(true);
  };

  const openEdit = (note: PlanNote) => {
    setEditing(note);
    setModalHorizon(note.horizon);
    setModalParent(note.parentId ?? null);
    setModalOpen(true);
  };

  const toggleComplete = async (note: PlanNote) => {
    const next = !note.completed;
    setBusy((b) => ({ ...b, [note.id]: true }));
    // Optimistic — revert on failure so a failed write can't look saved.
    setNotes((prev) => prev.map((n) => (n.id === note.id ? { ...n, completed: next } : n)));
    try {
      const res = await fetch(API, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ action: 'update-note', id: note.id, completed: next }),
      });
      if (!res.ok) throw new Error(`Update failed (${res.status})`);
    } catch (e: any) {
      setNotes((prev) => prev.map((n) => (n.id === note.id ? { ...n, completed: note.completed } : n)));
      setError(e?.message || 'Could not update note');
    } finally {
      setBusy((b) => { const c = { ...b }; delete c[note.id]; return c; });
    }
  };

  const remove = async (note: PlanNote) => {
    const kids = childrenOf.get(note.id) || [];
    const msg = kids.length
      ? `Delete "${note.title}" and its ${kids.length} step${kids.length > 1 ? 's' : ''}?`
      : `Delete "${note.title}"?`;
    if (!window.confirm(msg)) return;

    setBusy((b) => ({ ...b, [note.id]: true }));
    try {
      const res = await fetch(API, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ action: 'delete-note', id: note.id }),
      });
      if (!res.ok) throw new Error(`Delete failed (${res.status})`);
      // Cascade removed descendants — drop the whole subtree locally too.
      const doomed = new Set<string>([note.id]);
      let grew = true;
      while (grew) {
        grew = false;
        for (const n of notes) {
          if (n.parentId && doomed.has(n.parentId) && !doomed.has(n.id)) { doomed.add(n.id); grew = true; }
        }
      }
      setNotes((prev) => prev.filter((n) => !doomed.has(n.id)));
    } catch (e: any) {
      setError(e?.message || 'Could not delete note');
    } finally {
      setBusy((b) => { const c = { ...b }; delete c[note.id]; return c; });
    }
  };

  const upsert = (saved: PlanNote) => {
    setNotes((prev) => {
      const exists = prev.some((n) => n.id === saved.id);
      return exists ? prev.map((n) => (n.id === saved.id ? saved : n)) : [saved, ...prev];
    });
  };

    const requestBreakdown = useCallback(async (note: PlanNote) => {
    try {
      const h = getAuthHeaders();
      await fetch(API, { method: 'POST', headers: h, body: JSON.stringify({ action: 'request-breakdown', noteId: note.id, title: note.title, body: note.body }) });
    } catch {}
  }, []);

  const totalOpen = notes.filter((n) => !effectiveDone(n.id)).length;
  const rootNotes = useMemo(() => {
    const horizonOrder: Record<string, number> = { long_term: 0, mid_term: 1, short_term: 2, daily: 3 };
    return notes.filter(n => !n.parentId).sort((a, b) => (horizonOrder[a.horizon] ?? 99) - (horizonOrder[b.horizon] ?? 99));
  }, [notes]);

  // ── Split view (35 / 65) ──────────────────────────────────────────────────
  // Strategy on the left, execution on the right, so opening the tab shows what
  // to do today with no scrolling and no accordions.
  //
  // ⚠️ The columns cut the tree DIFFERENTLY on purpose:
  //   left  = long/mid ROUNDS (the goals themselves), milestones nested inside;
  //   right = every daily/short_term note ANYWHERE in the tree, flattened.
  // Flattening is what makes the right column work at all: in Daniel's real data
  // a daily item sits three levels down (mid "First $500" → short "Hit first $100
  // green day" → that daily trade), so there is NO daily/short_term root to show.

  /** The North Star: the goals — long-term first, then mid-term. */
  const northStar = useMemo(
    () => rootNotes.filter((n) => n.horizon === 'long_term' || n.horizon === 'mid_term'),
    [rootNotes],
  );

  /** Everything actionable, flat, open before done, today before this week. */
  const allSteps = useMemo(() => {
    const horizonRank: Record<string, number> = { daily: 0, short_term: 1 };
    return notes
      .filter((n) => n.horizon === 'daily' || n.horizon === 'short_term')
      .sort((a, b) => {
        const d = (horizonRank[a.horizon] ?? 9) - (horizonRank[b.horizon] ?? 9);
        if (d !== 0) return d;
        const ad = effectiveDone(a.id) ? 1 : 0;
        const bd = effectiveDone(b.id) ? 1 : 0;
        if (ad !== bd) return ad - bd;
        return (a.priority ?? 99) - (b.priority ?? 99) || sortSiblings(a, b);
      });
  }, [notes, effectiveDone]);

  const openSteps = useMemo(() => allSteps.filter((n) => !effectiveDone(n.id)), [allSteps, effectiveDone]);
  const doneSteps = useMemo(() => allSteps.filter((n) => effectiveDone(n.id)), [allSteps, effectiveDone]);

  /** Walk up to the nearest mid-term milestone, else the long-term goal. */
  const milestoneFor = useCallback((id: string): PlanNote | null => {
    let cur = byId.get(id);
    let goal: PlanNote | null = null;
    const seen = new Set<string>();
    while (cur && !seen.has(cur.id)) {
      seen.add(cur.id);
      if (cur.horizon === 'mid_term') return cur;
      if (cur.horizon === 'long_term' && !goal) goal = cur;
      cur = cur.parentId ? byId.get(cur.parentId) : undefined;
    }
    return goal;
  }, [byId]);

  /** The chip for a step: its milestone label, with the whole chain as a tooltip. */
  const tagFor = useCallback((n: PlanNote) => {
    const m = milestoneFor(n.id);
    if (!m) return undefined;
    const chain: string[] = [];
    let cur: PlanNote | undefined = m;
    const seen = new Set<string>();
    while (cur && !seen.has(cur.id)) {
      seen.add(cur.id);
      chain.unshift(cur.title);
      cur = cur.parentId ? byId.get(cur.parentId) : undefined;
    }
    return { id: m.id, label: milestoneLabel(m.title), className: MILESTONE_CHIP, title: chain.join('  →  ') };
  }, [milestoneFor, byId]);

  /** One card renderer for both columns — only the extras differ. */
  const card = (n: PlanNote, opts: { extra?: React.ReactNode; withTag?: boolean } = {}) => (
    <NoteCard
      key={n.id}
      note={n}
      byId={byId}
      childrenOf={childrenOf}
      progress={progressOf(n.id)}
      done={effectiveDone(n.id)}
      isBusy={!!busy[n.id]}
      isOpen={!!expanded[n.id]}
      onToggleExpand={() => setExpanded((e) => ({ ...e, [n.id]: !e[n.id] }))}
      onToggleComplete={() => toggleComplete(n)}
      onEdit={() => openEdit(n)}
      onDelete={() => remove(n)}
      onAddStep={() => openCreate(nextHorizonBelow(n.horizon), n.id)}
      onBreakdown={() => requestBreakdown(n)}
      expanded={expanded}
      setExpanded={setExpanded}
      toggleComplete={toggleComplete}
      openEdit={openEdit}
      remove={remove}
      openCreate={openCreate}
      progressOf={progressOf}
      effectiveDone={effectiveDone}
      extra={opts.extra}
      tag={opts.withTag ? tagFor(n) : undefined}
    />
  );

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-white/70">
          <StickyNote className="w-5 h-5 text-cyan-400" />
          <span className="text-sm">
            {notes.length === 0 ? 'No plans yet' : `${totalOpen} open · ${notes.length - totalOpen} done`}
          </span>
        </div>
        <button
          onClick={() => openCreate('daily')}
          className="flex items-center gap-2 px-4 py-2 rounded-md border border-white/20 bg-white/5 hover:bg-white/10 transition-colors text-sm font-medium"
        >
          <Plus className="w-4 h-4" /> Add
        </button>
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-lg border border-red-400/30 bg-red-400/10 px-4 py-3 text-sm text-red-200">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          <span className="flex-1">{error}</span>
          <button onClick={() => setError(null)} className="text-red-200/70 hover:text-red-100">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-16 text-white/50">
          <Loader2 className="w-6 h-6 animate-spin mr-2" /> Loading plans…
        </div>
      ) : (
        <>
        {rootNotes.length === 0 ? (
          <div className="text-center py-12"><p className="text-sm text-white/30">No goals yet — click + to add one.</p></div>
        ) : (
          /* ── The Active HUD: strategy left, execution right ────────────────────
             Daniel: "your current layout stacks everything vertically, pushing the
             most important goal to the bottom of the screen." Splitting strategy
             from execution means opening the tab shows what to do NOW.

             Mobile stacks ORDER-FIRST — execution on top. Start with one column
             and leading with the North Star would mean scrolling past the goal to
             reach today's work, which is the exact problem being fixed. */
          <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[35fr_65fr] lg:gap-6">
            {/* ── LEFT (35%) — The North Star: long-term + mid-term goals ─────── */}
            <section className="order-2 space-y-3 lg:order-1">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Mountain className="w-4 h-4 text-violet-300" />
                  <h3 className="text-sm font-bold text-violet-300">The North Star</h3>
                </div>
                <button
                  onClick={() => openCreate('long_term')}
                  title="Add a long-term goal"
                  className="rounded-md border border-white/10 p-1.5 text-white/60 transition-colors hover:bg-white/10 hover:text-white"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>

              {northStar.length === 0 ? (
                <p className="rounded-xl border border-white/10 bg-white/[0.03] p-3 text-[11px] text-white/35">
                  No long-term or mid-term goals yet.
                </p>
              ) : (
                northStar.map((n) => {
                  const kids = childrenOf.get(n.id) || [];
                  return card(n, {
                    extra: kids.length > 0 ? (
                      <MilestoneBar note={n} kids={kids} progressOf={progressOf} effectiveDone={effectiveDone} />
                    ) : undefined,
                  });
                })
              )}
            </section>

            {/* ── RIGHT (65%) — Today's Execution: the do-now list ────────────── */}
            <section className="order-1 space-y-4 lg:order-2">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Zap className="w-4 h-4 text-emerald-300" />
                  <h3 className="text-sm font-bold text-emerald-300">Today’s Execution</h3>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-white/35">{openSteps.length} open</span>
                  <button
                    onClick={() => openCreate('daily')}
                    title="Add today’s item"
                    className="rounded-md border border-white/10 p-1.5 text-white/60 transition-colors hover:bg-white/10 hover:text-white"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {openSteps.length === 0 ? (
                <p className="rounded-xl border border-white/10 bg-white/[0.03] p-3 text-[11px] text-white/35">
                  {doneSteps.length > 0
                    ? 'Everything due today and this week is done. 🎯'
                    : 'Nothing due today or this week yet — add a daily step.'}
                </p>
              ) : (
                ([
                  { key: 'daily' as Horizon, label: 'Today', accent: 'text-emerald-300' },
                  { key: 'short_term' as Horizon, label: 'This week', accent: 'text-cyan-300' },
                ]).map((g) => {
                  const items = openSteps.filter((n) => n.horizon === g.key);
                  if (items.length === 0) return null;
                  return (
                    <div key={g.key} className="space-y-2">
                      <div className={`text-[10px] font-semibold uppercase tracking-wider ${g.accent}`}>{g.label}</div>
                      {items.map((n) => card(n, { withTag: true }))}
                    </div>
                  );
                })
              )}

              {doneSteps.length > 0 && (
                <div className="pt-1">
                  <button
                    onClick={() => setShowDoneSteps((v) => !v)}
                    className="flex items-center gap-1 text-[11px] text-white/40 transition-colors hover:text-white/70"
                  >
                    {showDoneSteps ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                    {doneSteps.length} finished
                  </button>
                  {showDoneSteps && <div className="mt-2 space-y-2">{doneSteps.map((n) => card(n, { withTag: true }))}</div>}
                </div>
              )}
            </section>
          </div>
        )}
        </>)
          }

      {modalOpen && (
        <NoteModal
          note={editing}
          defaultHorizon={modalHorizon}
          defaultParent={modalParent}
          allNotes={notes}
          onClose={() => setModalOpen(false)}
          onSaved={(saved) => { upsert(saved); setModalOpen(false); }}
          onError={(msg) => setError(msg)}
          getAuthHeaders={getAuthHeaders}
        />
      )}
    </div>
  );
};

// ─── Milestone bar ───────────────────────────────────────────────────────────

/**
 * A goal's segmented progress bar: one segment per direct child (milestone), each
 * filled by that milestone's own step completion. So the bar shows the LADDER —
 * "$500 · $1K · $5K · $10K · $20K" — rather than one opaque percentage. When the
 * milestone titles carry money it also reads out how far up the ladder is banked.
 *
 * Only segments are money where the money is real: `banked` is the highest
 * milestone actually reached, never an interpolated guess at a balance.
 */
const MilestoneBar: React.FC<{
  note: PlanNote;
  kids: PlanNote[];
  progressOf: (id: string) => { done: number; total: number } | null;
  effectiveDone: (id: string, seen?: Set<string>) => boolean;
}> = ({ note, kids, progressOf, effectiveDone }) => {
  const parts = kids.map((k) => {
    const p = progressOf(k.id);
    const ratio = p && p.total > 0 ? p.done / p.total : (effectiveDone(k.id) ? 1 : 0);
    return { note: k, ratio, reached: effectiveDone(k.id), value: moneyFromTitle(k.title) };
  });
  const reachedCount = parts.filter((p) => p.reached).length;
  const allMoney = parts.length > 0 && parts.every((p) => p.value != null);
  const target = moneyFromTitle(note.title) ?? (allMoney ? Math.max(...parts.map((p) => p.value as number)) : null);
  const banked = parts.reduce((acc, p) => (p.reached && p.value != null ? Math.max(acc, p.value) : acc), 0);

  return (
    <div className="mt-2">
      <div className="flex items-stretch gap-1">
        {parts.map((p) => (
          <div key={p.note.id} className="min-w-0 flex-1" title={`${p.note.title} — ${Math.round(p.ratio * 100)}%`}>
            <div className="h-2 w-full overflow-hidden rounded-full bg-white/10">
              <div
                className={`h-full rounded-full transition-all ${p.reached ? 'bg-emerald-400' : 'bg-cyan-400'}`}
                style={{ width: `${Math.round(p.ratio * 100)}%` }}
              />
            </div>
            <div className={`mt-1 truncate text-center text-[9px] leading-tight ${p.reached ? 'text-emerald-300' : 'text-white/35'}`}>
              {milestoneLabel(p.note.title)}
            </div>
          </div>
        ))}
      </div>
      {target != null ? (
        <div className="mt-1 flex items-center justify-between text-[10px]">
          <span className="text-white/45">{fmtMoney(banked)} of {fmtMoney(target)}</span>
          <span className="text-white/35">{reachedCount}/{parts.length} milestones</span>
        </div>
      ) : (
        <div className="mt-1 text-[10px] text-white/35">{reachedCount}/{parts.length} steps done</div>
      )}
    </div>
  );
};

// ─── Card ────────────────────────────────────────────────────────────────────

const NoteCard: React.FC<{
  note: PlanNote;
  byId: Map<string, PlanNote>;
  childrenOf: Map<string, PlanNote[]>;
  progress: { done: number; total: number } | null;
  done: boolean;
  isBusy: boolean;
  isOpen: boolean;
  onToggleExpand: () => void;
  onToggleComplete: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onAddStep: () => void;
  onBreakdown?: (note: PlanNote) => void;
  /** Optional context chip beside the title — e.g. the milestone this step feeds. */
  tag?: { id?: string; label: string; className: string; title?: string };
  /** Replaces the plain progress bar with a richer visual (the milestone bar). */
  extra?: React.ReactNode;
  expanded: Record<string, boolean>;
  setExpanded: (fn: (prev: Record<string, boolean>) => Record<string, boolean>) => void;
  toggleComplete: (note: PlanNote) => void;
  openEdit: (note: PlanNote) => void;
  remove: (note: PlanNote) => void;
  openCreate: (horizon: Horizon, parentId?: string | null) => void;
  progressOf: (id: string) => { done: number; total: number } | null;
  effectiveDone: (id: string, seen?: Set<string>) => boolean;
}> = ({
  note, byId, childrenOf, progress, done, isBusy, isOpen,
  onToggleExpand, onToggleComplete, onEdit, onDelete, onAddStep, onBreakdown, tag, extra,
  expanded, setExpanded, toggleComplete, openEdit, remove, openCreate,
  progressOf, effectiveDone,
}) => {
  const parent = note.parentId ? byId.get(note.parentId) : null;
  const kids = childrenOf.get(note.id) || [];
  const hasKids = kids.length > 0;
  const pct = progress ? Math.round((progress.done / progress.total) * 100) : 0;

  return (
    <div className={`rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2.5 transition-opacity ${done ? 'opacity-60' : ''}`}>
      <div className="flex items-start gap-2">
        <button
          onClick={onToggleComplete}
          disabled={isBusy}
          title={note.completed ? 'Mark as not done' : 'Mark as done'}
          className={`mt-0.5 shrink-0 w-4 h-4 rounded border flex items-center justify-center transition-colors ${
            note.completed ? 'bg-emerald-500 border-emerald-500' : 'border-white/30 hover:border-white/60'
          }`}
        >
          {note.completed && <Check className="w-3 h-3 text-black" />}
        </button>

        <button onClick={onToggleExpand} className="flex-1 text-left min-w-0">
          <div className={`text-sm font-medium break-words ${done ? 'line-through text-white/50' : 'text-white/90'}`}>
            {note.title}
          </div>

          {/* Which milestone this step feeds — so a naked "trade today" reads as
              part of the ladder instead of a floating instruction. */}
          {tag && (
            <div className="mt-1">
              <span title={tag.title} className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-medium ${tag.className}`}>
                {tag.label}
              </span>
            </div>
          )}

          {/* The domino: this step belongs to a goal. Skipped when the tag above IS
              that parent, so the same milestone isn't named twice on one card. */}
          {parent && parent.id !== tag?.id && (
            <div className="flex items-center gap-1 text-[10px] text-white/35 mt-0.5">
              <CornerDownRight className="w-3 h-3 shrink-0" />
              <span className="truncate">{parent.title}</span>
            </div>
          )}

          {/* Progress: the caller can hand in a richer visual (the milestone bar). */}
          {extra ?? (progress && (
            <div className="mt-1.5">
              <div className="flex items-center justify-between text-[10px] text-white/45 mb-0.5">
                <span>{progress.done}/{progress.total} steps</span>
                {pct === 100 && <span className="text-emerald-300 font-medium">complete</span>}
              </div>
              <div className="h-1 w-full rounded-full bg-white/10 overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${pct === 100 ? 'bg-emerald-400' : 'bg-cyan-400'}`}
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          ))}

          {(hasKids || note.body) && (
            <div className="flex items-center gap-1 text-[10px] text-white/35 mt-1">
              {isOpen ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
              {hasKids && <span>{kids.length} step{kids.length > 1 ? 's' : ''}</span>}
              {hasKids && note.body && <span>·</span>}
              {note.body && <span>{note.body.length} chars</span>}
            </div>
          )}
        </button>

        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={onAddStep}
            title="Add a step toward this"
            className="p-1 rounded text-white/40 hover:text-cyan-300 hover:bg-cyan-400/10 transition-colors"
          >
            <Link2 className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={onEdit}
            title="Edit"
            className="p-1 rounded text-white/40 hover:text-white hover:bg-white/10 transition-colors"
          >
            <Pencil className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={onDelete}
            title="Delete"
            disabled={isBusy}
            className="p-1 rounded text-white/40 hover:text-red-300 hover:bg-red-400/10 transition-colors disabled:opacity-40"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {isOpen && (
        <div className="mt-2 pl-3 border-l border-white/10 space-y-1.5">
          {kids.length > 0 && (
            <div className="space-y-1">
              {kids.map((k) => {
                const kd = effectiveDone(k.id);
                const kp = progressOf(k.id);
                const isChildOpen = !!expanded[k.id];
                return (
                  <NoteCard
                    key={k.id}
                    note={k}
                    byId={byId}
                    childrenOf={childrenOf}
                    progress={kp}
                    done={kd}
                    isBusy={false}
                    isOpen={isChildOpen}
                    onToggleExpand={() => setExpanded((e) => ({ ...e, [k.id]: !e[k.id] }))}
                    onToggleComplete={() => toggleComplete(k)}
                    onEdit={() => openEdit(k)}
                    onDelete={() => remove(k)}
                    onAddStep={() => openCreate(nextHorizonBelow(k.horizon), k.id)}
                    onBreakdown={onBreakdown}
                    expanded={expanded}
                    setExpanded={setExpanded}
                    toggleComplete={toggleComplete}
                    openEdit={openEdit}
                    remove={remove}
                    openCreate={openCreate}
                    progressOf={progressOf}
                    effectiveDone={effectiveDone}
                  />
                );
              })}
            </div>
          )}
          {note.body && (
            <div className="text-xs text-white/60 whitespace-pre-wrap break-words pt-1">
              {note.body}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// ─── Add / Edit modal ────────────────────────────────────────────────────────

const NoteModal: React.FC<{
  note: PlanNote | null;
  defaultHorizon: Horizon;
  defaultParent: string | null;
  allNotes: PlanNote[];
  onClose: () => void;
  onSaved: (n: PlanNote) => void;
  onError: (msg: string) => void;
  getAuthHeaders: () => Record<string, string>;
}> = ({ note, defaultHorizon, defaultParent, allNotes, onClose, onSaved, onError, getAuthHeaders }) => {
  const [horizon, setHorizon] = useState<Horizon>(note?.horizon ?? defaultHorizon);
  const [parentId, setParentId] = useState<string | null>(note?.parentId ?? defaultParent ?? null);
  const [title, setTitle] = useState(note?.title ?? '');
  const [body, setBody] = useState(note?.body ?? '');
  const [priority, setPriority] = useState<number>(note?.priority ?? 0);
  const [saving, setSaving] = useState(false);

  const isEdit = !!note;

  // Candidate parents: anything that isn't this note or one of its descendants
  // (the API rejects a cycle too — this just keeps it out of the dropdown).
  const parentOptions = useMemo(() => {
    const descendants = new Set<string>();
    if (note) {
      let grew = true;
      descendants.add(note.id);
      while (grew) {
        grew = false;
        for (const n of allNotes) {
          if (n.parentId && descendants.has(n.parentId) && !descendants.has(n.id)) {
            descendants.add(n.id);
            grew = true;
          }
        }
      }
    }
    return allNotes.filter((n) => !descendants.has(n.id));
  }, [allNotes, note]);

  const submit = async () => {
    const t = title.trim();
    if (!t) { onError('A note needs a title.'); return; }
    setSaving(true);
    try {
      const payload: Record<string, any> = isEdit
        ? { action: 'update-note', id: note!.id, horizon, title: t, body, priority, parentId }
        : { action: 'create-note', horizon, title: t, body, priority, parentId };

      const res = await fetch(API, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || `Save failed (${res.status})`);
      onSaved(data.note as PlanNote);
    } catch (e: any) {
      onError(e?.message || 'Could not save note');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70" onClick={onClose}>
      <div
        className="w-full max-w-lg rounded-xl border border-white/15 bg-[#0a0d14] shadow-2xl max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-3 border-b border-white/10">
          <h3 className="text-base font-semibold text-white/90">
            {isEdit ? 'Edit Plan Item' : 'New Plan Item'}
          </h3>
          <button onClick={onClose} className="p-1 rounded text-white/50 hover:text-white hover:bg-white/10">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-4">
          <div>
            <label className="block text-xs font-medium text-white/60 mb-1.5">Horizon</label>
            <div className="grid grid-cols-4 gap-1.5">
              {HORIZONS.map((h) => {
                const active = horizon === h.key;
                return (
                  <button
                    key={h.key}
                    onClick={() => setHorizon(h.key)}
                    className={`px-1 py-2 rounded-md border text-[11px] font-medium transition-colors ${
                      active
                        ? `${h.accentBorder} ${h.accentBg} ${h.accentText}`
                        : 'border-white/10 text-white/50 hover:border-white/20 hover:text-white/70'
                    }`}
                  >
                    {h.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-white/60 mb-1.5">
              Step toward <span className="text-white/35">(optional — makes this a sub-step of a goal)</span>
            </label>
            <select
              value={parentId ?? ''}
              onChange={(e) => setParentId(e.target.value || null)}
              className="w-full rounded-md border border-white/15 bg-white/5 px-3 py-2 text-sm text-white/90 focus:outline-none focus:border-cyan-400/50"
            >
              <option value="">— None (this is a top-level goal) —</option>
              {parentOptions.map((n) => (
                <option key={n.id} value={n.id}>
                  [{HORIZON_LABEL[n.horizon]}] {n.title}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-white/60 mb-1.5">Title</label>
            <input
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={200}
              placeholder="e.g. Grow the personal account to $5k"
              className="w-full rounded-md border border-white/15 bg-white/5 px-3 py-2 text-sm text-white/90 placeholder-white/25 focus:outline-none focus:border-cyan-400/50"
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); } }}
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-white/60 mb-1.5">Notes</label>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={5}
              placeholder="Detail, context, why it matters…"
              className="w-full rounded-md border border-white/15 bg-white/5 px-3 py-2 text-sm text-white/90 placeholder-white/25 focus:outline-none focus:border-cyan-400/50 resize-y"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-white/60 mb-1.5">
              Priority <span className="text-white/35">(higher sorts first)</span>
            </label>
            <input
              type="number"
              value={priority}
              onChange={(e) => setPriority(Math.trunc(Number(e.target.value) || 0))}
              className="w-28 rounded-md border border-white/15 bg-white/5 px-3 py-2 text-sm text-white/90 focus:outline-none focus:border-cyan-400/50"
            />
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-white/10">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-md border border-white/15 text-sm text-white/70 hover:bg-white/5"
          >
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={saving || !title.trim()}
            className="flex items-center gap-2 px-4 py-2 rounded-md bg-cyan-500/90 hover:bg-cyan-400 text-black text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            {isEdit ? 'Save Changes' : 'Add'}
          </button>
        </div>
      </div>
    </div>
  );
};

// ─── helpers ─────────────────────────────────────────────────────────────────

/** Sort: unfinished first, then priority desc, then sortOrder, then newest. */
function sortSiblings(a: PlanNote, b: PlanNote): number {
  const ac = !!a.completed, bc = !!b.completed;
  if (ac !== bc) return ac ? 1 : -1;
  const pa = a.priority ?? 0, pb = b.priority ?? 0;
  if (pa !== pb) return pb - pa;
  const sa = a.sortOrder ?? 0, sb = b.sortOrder ?? 0;
  if (sa !== sb) return sa - sb;
  return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
}

/** Where a step "below" this horizon naturally belongs. */
function nextHorizonBelow(h: Horizon): Horizon {
  switch (h) {
    case 'long_term': return 'mid_term';
    case 'mid_term': return 'short_term';
    case 'short_term': return 'daily';
    default: return 'daily';
  }
}

export default GoalsTab;
/* trigger build */
