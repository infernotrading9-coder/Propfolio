import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ChevronLeft, ChevronRight, Plus, X, Trash2, Check, Loader2, AlertCircle,
  Clock, CalendarDays, ListTodo, Inbox, Pencil,
} from 'lucide-react';
import { NeonCard } from './NeonCard';
import { toLocalISODate, todayLocalISO, parseLocalDate } from '../utils/dates';

/**
 * LifeCalendar — the Life tab's own calendar (events + todos).
 *
 * ⚠️ Three different "calendars" exist in this app. Do not merge them:
 *   - `Calendar.tsx`            — the TRADING rule calendar (followed-rules ticks)
 *   - the old blue arcade button — a one-day agenda modal (replaced by this)
 *   - THIS component            — Daniel's own month view, backed by
 *                                 `life_calendar_items` via `db-life-calendar`.
 *
 * It renders TWO layers on purpose:
 *   1. **My items** (`life_calendar_items`) — full CRUD, DRAGGABLE between days.
 *   2. **From your agenda** (`daily_agenda`, pushed by Whispersonalbot from
 *      Obsidian) — READ-ONLY here. That table belongs to the bot and its POST
 *      replaces a whole day's entries, so editing it from the UI would be
 *      reverted on the next sync (and could race it). Edit those in Obsidian.
 *
 * DRAG & DROP uses POINTER events, never the HTML5 `draggable` attribute:
 * `draggable` swallows taps on iPad Safari (a bug already fought in the
 * cockpit). A chip is `touch-none` so a drag can't be a scroll, and a 7px
 * movement threshold keeps a tap a tap.
 */

export interface LifeItem {
  id: string;
  kind: 'event' | 'todo';
  title: string;
  notes: string | null;
  date: string;
  startTime: string | null;
  endTime: string | null;
  category: string | null;
  /** Todos only — 'soon' | 'mid' | 'long', null = unfiled. */
  bucket: string | null;
  /** Events only — a PALETTE key ('teal'…), null = use the category colour. */
  color: string | null;
  done: boolean;
}

interface AgendaEntry {
  title: string;
  startTime?: string;
  endTime?: string;
  category?: string;
  icon?: string;
}

/**
 * Daniel's site-side edit of an imported agenda entry (`agenda_overrides`).
 *
 * It exists so a drag on an Obsidian entry is NOT a rewrite of `daily_agenda` —
 * the bot's next push would silently revert that. An override WINS over the
 * stored value, so his edit survives every re-push, and the bot reconciles
 * Obsidian from it and then clears it.
 */
export interface AgendaOverride {
  id: string;
  date: string; // the day the entry lives on in daily_agenda
  title: string;
  movedToDate: string | null;
  startTime: string | null;
  endTime: string | null;
}

/** An agenda entry, placed on a day AFTER any override has been applied. */
interface PlacedAgenda extends AgendaEntry {
  sourceDate: string; // the day it is stored on in daily_agenda (the override key)
  overridden: boolean;
}

const API = '/.netlify/functions/db-life-calendar';
const AGENDA_API = '/.netlify/functions/daily-agenda';

/**
 * The categories offered in the editor, with their colours.
 *
 * Full class strings per category — never build them by interpolating Tailwind
 * fragments, they get purged and the chips silently render unstyled.
 */
const CATS: { key: string; label: string; dot: string; chip: string }[] = [
  { key: 'trading', label: 'Trading', dot: 'bg-cyan-400', chip: 'bg-cyan-500/20 border-cyan-400/40 text-cyan-100' },
  { key: 'work', label: 'Work', dot: 'bg-amber-400', chip: 'bg-amber-500/20 border-amber-400/40 text-amber-100' },
  { key: 'health', label: 'Health', dot: 'bg-emerald-400', chip: 'bg-emerald-500/20 border-emerald-400/40 text-emerald-100' },
  { key: 'study', label: 'Study', dot: 'bg-violet-400', chip: 'bg-violet-500/20 border-violet-400/40 text-violet-100' },
  { key: 'personal', label: 'Personal', dot: 'bg-pink-400', chip: 'bg-pink-500/20 border-pink-400/40 text-pink-100' },
  { key: 'other', label: 'Other', dot: 'bg-slate-400', chip: 'bg-slate-500/20 border-slate-400/40 text-slate-100' },
];

/**
 * A category that is NOT in the list above still gets its own STABLE colour.
 *
 * The imported agenda arrives with categories of its own — Whispersonalbot pushes
 * `spark`, `workouts` and `prep` today, and whatever it invents tomorrow — and
 * without this every one of them rendered as the same grey "Other" chip, so a day
 * of imported entries was an undifferentiated wall. Hashing the name means the
 * same category is the same colour on every render and every reload, with no
 * registry to keep in sync.
 */
const EXTRA_CHIP = [
  'bg-rose-500/20 border-rose-400/40 text-rose-100',
  'bg-teal-500/20 border-teal-400/40 text-teal-100',
  'bg-lime-500/20 border-lime-400/40 text-lime-100',
  'bg-orange-500/20 border-orange-400/40 text-orange-100',
  'bg-indigo-500/20 border-indigo-400/40 text-indigo-100',
  'bg-fuchsia-500/20 border-fuchsia-400/40 text-fuchsia-100',
];
const EXTRA_DOT = ['bg-rose-400', 'bg-teal-400', 'bg-lime-400', 'bg-orange-400', 'bg-indigo-400', 'bg-fuchsia-400'];

/**
 * The colour palette Daniel picks from, deliberately separate from CATS.
 *
 * CATS answers "what KIND of thing is this" (Trading, Work, Health…) and drives the
 * category picker. This answers "what colour do I want" — he asked for "a lot of
 * colour options" on top of the ones he already had, and pinning a colour to a
 * category would mean renaming Trading to recolour a single event.
 *
 * Keys are stored per item ('teal'), never hex, so the theme stays re-tunable.
 * Classes are written out in full because Tailwind's JIT scans source literals.
 * The first six mirror the CATS colours, so a hand-picked 'cyan' matches Trading.
 */
const PALETTE: { key: string; label: string; dot: string; chip: string }[] = [
  { key: 'cyan', label: 'Cyan', dot: 'bg-cyan-400', chip: 'bg-cyan-500/20 border-cyan-400/40 text-cyan-100' },
  { key: 'teal', label: 'Teal', dot: 'bg-teal-400', chip: 'bg-teal-500/20 border-teal-400/40 text-teal-100' },
  { key: 'emerald', label: 'Emerald', dot: 'bg-emerald-400', chip: 'bg-emerald-500/20 border-emerald-400/40 text-emerald-100' },
  { key: 'lime', label: 'Lime', dot: 'bg-lime-400', chip: 'bg-lime-500/20 border-lime-400/40 text-lime-100' },
  { key: 'yellow', label: 'Yellow', dot: 'bg-yellow-400', chip: 'bg-yellow-500/20 border-yellow-400/40 text-yellow-100' },
  { key: 'amber', label: 'Amber', dot: 'bg-amber-400', chip: 'bg-amber-500/20 border-amber-400/40 text-amber-100' },
  { key: 'orange', label: 'Orange', dot: 'bg-orange-400', chip: 'bg-orange-500/20 border-orange-400/40 text-orange-100' },
  { key: 'red', label: 'Red', dot: 'bg-red-400', chip: 'bg-red-500/20 border-red-400/40 text-red-100' },
  { key: 'rose', label: 'Rose', dot: 'bg-rose-400', chip: 'bg-rose-500/20 border-rose-400/40 text-rose-100' },
  { key: 'pink', label: 'Pink', dot: 'bg-pink-400', chip: 'bg-pink-500/20 border-pink-400/40 text-pink-100' },
  { key: 'fuchsia', label: 'Fuchsia', dot: 'bg-fuchsia-400', chip: 'bg-fuchsia-500/20 border-fuchsia-400/40 text-fuchsia-100' },
  { key: 'purple', label: 'Purple', dot: 'bg-purple-400', chip: 'bg-purple-500/20 border-purple-400/40 text-purple-100' },
  { key: 'violet', label: 'Violet', dot: 'bg-violet-400', chip: 'bg-violet-500/20 border-violet-400/40 text-violet-100' },
  { key: 'indigo', label: 'Indigo', dot: 'bg-indigo-400', chip: 'bg-indigo-500/20 border-indigo-400/40 text-indigo-100' },
  { key: 'sky', label: 'Sky', dot: 'bg-sky-400', chip: 'bg-sky-500/20 border-sky-400/40 text-sky-100' },
  { key: 'slate', label: 'Slate', dot: 'bg-slate-400', chip: 'bg-slate-500/20 border-slate-400/40 text-slate-100' },
];
const PALETTE_BY_KEY = new Map(PALETTE.map((p) => [p.key, p]));

/**
 * Todo horizons, in Daniel's own words: "do soon ... midterm to do's and long term
 * to do's". '' is the unfiled state, kept as an explicit choice so a todo can be
 * taken back OUT of a folder instead of being stuck in one.
 */
const BUCKET_OPTS = [
  { key: 'soon', label: 'Soon' },
  { key: 'mid', label: 'Mid-term' },
  { key: 'long', label: 'Long-term' },
  { key: '', label: 'Unfiled' },
];

const nameHash = (s: string) => {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
};

/**
 * Resolve an item's chip styling.
 *
 * `color` is an OPTIONAL explicit palette choice. When present it wins over the
 * category colour but keeps the category's label, so the legend still reads
 * "Trading" whether that event is cyan (Trading's own hue) or, say, red because he
 * wanted it to stand out. Omitting `color` reproduces the old behaviour exactly,
 * which is why every pre-existing call site still works untouched.
 */
const catOf = (c?: string | null, color?: string | null) => {
  const known = CATS.find((x) => x.key === c);
  let base: { key: string; label: string; dot: string; chip: string };
  if (known) {
    base = known;
  } else {
    const k = (c || '').trim().toLowerCase();
    if (!k) {
      base = CATS[CATS.length - 1]; // no category at all -> "Other"
    } else {
      const i = nameHash(k) % EXTRA_CHIP.length;
      base = { key: k, label: k, dot: EXTRA_DOT[i], chip: EXTRA_CHIP[i] };
    }
  }
  const pick = color ? PALETTE_BY_KEY.get(color) : undefined;
  return pick ? { ...base, dot: pick.dot, chip: pick.chip } : base;
};

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const CHIPS_PER_DAY = 3;

/** 42 cells, Sunday-first (Google Calendar's default), including the spill of the neighbouring months. */
function monthGrid(year: number, month: number) {
  const firstDow = new Date(year, month, 1).getDay();
  return Array.from({ length: 42 }, (_, i) => {
    const d = new Date(year, month, 1 - firstDow + i);
    return { date: toLocalISODate(d), inMonth: d.getMonth() === month && d.getFullYear() === year, day: d.getDate() };
  });
}

/** '14:30' → '2:30 PM'. Blank in, blank out. */
function fmt12(t?: string | null) {
  if (!t) return '';
  const [h, m] = t.split(':').map(Number);
  if (Number.isNaN(h)) return t;
  return `${h % 12 || 12}:${String(m || 0).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
}

// ─── Time-grid geometry (Week + Day views) ──────────────────────────────────
// The grid IS the day: 24 hour rows, tall enough to breathe (Google Calendar's
// shape). Everything is derived from HOUR_PX — change it and the grid, the drag
// maths and the "which hour did I click" hit test all move together.
const HOUR_PX = 48;
const DAY_MINUTES = 24 * 60;
const SNAP_MIN = 15;
const GRID_BODY_H = (DAY_MINUTES / 60) * HOUR_PX; // 1152px

/** 'HH:MM' → minutes past midnight. null/blank → null ('all day'). */
const toMin = (t?: string | null): number | null => {
  if (!t) return null;
  const [h, m] = t.split(':').map(Number);
  if (Number.isNaN(h)) return null;
  return h * 60 + (m || 0);
};

const pad2 = (n: number) => String(n).padStart(2, '0');

/** minutes → 'HH:MM', clamped inside the day so a drag can't run off midnight. */
const fromMin = (min: number) => {
  const c = Math.max(0, Math.min(DAY_MINUTES - SNAP_MIN, min));
  return `${pad2(Math.floor(c / 60))}:${pad2(c % 60)}`;
};

const snapMin = (min: number) => Math.round(min / SNAP_MIN) * SNAP_MIN;

/**
 * Greedy column packing for a day's timed events, so two overlapping things sit
 * SIDE BY SIDE instead of one drawing over the other. Returns { col, cols } per
 * id: which slot it occupies and how many slots the overlapping group needs.
 */
function packColumns(evts: { key: string; startMin: number; endMin: number }[]) {
  const sorted = [...evts].sort((a, b) => a.startMin - b.startMin || a.endMin - b.endMin);
  const out = new Map<string, { col: number; cols: number }>();
  let cluster: { key: string; startMin: number; endMin: number; col: number }[] = [];
  let clusterEnd = -Infinity;
  const flush = () => {
    const cols = Math.max(1, ...cluster.map((e) => e.col + 1));
    for (const e of cluster) out.set(e.key, { col: e.col, cols });
    cluster = [];
    clusterEnd = -Infinity;
  };
  for (const e of sorted) {
    if (cluster.length && e.startMin >= clusterEnd) flush();
    let col = 0;
    while (cluster.some((c) => c.col === col && c.endMin > e.startMin)) col++;
    cluster.push({ ...e, col });
    clusterEnd = Math.max(clusterEnd, e.endMin);
  }
  flush();
  return out;
}

function longDay(iso: string) {
  return parseLocalDate(iso).toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });
}

type EditorState = {
  open: boolean;
  id: string | null;          // null = creating
  kind: 'event' | 'todo';
  title: string;
  date: string;
  startTime: string;          // '' = all-day
  endTime: string;
  category: string;
  bucket: string;   // todos: 'soon' | 'mid' | 'long' | '' (unfiled)
  color: string;    // events: PALETTE key, '' = auto (category colour)
  notes: string;
};

const blankEditor = (date: string, kind: 'event' | 'todo' = 'event', startTime = ''): EditorState => ({
  open: true, id: null, kind, title: '', date,
  startTime,
  // An hour by default, so clicking an empty slot in the time grid gives a usable
  // block instead of a zero-length one.
  endTime: startTime ? fromMin((toMin(startTime) ?? 0) + 60) : '',
  category: 'other', notes: '',
  // A new todo starts in "Soon" — that is where most day-to-day items belong, and
  // it beats everything landing in Unfiled. A new event starts on 'auto', i.e. the
  // category colour it already had, so nothing changes until he picks one.
  bucket: kind === 'todo' ? 'soon' : '',
  color: '',
});

export const LifeCalendar: React.FC = () => {
  const [cursor, setCursor] = useState(() => new Date());
  const [selectedDate, setSelectedDate] = useState<string>(() => todayLocalISO());
  /** Month | Week | Day — the same data, three levels of zoom. */
  const [viewMode, setViewMode] = useState<'month' | 'week' | 'day'>('week');
  const [items, setItems] = useState<LifeItem[]>([]);
  /** Straight from `daily_agenda` — the bot's version, before any override. */
  const [rawAgenda, setRawAgenda] = useState<Record<string, AgendaEntry[]>>({});
  const [overrides, setOverrides] = useState<AgendaOverride[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyIds, setBusyIds] = useState<Record<string, boolean>>({});
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  // ── drag state ──────────────────────────────────────────────────────────
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [overDate, setOverDate] = useState<string | null>(null);
  const overDateRef = useRef<string | null>(null);
  const dragRef = useRef<{ id: string; fromDate: string; x: number; y: number; moved: boolean; pid: number } | null>(null);
  /** A drag ends with a click; swallow exactly that one so dropping never opens the editor. */
  const justDragged = useRef(false);

  /**
   * The TIME GRID's own drag. It moves an event BOTH ways — vertically to a new
   * time (snapped) and horizontally to a new day — which the month view's
   * day-only drag cannot express. Deliberately separate from the handlers above:
   * those answer "which day CELL did I drop on", this answers "which MINUTE is
   * the pointer at".
   */
  const [dragEv, setDragEv] = useState<{ key: string; date: string; startMin: number; endMin: number } | null>(null);
  /** Mirrored so pointerup can read the live preview even if it lands in the same frame as the last move. */
  const dragEvRef = useRef<{ key: string; date: string; startMin: number; endMin: number } | null>(null);
  const evDragRef = useRef<{
    key: string; source: 'item' | 'agenda'; id: string; title: string; sourceDate: string;
    origDate: string; origStartMin: number | null; durMin: number; grabMin: number;
    /**
     * 'move' drags the whole block; 'resize' drags only its bottom edge. Both share
     * this one gesture record and the same window listeners — a resize is just a move
     * whose start is pinned, so giving it a separate code path would duplicate the
     * re-parenting fix documented on `hitTestGrid` for no gain.
     */
    mode: 'move' | 'resize' | 'resize-top'; origEndMin: number | null;
    x: number; y: number; moved: boolean; pid: number;
  } | null>(null);

  /** The now-line only has to be right to the minute, so a 30s tick is plenty. */
  const [nowMin, setNowMin] = useState(() => {
    const d = new Date();
    return d.getHours() * 60 + d.getMinutes();
  });
  useEffect(() => {
    const t = window.setInterval(() => {
      const d = new Date();
      setNowMin(d.getHours() * 60 + d.getMinutes());
    }, 30000);
    return () => window.clearInterval(t);
  }, []);

  /** The grid opens on the working day, not at midnight. */
  const gridScrollRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (viewMode === 'month') return;
    const el = gridScrollRef.current;
    if (el) el.scrollTop = 7 * HOUR_PX; // 07:00
    // ⚠️ `loading` is in the deps on purpose. On mount the grid is NOT in the DOM —
    // the loading branch renders a spinner instead — so `gridScrollRef.current` is
    // null and the scroll is silently skipped. Without it the grid always opened at
    // midnight, which reads as "the auto-scroll doesn't work".
  }, [viewMode, selectedDate, loading]);

  const year = cursor.getFullYear();
  const month = cursor.getMonth();

  const days = useMemo(() => monthGrid(year, month), [year, month]);
  const today = todayLocalISO();

  /**
   * THE WEEK the selected day sits in (Sunday-first, matching the month grid).
   * Derived from `selectedDate` rather than `cursor` so week/day navigation has
   * exactly ONE thing to move — two anchors would drift apart.
   */
  const weekDates = useMemo(() => {
    const start = parseLocalDate(selectedDate);
    start.setDate(start.getDate() - start.getDay());
    return Array.from({ length: 7 }, (_, i) =>
      toLocalISODate(new Date(start.getFullYear(), start.getMonth(), start.getDate() + i)));
  }, [selectedDate]);

  /**
   * The fetch window follows the VIEW:
   *   month — the WHOLE 6-week grid, because the grid shows the neighbouring
   *           months' spill and a drop onto one of those days must be a real move
   *   week  — the 7 days shown
   *   day   — just that day
   * So switching to Day stops pulling a month of rows just to show one.
   */
  const rangeFrom = viewMode === 'month' ? days[0].date : viewMode === 'week' ? weekDates[0] : selectedDate;
  const rangeTo = viewMode === 'month' ? days[days.length - 1].date : viewMode === 'week' ? weekDates[6] : selectedDate;

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
    } catch { /* not signed in yet — the request 401s and the panel says so */ }
    return headers;
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [itemsRes, agendaRes] = await Promise.all([
        fetch(`${API}?from=${rangeFrom}&to=${rangeTo}`, { headers: getAuthHeaders() }),
        fetch(`${AGENDA_API}?from=${rangeFrom}&to=${rangeTo}`, { headers: getAuthHeaders() }),
      ]);
      if (!itemsRes.ok) throw new Error(`Could not load the calendar (${itemsRes.status})`);
      const itemsData = await itemsRes.json();
      setItems(itemsData.items || []);

      // The agenda layer is optional — a failure there must not blank the whole
      // calendar, so it is caught separately.
      if (agendaRes.ok) {
        const agendaData = await agendaRes.json();
        const byDate: Record<string, AgendaEntry[]> = {};
        for (const d of agendaData.days || []) byDate[d.date] = d.entries || [];
        setRawAgenda(byDate);
        setOverrides(agendaData.overrides || []);
      } else {
        setRawAgenda({});
        setOverrides([]);
      }
    } catch (e: any) {
      setError(e?.message || 'Could not load the calendar');
    } finally {
      setLoading(false);
    }
  }, [rangeFrom, rangeTo, getAuthHeaders]);

  useEffect(() => { load(); }, [load]);

  /** Shown after a silently-droppable failure, so a refused save is never invisible. */
  const flash = (msg: string) => {
    setNotice(msg);
    window.setTimeout(() => setNotice((n) => (n === msg ? null : n)), 4000);
  };

  const post = useCallback(async (payload: Record<string, unknown>) => {
    const res = await fetch(API, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({} as any));
    if (!res.ok) throw new Error(data?.error || `Request failed (${res.status})`);
    return data;
  }, [getAuthHeaders]);

  // ── item maps ───────────────────────────────────────────────────────────
  const byDate = useMemo(() => {
    const m: Record<string, LifeItem[]> = {};
    for (const it of items) (m[it.date] ||= []).push(it);
    for (const k of Object.keys(m)) {
      m[k].sort((a, b) => {
        // all-day / todos first, then by clock time
        if (!a.startTime && b.startTime) return -1;
        if (a.startTime && !b.startTime) return 1;
        if (a.startTime && b.startTime && a.startTime !== b.startTime) return a.startTime < b.startTime ? -1 : 1;
        return a.title.localeCompare(b.title);
      });
    }
    return m;
  }, [items]);

  // The selected day's events/todos/agenda are no longer derived here — the single
  // renderer below (renderDayDetail) derives them for whichever date it is given,
  // so the month panel and the Day view can never drift apart.

  /**
   * The agenda AS THE CALENDAR SHOWS IT: every stored entry with Daniel's override
   * applied on top, then bucketed onto the day it now falls on.
   *
   * The override WINS over the stored value — that is the entire point. The bot's
   * push cannot undo an edit he made here; only clearing the override can.
   * When an override exists its times are authoritative EVEN WHEN NULL, because
   * null means "he made it all-day" — `?? e.startTime` would undo that.
   */
  const agenda = useMemo(() => {
    const byKey = new Map(overrides.map((o) => [`${o.date}::${o.title}`, o]));
    const out: Record<string, PlacedAgenda[]> = {};
    for (const [date, entries] of Object.entries(rawAgenda)) {
      for (const e of entries) {
        const o = byKey.get(`${date}::${e.title}`);
        const placed: PlacedAgenda = {
          ...e,
          startTime: o ? (o.startTime ?? undefined) : e.startTime,
          endTime: o ? (o.endTime ?? undefined) : e.endTime,
          sourceDate: date,
          overridden: !!o,
        };
        const on = o?.movedToDate || date;
        (out[on] ||= []).push(placed);
      }
    }
    return out;
  }, [rawAgenda, overrides]);

  /** New item, dated to a specific day (the week columns and grid slots both use this). */
  const openCreateOn = (date: string, kind: 'event' | 'todo' = 'event', startTime = '') =>
    setEditor(blankEditor(date, kind, startTime));
  const openCreate = (kind: 'event' | 'todo') => openCreateOn(selectedDate, kind);

  const openEdit = (it: LifeItem) => setEditor({
    open: true,
    id: it.id,
    kind: it.kind,
    title: it.title,
    date: it.date,
    startTime: it.startTime || '',
    endTime: it.endTime || '',
    category: it.category || 'other',
    bucket: it.bucket || '',
    color: it.color || '',
    notes: it.notes || '',
  });

  const saveEditor = async () => {
    if (!editor) return;
    const title = editor.title.trim();
    if (!title) { flash('Give it a title first'); return; }

    setSaving(true);
    const body: Record<string, unknown> = {
      kind: editor.kind,
      title,
      date: editor.date,
      category: editor.category || null,
      // A horizon only means something on a todo; a colour only on a timed event.
      // Sending the other side as null keeps a converted item from carrying stale
      // state — switch an event to a todo and its colour goes with it.
      bucket: editor.kind === 'todo' ? (editor.bucket || null) : null,
      color: editor.kind === 'todo' ? null : (editor.color || null),
      notes: editor.notes || null,
      startTime: editor.kind === 'todo' ? null : (editor.startTime || null),
      endTime: editor.kind === 'todo' ? null : (editor.endTime || null),
    };
    try {
      if (editor.id) {
        const { item } = await post({ action: 'update', id: editor.id, ...body });
        setItems((prev) => prev.map((i) => (i.id === item.id ? item : i)));
      } else {
        const { item } = await post({ action: 'create', ...body });
        setItems((prev) => [...prev, item]);
      }
      setSelectedDate(editor.date);
      setEditor(null);
    } catch (e: any) {
      flash(e?.message || 'Could not save');
    } finally {
      setSaving(false);
    }
  };

  const removeItem = async (it: LifeItem) => {
    if (!window.confirm(`Delete "${it.title}"?`)) return;
    setBusyIds((b) => ({ ...b, [it.id]: true }));
    // Optimistic, so the chip disappears instantly — reverted below if the
    // server refuses (a delete that silently did nothing would reappear on the
    // next month change with no explanation).
    const snapshot = items;
    setItems((prev) => prev.filter((i) => i.id !== it.id));
    try {
      await post({ action: 'delete', id: it.id });
    } catch (e: any) {
      setItems(snapshot);
      flash(e?.message || 'Delete failed');
    } finally {
      setBusyIds((b) => { const n = { ...b }; delete n[it.id]; return n; });
    }
  };

  const toggleTodo = async (it: LifeItem) => {
    const next = !it.done;
    setItems((prev) => prev.map((i) => (i.id === it.id ? { ...i, done: next } : i)));
    try {
      // Send the DESIRED state, not 'toggle'. The API's toggle action FLIPS the
      // stored value, so a stale tab (phone open on yesterday's render) would
      // double-flip and silently disagree with what was tapped. `done: next` is
      // idempotent — the same result however stale the client is.
      const { item } = await post({ action: 'update', id: it.id, done: next });
      setItems((prev) => prev.map((i) => (i.id === item.id ? item : i)));
    } catch (e: any) {
      setItems((prev) => prev.map((i) => (i.id === it.id ? { ...i, done: it.done } : i)));
      flash(e?.message || 'Could not tick that off');
    }
  };

  const moveItem = async (id: string, date: string) => {
    const snapshot = items;
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, date } : i)));
    try {
      const { item } = await post({ action: 'move', id, date });
      setItems((prev) => prev.map((i) => (i.id === item.id ? item : i)));
    } catch (e: any) {
      setItems(snapshot);
      flash(e?.message || 'Could not move that');
    }
  };

  /**
   * The time grid's commit for one of his OWN items: the same `move` action, but
   * with the clock times too. Optimistic, reverted if the server refuses.
   */
  const moveItemTo = async (id: string, date: string, startTime: string, endTime: string) => {
    const snapshot = items;
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, date, startTime, endTime } : i)));
    try {
      const { item } = await post({ action: 'move', id, date, startTime, endTime });
      setItems((prev) => prev.map((i) => (i.id === item.id ? item : i)));
    } catch (e: any) {
      setItems(snapshot);
      flash(e?.message || 'Could not move that');
    }
  };

  /**
   * Commit a drag on an IMPORTED agenda entry as an OVERRIDE.
   *
   * Never a rewrite of `daily_agenda` — Whispersonalbot's next push replaces that
   * whole date, so the site's edit would vanish with no explanation. The override
   * is keyed by (sourceDate, title) and WINS over the stored value, so the change
   * sticks however often the bot re-pushes; the bot then reads it, fixes Obsidian,
   * and clears it. If that sync never happens, the site is still correct.
   */
  const overrideAgendaEntry = async (
    sourceDate: string,
    title: string,
    movedToDate: string | null,
    startTime: string,
    endTime: string,
  ) => {
    const snapshot = overrides;
    const optimistic: AgendaOverride = {
      id: `local:${sourceDate}::${title}`, date: sourceDate, title, movedToDate, startTime, endTime,
    };
    const without = (list: AgendaOverride[]) => list.filter((o) => !(o.date === sourceDate && o.title === title));
    setOverrides((prev) => [...without(prev), optimistic]);
    try {
      const res = await fetch(AGENDA_API, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ action: 'override-entry', date: sourceDate, title, movedToDate, startTime, endTime }),
      });
      const data = await res.json().catch(() => ({} as any));
      if (!res.ok) throw new Error(data?.error || `Could not save (${res.status})`);
      const ov: AgendaOverride = data.override;
      setOverrides((prev) => [...without(prev), ov]);
    } catch (e: any) {
      setOverrides(snapshot);
      flash(e?.message || 'Could not move that agenda entry');
    }
  };

  // ── drag handlers (pointer events — iPad safe) ──────────────────────────
  const onChipDown = (e: React.PointerEvent, it: LifeItem) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    // Capture keeps the events coming to this chip even if the finger leaves it.
    // Guarded: a synthetic event (or a browser that refuses the pointerId) would
    // otherwise throw out of the handler and kill the whole chip interaction.
    try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch { /* drag still works without capture */ }
    dragRef.current = { id: it.id, fromDate: it.date, x: e.clientX, y: e.clientY, moved: false, pid: e.pointerId };
  };

  const onChipMove = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d || d.pid !== e.pointerId) return;
    if (!d.moved) {
      // 7px of travel is a DRAG, not a tap — otherwise every tap nudges the item.
      if (Math.hypot(e.clientX - d.x, e.clientY - d.y) < 7) return;
      d.moved = true;
      setDraggingId(d.id);
      justDragged.current = true;
    }
    // The dragged chip is pointer-events:none while dragging, so elementFromPoint
    // sees the day cell underneath rather than the chip itself.
    const el = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null;
    const cell = el?.closest('[data-date]') as HTMLElement | null;
    const next = cell?.dataset.date ?? null;
    overDateRef.current = next;
    setOverDate(next);
  };

  const endDrag = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d || d.pid !== e.pointerId) return;
    dragRef.current = null;
    const target = overDateRef.current;
    overDateRef.current = null;
    setOverDate(null);
    setDraggingId(null);
    if (d.moved) {
      window.setTimeout(() => { justDragged.current = false; }, 300);
      if (target && target !== d.fromDate) moveItem(d.id, target);
    }
  };

  // ── time-grid drag handlers ─────────────────────────────────────────────
  /**
   * ⚠️ The move/up listeners live on WINDOW, attached at pointerdown, NOT in JSX
   * on the block.
   *
   * Reason (a real bug, found by dragging across columns): the drag preview
   * re-parents the block into the column under the pointer, and React reconciles
   * per parent — so the block is UNMOUNTED from the old column and MOUNTED in the
   * new one. That releases `setPointerCapture`, and the pointerup then lands on the
   * destination COLUMN, which has no pointerup handler. The gesture died silently:
   * the block looked moved, nothing was saved, and nothing errored. Window
   * listeners are immune to that because they never depend on which node survives.
   */
  const evHandlersRef = useRef<{ move: (e: PointerEvent) => void; up: (e: PointerEvent) => void } | null>(null);

  /** Which day column, and which minute inside it, is the pointer over? */
  const hitTestGrid = (x: number, y: number, grabMin: number) => {
    const el = document.elementFromPoint(x, y) as HTMLElement | null;
    const col = el?.closest('[data-daycol]') as HTMLElement | null;
    if (!col) return null;
    const r = col.getBoundingClientRect();
    const minute = ((y - r.top) / HOUR_PX) * 60;
    return { date: String(col.dataset.daycol), startMin: snapMin(minute - grabMin) };
  };

  const detachEvDrag = () => {
    const h = evHandlersRef.current;
    if (!h) return;
    window.removeEventListener('pointermove', h.move);
    window.removeEventListener('pointerup', h.up);
    window.removeEventListener('pointercancel', h.up);
    evHandlersRef.current = null;
  };

  const onEvMove = (e: PointerEvent) => {
    const d = evDragRef.current;
    if (!d || d.pid !== e.pointerId) return;
    if (!d.moved) {
      if (Math.hypot(e.clientX - d.x, e.clientY - d.y) < 5) return;
      d.moved = true;
      justDragged.current = true;
    }
    // Resize passes grabMin 0 on purpose: a move offsets by where the finger landed
    // inside the block, but a resize puts the END where the fingertip is.
    const hit = hitTestGrid(e.clientX, e.clientY, d.mode === 'resize' ? 0 : d.grabMin);
    if (!hit) return;
    if (d.mode === 'resize' || d.mode === 'resize-top') {
      // A resize pins ONE edge and lets the other follow the fingertip: the bottom
      // handle moves the end, the top handle moves the start. The day never changes.
      if (d.mode === 'resize-top') {
        const endMin = d.origEndMin ?? hit.startMin + SNAP_MIN;
        const startMin = Math.max(0, Math.min(endMin - SNAP_MIN, hit.startMin));
        const next = { key: d.key, date: d.origDate, startMin, endMin };
        dragEvRef.current = next;
        setDragEv(next);
        return;
      }
      const startMin = d.origStartMin ?? hit.startMin;
      // Never shorter than one snap step, never past midnight. The day stays put.
      const endMin = Math.max(startMin + SNAP_MIN, Math.min(DAY_MINUTES, hit.startMin));
      const next = { key: d.key, date: d.origDate, startMin, endMin };
      dragEvRef.current = next;
      setDragEv(next);
      return;
    }
    const startMin = Math.max(0, Math.min(DAY_MINUTES - d.durMin, hit.startMin));
    const next = { key: d.key, date: hit.date, startMin, endMin: startMin + d.durMin };
    dragEvRef.current = next; // read by onEvUp, which may run before React re-renders
    setDragEv(next);
  };

  const onEvUp = (e: PointerEvent) => {
    const d = evDragRef.current;
    if (!d || d.pid !== e.pointerId) return;
    evDragRef.current = null;
    detachEvDrag();
    const live = dragEvRef.current;
    dragEvRef.current = null;
    setDragEv(null);
    if (!d.moved) return; // a tap, not a drag — let the click handler do its thing
    window.setTimeout(() => { justDragged.current = false; }, 300);
    if (!live) return;

    // ── resize: one edge moved, so the day stays put and the times are committed ──
    if (d.mode === 'resize' || d.mode === 'resize-top') {
      let startMin = d.mode === 'resize-top' ? live.startMin : (d.origStartMin ?? live.startMin);
      let endMin = d.mode === 'resize-top' ? (d.origEndMin ?? live.endMin) : live.endMin;
      startMin = Math.max(0, Math.min(endMin - SNAP_MIN, startMin));
      endMin = Math.min(DAY_MINUTES, Math.max(startMin + SNAP_MIN, endMin));
      if (startMin === d.origStartMin && endMin === d.origEndMin) return; // grabbed an edge and let go
      const startTime = fromMin(startMin);
      const endTime = fromMin(endMin);
      if (d.source === 'item') {
        void moveItemTo(d.id, d.origDate, startTime, endTime);
      } else {
        // movedToDate stays null: resizing never changes which day the entry is on.
        void overrideAgendaEntry(d.sourceDate, d.title, null, startTime, endTime);
      }
      return;
    }

    const dayChanged = live.date !== d.origDate;
    const timeChanged = live.startMin !== d.origStartMin;
    if (!dayChanged && !timeChanged) return;

    const startTime = fromMin(live.startMin);
    const endTime = fromMin(live.startMin + d.durMin);
    if (d.source === 'item') {
      void moveItemTo(d.id, live.date, startTime, endTime);
    } else {
      // movedToDate is relative to the day the ENTRY lives on, not the day it was
      // being displayed on, because that day is the override's key.
      void overrideAgendaEntry(
        d.sourceDate, d.title,
        live.date === d.sourceDate ? null : live.date,
        startTime, endTime,
      );
    }
  };

  /** A drag interrupted by an unmount must not leave global listeners behind. */
  useEffect(() => () => detachEvDrag(), []);

  const onEvDown = (
    e: React.PointerEvent,
    payload: {
      source: 'item' | 'agenda'; id?: string; title: string;
      sourceDate: string; origDate: string;
      startTime?: string | null; endTime?: string | null;
    },
    mode: 'move' | 'resize' | 'resize-top' = 'move',
  ) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const startMin = toMin(payload.startTime);
    const endMin = toMin(payload.endTime);
    const durMin = startMin !== null && endMin !== null && endMin > startMin ? endMin - startMin : 60;
    evDragRef.current = {
      key: payload.id || `ag:${payload.sourceDate}::${payload.title}`,
      source: payload.source,
      id: payload.id || '',
      title: payload.title,
      sourceDate: payload.sourceDate,
      origDate: payload.origDate,
      origStartMin: startMin,
      durMin,
      mode,
      origEndMin: endMin,
      // Where inside the block the finger landed, so it doesn't jump on the first move.
      grabMin: startMin === null ? 0 : ((e.clientY - rect.top) / HOUR_PX) * 60,
      x: e.clientX, y: e.clientY, moved: false, pid: e.pointerId,
    };
    detachEvDrag();
    evHandlersRef.current = { move: onEvMove, up: onEvUp };
    window.addEventListener('pointermove', onEvMove);
    window.addEventListener('pointerup', onEvUp);
    window.addEventListener('pointercancel', onEvUp);
  };

  const changePeriod = (delta: number) => {
    if (viewMode === 'month') {
      setCursor((c) => new Date(c.getFullYear(), c.getMonth() + delta, 1));
      return;
    }
    // Week and Day both step the SELECTED DAY; cursor is dragged along so switching
    // back to Month lands on the month being looked at, not where cursor was left.
    const next = parseLocalDate(selectedDate);
    next.setDate(next.getDate() + (viewMode === 'week' ? 7 * delta : delta));
    setSelectedDate(toLocalISODate(next));
    setCursor(next);
  };

  const goToday = () => {
    const now = new Date();
    setCursor(now);
    setSelectedDate(todayLocalISO());
  };

  const headerLabel = viewMode === 'month'
    ? cursor.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
    : viewMode === 'week'
      ? `${parseLocalDate(weekDates[0]).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} – ${parseLocalDate(weekDates[6]).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}`
      : parseLocalDate(selectedDate).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });

  /**
   * A day's chips in CHRONOLOGICAL order, with Daniel's own items and the imported
   * agenda MIXED. Keeping the two layers in separate blocks made a day read
   * "2:00 PM Dentist appt" above "9:30 AM Trading" — a calendar that lists the
   * afternoon before the morning reads as broken. All-day items sort first.
   */
  const dayChips = (date: string) => {
    const chips = [
      ...(byDate[date] || []).map((it) => ({ source: 'item' as const, it, key: it.id, time: it.startTime || '', title: it.title })),
      ...(agenda[date] || []).map((a, i) => ({ source: 'agenda' as const, a, key: `ag-${date}-${i}`, time: a.startTime || '', title: a.title })),
    ];
    return chips.sort((x, y) => (x.time === y.time ? x.title.localeCompare(y.title) : x.time < y.time ? -1 : 1));
  };

  /**
   * The period toolbar — Prev / Today / Next, the Month-Week-Day zoom, the period
   * label and the + Event button. Defined once and rendered by all THREE views, so
   * switching zoom can never make the nav (or the way back) disappear.
   */
  const toolbar = () => (
    <div className="mb-4 flex flex-wrap items-center gap-2">
      <button
        onClick={() => changePeriod(-1)}
        className="flex items-center gap-1 rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm text-white/80 transition-colors hover:bg-white/10 hover:text-white"
        aria-label="Previous"
      >
        <ChevronLeft className="h-4 w-4" />
        <span className="hidden sm:inline">Prev</span>
      </button>
      <button
        onClick={goToday}
        className="rounded-lg border border-cyan-400/30 bg-cyan-400/10 px-3 py-2 text-sm font-medium text-cyan-200 transition-colors hover:bg-cyan-400/20"
      >
        Today
      </button>
      <button
        onClick={() => changePeriod(1)}
        className="flex items-center gap-1 rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm text-white/80 transition-colors hover:bg-white/10 hover:text-white"
        aria-label="Next"
      >
        <span className="hidden sm:inline">Next</span>
        <ChevronRight className="h-4 w-4" />
      </button>

      {/* Zoom level. Full class strings per state — Tailwind fragments get purged. */}
      <div className="flex overflow-hidden rounded-lg border border-white/15">
        {(['month', 'week', 'day'] as const).map((m) => (
          <button
            key={m}
            onClick={() => setViewMode(m)}
            className={`px-3 py-2 text-xs font-medium capitalize transition-colors ${
              viewMode === m ? 'bg-white/15 text-white' : 'text-white/55 hover:bg-white/5 hover:text-white'
            }`}
          >
            {m}
          </button>
        ))}
      </div>

      <div className="mx-auto text-center text-lg font-bold text-transparent bg-clip-text bg-gradient-to-r from-cyan-300 to-purple-300">
        {headerLabel}
      </div>

      <button
        onClick={() => openCreate('event')}
        className="ml-auto flex items-center gap-1.5 rounded-lg border border-emerald-400/40 bg-emerald-400/10 px-3 py-2 text-sm font-medium text-emerald-200 transition-colors hover:bg-emerald-400/20"
      >
        <Plus className="h-4 w-4" /> Event
      </button>
    </div>
  );

  /**
   * One draggable chip, shared by the MONTH grid and the WEEK columns so both get
   * identical drag behaviour from ONE implementation.
   */
  const dragChip = (it: LifeItem, cls = '') => {
    const isTodo = it.kind === 'todo';
    return (
      <div
        key={it.id}
        onPointerDown={(e) => onChipDown(e, it)}
        onPointerMove={onChipMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onClick={(e) => { e.stopPropagation(); if (justDragged.current) return; openEdit(it); }}
        title={`${it.title} — drag to another day`}
        className={`flex touch-none select-none items-center gap-1 overflow-hidden rounded border px-1 py-0.5 text-[10px] leading-tight ${
          catOf(it.category, it.color).chip
        } ${draggingId === it.id ? 'pointer-events-none opacity-40' : 'cursor-grab'} ${
          isTodo && it.done ? 'opacity-50 line-through' : ''
        } ${cls}`}
      >
        {isTodo
          ? <span className="shrink-0">{it.done ? '☑' : '☐'}</span>
          : (it.startTime ? <span className="shrink-0 opacity-75">{fmt12(it.startTime)}</span> : null)}
        <span className="truncate">{it.title}</span>
      </div>
    );
  };

  /**
   * An entry Whispersonalbot pushed for a day — READ-ONLY here. `daily_agenda` is
   * the bot's table and its POST replaces a whole date, so an edit made in this UI
   * would be reverted by the next Obsidian sync (and could race it).
   *
   * It still takes its CATEGORY colour, so a day of imported entries is not a wall
   * of identical grey chips; the DASHED border is what marks it as imported.
   */
  const importedChip = (a: AgendaEntry, key: string, cls = '') => (
    <div
      key={key}
      title={`${a.title} — from your Obsidian agenda (read-only; edit it in your calendar files)`}
      className={`overflow-hidden truncate rounded border border-dashed px-1 py-0.5 text-[10px] leading-tight ${catOf(a.category).chip} ${cls}`}
    >
      {a.startTime && <span className="mr-1 opacity-75">{fmt12(a.startTime)}</span>}
      {a.title}
    </div>
  );

  /**
   * The full day detail — events, todos, imported agenda. Used by the MONTH view's
   * side panel (narrow) and, full width, by the DAY view. It takes a date instead
   * of reading `selectedDate`, so the DAY view and the panel can never disagree.
   */
  const renderDayDetail = (date: string) => {
    const list = byDate[date] || [];
    const events = list.filter((i) => i.kind === 'event');
    const todos = list.filter((i) => i.kind === 'todo');
    const imported = agenda[date] || [];
    const doneCount = todos.filter((t) => t.done).length;

    /**
     * Todos grouped by horizon, in Daniel's order — Soon, Mid-term, Long-term, then
     * Unfiled. Empty groups are dropped so a quiet day never renders three blank
     * headers, and when only ONE group has rows its label is hidden too: a lone
     * "Soon" above a lone todo is just noise.
     */
    const todoGroups = BUCKET_OPTS
      .map((g) => ({ ...g, rows: todos.filter((t) => (t.bucket || '') === g.key) }))
      .filter((g) => g.rows.length > 0);
    const showGroupLabels = todoGroups.length > 1;

    return (
      <>
        {/* Events */}
        <div className="mb-5">
          <div className="mb-2 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-white/45">
            <CalendarDays className="h-3.5 w-3.5" /> Events
          </div>
          {events.length === 0 ? (
            <div className="rounded-lg border border-dashed border-white/10 px-3 py-3 text-center text-xs text-white/30">
              Nothing scheduled
            </div>
          ) : (
            <div className="space-y-1.5">
              {events.map((it) => (
                <div key={it.id} className={`group flex items-start gap-2 rounded-lg border px-3 py-2 ${catOf(it.category, it.color).chip}`}>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold">{it.title}</div>
                    <div className="mt-0.5 flex items-center gap-1 text-[11px] opacity-80">
                      <Clock className="h-3 w-3" />
                      {it.startTime ? `${fmt12(it.startTime)}${it.endTime ? ` – ${fmt12(it.endTime)}` : ''}` : 'All day'}
                    </div>
                    {it.notes && <div className="mt-1 whitespace-pre-wrap text-[11px] opacity-70">{it.notes}</div>}
                  </div>
                  <div className="flex shrink-0 gap-0.5 opacity-60 transition-opacity group-hover:opacity-100">
                    <button onClick={() => openEdit(it)} aria-label="Edit" className="rounded p-1 hover:bg-black/20">
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button onClick={() => removeItem(it)} aria-label="Delete" className="rounded p-1 hover:bg-black/20" disabled={!!busyIds[it.id]}>
                      {busyIds[it.id] ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Todos */}
        <div className="mb-5">
          <div className="mb-2 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-white/45">
            <ListTodo className="h-3.5 w-3.5" /> Todos
            {todos.length > 0 && (
              <span className="font-normal normal-case tracking-normal text-white/35">
                {doneCount}/{todos.length} done
              </span>
            )}
          </div>
          {todos.length === 0 ? (
            <div className="rounded-lg border border-dashed border-white/10 px-3 py-3 text-center text-xs text-white/30">
              No todos for this day
            </div>
          ) : (
            <div className="space-y-3">
              {todoGroups.map((g) => (
                <div key={g.key || 'none'}>
                  {showGroupLabels && (
                    <div className="mb-1 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-white/35">
                      {g.label}
                      <span className="font-normal normal-case tracking-normal text-white/25">{g.rows.length}</span>
                    </div>
                  )}
                  <div className="space-y-1">
              {g.rows.map((it) => (
                <div
                  key={it.id}
                  onPointerDown={(e) => onChipDown(e, it)}
                  onPointerMove={onChipMove}
                  onPointerUp={endDrag}
                  onPointerCancel={endDrag}
                  className={`group flex touch-none select-none items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-2.5 py-2 ${
                    draggingId === it.id ? 'pointer-events-none opacity-40' : 'cursor-grab'
                  }`}
                >
                  <button
                    onClick={() => toggleTodo(it)}
                    aria-label={it.done ? 'Mark not done' : 'Mark done'}
                    className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                      it.done ? 'border-emerald-400 bg-emerald-400 text-[#020408]' : 'border-white/30 hover:border-white/60'
                    }`}
                  >
                    {it.done && <Check className="h-3 w-3" strokeWidth={3} />}
                  </button>
                  <button
                    onClick={() => openEdit(it)}
                    className={`min-w-0 flex-1 truncate text-left text-sm ${it.done ? 'text-white/40 line-through' : 'text-white/90'}`}
                  >
                    {it.title}
                  </button>
                  <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${catOf(it.category, it.color).dot}`} />
                  <button
                    onClick={() => removeItem(it)}
                    aria-label="Delete"
                    className="shrink-0 rounded p-1 text-white/40 opacity-0 transition-opacity hover:bg-white/10 hover:text-white group-hover:opacity-100"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Imported agenda layer */}
        {imported.length > 0 && (
          <div>
            <div className="mb-2 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-white/45">
              <Inbox className="h-3.5 w-3.5" /> From your agenda
            </div>
            <div className="space-y-1">
              {imported.map((a, i) => (
                <div key={`ag-${i}`} className="flex items-start gap-2 rounded-lg border border-dashed border-white/15 bg-white/[0.03] px-2.5 py-2">
                  {/* The pushed titles already carry their emoji ("🚗 Spark deliveries")
                      AND ship a separate `icon`, so rendering both doubles it up. Only
                      show the icon when the title doesn't already start with it. */}
                  {a.icon && !a.title.includes(a.icon) && <span className="text-base leading-none">{a.icon}</span>}
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm text-white/75">{a.title}</div>
                    <div className="text-[11px] text-white/35">
                      {a.startTime ? `${fmt12(a.startTime)}${a.endTime ? ` – ${fmt12(a.endTime)}` : ''}` : 'All day'}
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-2 text-[11px] text-white/30">
              Pushed from Obsidian — edit these in your calendar files, not here.
            </div>
          </div>
        )}
      </>
    );
  };

  /**
   * The TIME GRID — Week (7 columns) and Day (1 column).
   *
   * Google Calendar's shape: a 24-hour axis down the left, events absolutely
   * positioned by their clock time, tall enough that a day's blocks have room to
   * breathe instead of being squashed into chips. Anything without a clock time
   * (todos, all-day events, untimed agenda entries) sits in the ALL-DAY STRIP above
   * the grid, so a zoom change never hides something.
   *
   * Drag: vertical changes the TIME (15-min snap), horizontal changes the DAY —
   * both in one gesture, because that is what "move this to 1pm" means. Timed
   * agenda entries drag the same way; that is what writes an override.
   *
   * What is NOT draggable, and why: an untimed item in the strip (the strip is not
   * part of the hour grid — the month view is where those move by day), and
   * painting an all-day item into an hour slot (edit it instead; silently inventing
   * a time from a horizontal drag would read as a bug).
   */
  const renderTimeGrid = (dates: string[]) => {
    const hours = Array.from({ length: 24 }, (_, h) => h);

    /** Every TIMED row across the shown days, from both layers. */
    const baseTimed = dates.flatMap((date) => [
      ...(byDate[date] || []).flatMap((it) => {
        const s = toMin(it.startTime);
        if (s === null) return [];
        const e = toMin(it.endTime);
        return [{
          key: it.id, source: 'item' as const, id: it.id, title: it.title,
          sourceDate: date, origDate: date, category: it.category ?? null,
          // Grid blocks honour a picked colour too, not just the panel rows.
          color: it.color ?? null,
          notes: it.notes ?? null, startMin: s, endMin: e !== null && e > s ? e : s + 60,
        }];
      }),
      ...(agenda[date] || []).flatMap((a) => {
        const s = toMin(a.startTime);
        if (s === null) return [];
        const e = toMin(a.endTime);
        return [{
          key: `ag:${a.sourceDate}::${a.title}`, source: 'agenda' as const, id: '', title: a.title,
          sourceDate: a.sourceDate, origDate: date, category: a.category ?? null,
          color: null, // an imported agenda entry carries no colour of its own
          notes: null, startMin: s, endMin: e !== null && e > s ? e : s + 60,
        }];
      }),
    ]);

    /**
     * The all-day strip carries UNTIMED EVENTS only. Todos are deliberately excluded:
     * they already have tickable rows in the day panel beside the grid, and a second
     * copy running across the top of the calendar was just clutter. Daniel: "on top of
     * the calendar, on the actual calendar, I have to-dos as well and it's messing up
     * the actual calendar." When nothing untimed is in the window, the strip is
     * dropped entirely so the hour grid gets its vertical space back.
     */
    const untimedEventRows = (date: string) => (byDate[date] || []).filter((i) => !i.startTime && i.kind !== 'todo');
    const untimedAgendaRows = (date: string) => (agenda[date] || []).filter((a) => !a.startTime);
    const showAllDayStrip = dates.some((d) => untimedEventRows(d).length > 0 || untimedAgendaRows(d).length > 0);

    /**
     * A day's rows WITH the drag preview applied: the dragged block is removed from
     * where it was and re-drawn at the pointer's position, so the drag follows the
     * finger instead of jumping only on drop.
     */
    const rowsFor = (date: string) => {
      const rows = baseTimed.filter((r) => r.origDate === date && r.key !== dragEv?.key);
      if (dragEv && dragEv.date === date) {
        const origin = baseTimed.find((r) => r.key === dragEv.key);
        if (origin) rows.push({ ...origin, startMin: dragEv.startMin, endMin: dragEv.endMin });
      }
      return rows;
    };

    const gutter = 'w-12 shrink-0 sm:w-14';

    return (
      <div className="overflow-hidden rounded-lg border border-white/10">
        {/* Day headers — Week only; in Day view the toolbar already names the day. */}
        {dates.length > 1 && (
          <div className="flex border-b border-white/10 bg-white/[0.02]">
            <div className={gutter} />
            {dates.map((date) => {
              const d = parseLocalDate(date);
              const isToday = date === today;
              return (
                <button
                  key={date}
                  onClick={() => setSelectedDate(date)}
                  className={`flex-1 border-l border-white/10 px-1 py-2 text-center transition-colors ${
                    isToday ? 'bg-cyan-400/10' : 'hover:bg-white/5'
                  }`}
                >
                  <div className="text-[10px] font-bold uppercase tracking-wider text-white/45">
                    {d.toLocaleDateString(undefined, { weekday: 'short' })}
                  </div>
                  <div className={`text-sm font-bold ${isToday ? 'text-cyan-300' : 'text-white/80'}`}>
                    {d.getDate()}
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {/* ALL-DAY STRIP — untimed EVENTS only, and only when there are some. */}
        {showAllDayStrip && (
        <div className="flex border-b border-white/10 bg-white/[0.02]">
          <div className={`${gutter} px-1 py-1.5 text-right text-[9px] font-bold uppercase tracking-wider text-white/35 sm:text-[10px]`}>
            all-day
          </div>
          {dates.map((date) => {
            // Untimed EVENTS only — never timed rows (they'd render twice, once here
            // and once in the grid) and never todos (those are the day panel's job).
            const untimed = untimedEventRows(date);
            const untimedAgenda = untimedAgendaRows(date);
            return (
              <div
                key={date}
                data-date={date}
                onClick={() => setSelectedDate(date)}
                className="min-h-[38px] flex-1 cursor-pointer space-y-0.5 border-l border-white/10 p-1"
              >
                {untimed.map((it) => dragChip(it, 'w-full'))}
                {untimedAgenda.map((a, i) => importedChip(a, `gs-${date}-${i}`, 'w-full'))}
                <button
                  onClick={(e) => { e.stopPropagation(); openCreateOn(date, 'todo'); }}
                  aria-label={`Add todo to ${date}`}
                  className="w-full rounded border border-white/10 py-0.5 text-[10px] text-white/30 transition-colors hover:bg-white/10 hover:text-white/70"
                >
                  +
                </button>
              </div>
            );
          })}
        </div>
        )}

        {/* HOUR GRID — the long part. Scrolls internally; opens at 07:00. */}
        <div ref={gridScrollRef} className={dates.length > 1 ? 'max-h-[62vh] overflow-y-auto' : 'max-h-[70vh] overflow-y-auto'}>
          <div className="flex" style={{ height: GRID_BODY_H }}>
            {/* Time axis */}
            <div className={`relative ${gutter}`}>
              {hours.map((h) => (
                <div key={h} style={{ height: HOUR_PX }} className="relative">
                  <span className="absolute right-1 top-0 -translate-y-1/2 text-[10px] text-white/35">
                    {h === 0 ? '' : `${h % 12 || 12}${h < 12 ? 'am' : 'pm'}`}
                  </span>
                </div>
              ))}
            </div>

            {dates.map((date) => {
              const rows = rowsFor(date);
              const pack = packColumns(rows.map((r) => ({ key: r.key, startMin: r.startMin, endMin: r.endMin })));
              const isToday = date === today;
              return (
                <div
                  key={date}
                  data-daycol={date}
                  data-date={date}
                  onClick={() => {
                    if (justDragged.current) return;
                    // A tap on the grid SELECTS the day, so the panel beside it follows.
                    // It deliberately does NOT open the editor: "tap to look at a day" and
                    // "tap to create" cannot be the same gesture, and a modal every time he
                    // taps around the week is the worse of the two. Create from the panel's
                    // Todo/Event buttons, the toolbar's + Event, or the all-day strip's +.
                    setSelectedDate(date);
                  }}
                  className="relative flex-1 border-l border-white/10"
                >
                  {hours.map((h) => (
                    <div key={h} style={{ height: HOUR_PX }} className="border-t border-white/5" />
                  ))}

                  {/* Now-line, today only (the 30s tick keeps it honest). */}
                  {isToday && (
                    <div className="pointer-events-none absolute left-0 right-0 z-20" style={{ top: (nowMin / 60) * HOUR_PX }}>
                      <div className="h-px bg-rose-500/80" />
                      <div className="absolute -left-[3px] -top-[3px] h-1.5 w-1.5 rounded-full bg-rose-500" />
                    </div>
                  )}

                  {rows.map((r) => {
                    const pos = pack.get(r.key) ?? { col: 0, cols: 1 };
                    const widthPct = 100 / pos.cols;
                    const isDragging = dragEv?.key === r.key;
                    const blockH = ((r.endMin - r.startMin) / 60) * HOUR_PX;
                    return (
                      <div
                        key={r.key}
                        onPointerDown={(e) => onEvDown(e, {
                          source: r.source, id: r.id || undefined, title: r.title,
                          sourceDate: r.sourceDate, origDate: r.origDate,
                          startTime: fromMin(r.startMin), endTime: fromMin(r.endMin),
                        })}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (justDragged.current) return;
                          if (r.source === 'item') {
                            const it = items.find((i) => i.id === r.id);
                            if (it) openEdit(it);
                          } else {
                            flash('From your agenda — drag it to change the time; Wiz syncs Obsidian to match.');
                          }
                        }}
                        title={r.source === 'agenda'
                          ? `${r.title} — from your Obsidian agenda; drag to change the time or day`
                          : `${r.title} — drag to change the time or day`}
                        className={`absolute z-10 cursor-grab touch-none select-none overflow-hidden border px-1 py-0.5 text-[10px] leading-tight ${
                          catOf(r.category, r.color).chip
                        } ${r.source === 'agenda' ? 'border-dashed' : ''} ${
                          isDragging ? 'pointer-events-none z-30 opacity-90 shadow-lg ring-2 ring-cyan-300/60' : ''
                        }`}
                        style={{
                          top: (r.startMin / 60) * HOUR_PX,
                          height: Math.max(16, blockH),
                          left: `calc(${pos.col * widthPct}% + 2px)`,
                          width: `calc(${widthPct}% - 4px)`,
                        }}
                      >
                        <div className="flex items-baseline gap-1 overflow-hidden">
                          <span className="shrink-0 font-semibold opacity-80">{fmt12(fromMin(r.startMin))}</span>
                          <span className="truncate">{r.title}</span>
                        </div>
                        {blockH >= 44 && (
                          <div className="truncate opacity-60">
                            {r.notes ? r.notes : fmt12(fromMin(r.endMin))}
                          </div>
                        )}
                        {/* TOP HANDLE — drag the top edge to change the START time. */}
                        <div
                          onPointerDown={(e) => {
                            e.stopPropagation();
                            onEvDown(e, {
                              source: r.source, id: r.id || undefined, title: r.title,
                              sourceDate: r.sourceDate, origDate: r.origDate,
                              startTime: fromMin(r.startMin), endTime: fromMin(r.endMin),
                            }, 'resize-top');
                          }}
                          title="Drag to change the start time"
                          className="group absolute inset-x-0 top-0 z-20 flex h-2 cursor-ns-resize touch-none items-start justify-center"
                        >
                          <span className="mt-px h-[3px] w-7 rounded-full bg-white/30 transition-colors group-hover:bg-white/80" />
                        </div>
                        {/* RESIZE HANDLE — drag the bottom edge to change the end time.
                            The stopPropagation is load-bearing: without it the block's own
                            onPointerDown fires as well and starts a MOVE, so the block
                            would slide instead of grow. */}
                        <div
                          onPointerDown={(e) => {
                            e.stopPropagation();
                            onEvDown(e, {
                              source: r.source, id: r.id || undefined, title: r.title,
                              sourceDate: r.sourceDate, origDate: r.origDate,
                              startTime: fromMin(r.startMin), endTime: fromMin(r.endMin),
                            }, 'resize');
                          }}
                          title="Drag to change the end time"
                          className="group absolute inset-x-0 bottom-0 z-20 flex h-2 cursor-ns-resize touch-none items-end justify-center"
                        >
                          <span className="mb-px h-[3px] w-7 rounded-full bg-white/30 transition-colors group-hover:bg-white/80" />
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {notice && (
        <div className="flex items-start justify-between gap-3 rounded-xl border border-amber-400/30 bg-amber-400/10 px-4 py-3 text-sm text-amber-200">
          <span>{notice}</span>
          <button onClick={() => setNotice(null)} aria-label="Dismiss" className="text-amber-200/70 hover:text-amber-100">✕</button>
        </div>
      )}

      {/* The calendar uses the full width it is given. `view === 'calendar'` lets its
          container run wider than the rest of the app (see Dashboard) so the day
          panel fits in the dark space beside the grid instead of squeezing it. */}
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_340px] gap-4 items-start">
        {/* ── Month grid ─────────────────────────────────────────────────── */}
        <NeonCard className="p-4 sm:p-5" glow="cyan">
          {toolbar()}

          {loading ? (
            <div className="flex items-center justify-center py-24 text-white/40">
              <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading calendar…
            </div>
          ) : error ? (
            <div className="flex flex-col items-center gap-3 py-24 text-center">
              <AlertCircle className="h-6 w-6 text-rose-300" />
              <div className="text-sm text-rose-200">{error}</div>
              <button onClick={load} className="rounded-lg border border-white/20 bg-white/5 px-3 py-1.5 text-sm text-white/80 hover:bg-white/10">
                Try again
              </button>
            </div>
          ) : viewMode === 'week' ? (
            renderTimeGrid(weekDates)
          ) : viewMode === 'day' ? (
            renderTimeGrid([selectedDate])
          ) : (
            <>
              {/* Weekday header */}
              <div className="mb-1 grid grid-cols-7 gap-1 sm:gap-1.5">
                {WEEKDAYS.map((d) => (
                  <div key={d} className="py-1 text-center text-[11px] font-bold uppercase tracking-wider text-white/45">
                    {d}
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-7 gap-1 sm:gap-1.5">
                {days.map((d) => {
                  const agendaCount = (agenda[d.date] || []).length;
                  const chips = dayChips(d.date);
                  const isOpen = !!expanded[d.date];
                  const shown = isOpen ? chips : chips.slice(0, CHIPS_PER_DAY);
                  const hidden = Math.max(0, chips.length - shown.length);
                  const isToday = d.date === today;
                  const isSelected = d.date === selectedDate;
                  const isOver = draggingId !== null && overDate === d.date;

                  return (
                    <div
                      key={d.date}
                      data-date={d.date}
                      onClick={() => setSelectedDate(d.date)}
                      className={`min-h-[86px] sm:min-h-[112px] cursor-pointer rounded-lg border p-1.5 transition-colors sm:p-2 ${
                        d.inMonth ? 'bg-white/[0.03]' : 'bg-transparent'
                      } ${
                        isSelected ? 'border-cyan-400/70 ring-1 ring-cyan-400/40' : 'border-white/10 hover:border-white/25'
                      } ${isOver ? 'border-emerald-400/80 bg-emerald-400/10 ring-2 ring-emerald-400/50' : ''}`}
                    >
                      <div className="mb-1 flex items-center justify-between">
                        <span
                          className={`inline-flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-bold sm:h-6 sm:w-6 sm:text-xs ${
                            isToday
                              ? 'bg-cyan-400 text-[#020408]'
                              : d.inMonth ? 'text-white/80' : 'text-white/25'
                          }`}
                        >
                          {d.day}
                        </span>
                        {/* Imported agenda marks the day with a dot so it is visible
                            even when the chips are collapsed on a phone. */}
                        {agendaCount > 0 && (
                          <span className="h-1.5 w-1.5 rounded-full bg-white/40" title={`${agendaCount} from your agenda`} />
                        )}
                      </div>

                      <div className="space-y-0.5">
                        {shown.map((c) => (c.source === 'item' ? dragChip(c.it) : importedChip(c.a, c.key)))}

                        {hidden > 0 && (
                          <button
                            onClick={(e) => { e.stopPropagation(); setExpanded((p) => ({ ...p, [d.date]: !isOpen })); }}
                            className="w-full rounded px-1 text-left text-[10px] font-medium text-cyan-300/80 hover:text-cyan-200"
                          >
                            {isOpen ? 'show less' : `+${hidden} more`}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-white/40">
                <span className="flex items-center gap-1"><Pencil className="h-3 w-3" /> Drag any chip onto another day to move it</span>
                <span className="flex items-center gap-1"><span className="h-2 w-3 rounded border border-dashed border-white/40" /> Dashed = from your Obsidian agenda (read-only)</span>
              </div>
            </>
          )}
        </NeonCard>

        {/* ── Day panel — shown in EVERY view (Daniel: "when I'm in monthly I can see
            the to-do list on the right, can you do that for weekly and daily?"). It is
            what makes todos TICKABLE in week/day — the grid's all-day strip only holds
            chips. In Day view it lists the same day as the grid, which is deliberate:
            the grid is the timeline, this is the readable list with notes. ────────── */}
        <NeonCard className="p-4 sm:p-5" glow="purple">
          <div className="mb-4 flex items-center justify-between gap-2">
            <div>
              <div className="text-base font-bold text-white">{longDay(selectedDate)}</div>
              {selectedDate === today && <div className="text-[11px] font-medium uppercase tracking-wider text-cyan-300">Today</div>}
            </div>
            <div className="flex gap-1.5">
              <button
                onClick={() => openCreate('todo')}
                className="flex items-center gap-1 rounded-lg border border-white/15 bg-white/5 px-2.5 py-1.5 text-xs font-medium text-white/80 hover:bg-white/10"
              >
                <ListTodo className="h-3.5 w-3.5" /> Todo
              </button>
              <button
                onClick={() => openCreate('event')}
                className="flex items-center gap-1 rounded-lg border border-emerald-400/40 bg-emerald-400/10 px-2.5 py-1.5 text-xs font-medium text-emerald-200 hover:bg-emerald-400/20"
              >
                <Plus className="h-3.5 w-3.5" /> Event
              </button>
            </div>
          </div>

          {renderDayDetail(selectedDate)}

        </NeonCard>
      </div>

      {/* ── Editor ──────────────────────────────────────────────────────── */}
      {editor && (
        <div
          className="fixed inset-0 z-[70] flex items-end justify-center bg-black/70 backdrop-blur-sm sm:items-center"
          onClick={() => setEditor(null)}
        >
          <div
            className="w-full max-w-md rounded-t-2xl border border-white/15 bg-[#020408] p-5 shadow-2xl sm:rounded-2xl"
            style={{ maxHeight: '88vh', overflowY: 'auto' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-bold text-white">{editor.id ? 'Edit' : 'New'} {editor.kind === 'todo' ? 'todo' : 'event'}</h3>
              <button onClick={() => setEditor(null)} className="text-white/40 hover:text-white/70" aria-label="Close">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mb-4 flex gap-2">
              {(['event', 'todo'] as const).map((k) => (
                <button
                  key={k}
                  onClick={() => setEditor((ed) => (ed ? { ...ed, kind: k } : ed))}
                  className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium capitalize transition-colors ${
                    editor.kind === k ? 'border-cyan-400/60 bg-cyan-400/15 text-cyan-100' : 'border-white/15 bg-white/5 text-white/60 hover:text-white'
                  }`}
                >
                  {k}
                </button>
              ))}
            </div>

            <label className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-white/45">Title</label>
            <input
              autoFocus
              value={editor.title}
              onChange={(e) => setEditor((ed) => (ed ? { ...ed, title: e.target.value } : ed))}
              onKeyDown={(e) => { if (e.key === 'Enter') saveEditor(); }}
              placeholder={editor.kind === 'todo' ? 'What needs doing?' : 'What is it?'}
              className="mb-4 w-full rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm text-white placeholder-white/30 outline-none focus:border-cyan-400/60"
            />

            <div className="mb-4 grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-white/45">Date</label>
                <input
                  type="date"
                  value={editor.date}
                  onChange={(e) => setEditor((ed) => (ed ? { ...ed, date: e.target.value } : ed))}
                  className="w-full rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm text-white outline-none focus:border-cyan-400/60"
                />
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-white/45">Category</label>
                <select
                  value={editor.category}
                  onChange={(e) => setEditor((ed) => (ed ? { ...ed, category: e.target.value } : ed))}
                  className="w-full rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm text-white outline-none focus:border-cyan-400/60"
                >
                  {CATS.map((c) => <option key={c.key} value={c.key} className="bg-[#020408]">{c.label}</option>)}
                </select>
              </div>
            </div>

            {/* A todo's horizon. Three named folders plus the unfiled state. */}
            {editor.kind === 'todo' && (
              <div className="mb-4">
                <label className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-white/45">When</label>
                <div className="flex gap-2">
                  {BUCKET_OPTS.map((b) => (
                    <button
                      key={b.key || 'none'}
                      onClick={() => setEditor((ed) => (ed ? { ...ed, bucket: b.key } : ed))}
                      className={`flex-1 rounded-lg border px-2 py-2 text-xs font-medium transition-colors ${
                        editor.bucket === b.key ? 'border-cyan-400/60 bg-cyan-400/15 text-cyan-100' : 'border-white/15 bg-white/5 text-white/60 hover:text-white'
                      }`}
                    >
                      {b.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* An event's colour. "Auto" keeps the category hue, so doing nothing
                preserves exactly what the calendar looked like before. */}
            {editor.kind === 'event' && (
              <div className="mb-4">
                <label className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-white/45">Colour</label>
                <div className="flex flex-wrap items-center gap-1.5">
                  <button
                    onClick={() => setEditor((ed) => (ed ? { ...ed, color: '' } : ed))}
                    title="Match the category colour"
                    className={`rounded-md border px-2 py-1 text-[11px] font-medium transition-colors ${
                      editor.color === '' ? 'border-cyan-400/60 bg-cyan-400/15 text-cyan-100' : 'border-white/15 bg-white/5 text-white/55 hover:text-white'
                    }`}
                  >
                    Auto
                  </button>
                  {PALETTE.map((p) => (
                    <button
                      key={p.key}
                      onClick={() => setEditor((ed) => (ed ? { ...ed, color: p.key } : ed))}
                      title={p.label}
                      aria-label={`Colour ${p.label}`}
                      className={`h-7 w-7 rounded-md border transition-transform hover:scale-110 ${
                        editor.color === p.key ? 'border-white ring-2 ring-white/40' : 'border-white/20'
                      } ${p.dot}`}
                    />
                  ))}
                </div>
              </div>
            )}

            {editor.kind === 'event' && (
              <div className="mb-4 grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-white/45">Start</label>
                  <input
                    type="time"
                    value={editor.startTime}
                    onChange={(e) => setEditor((ed) => (ed ? { ...ed, startTime: e.target.value } : ed))}
                    className="w-full rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm text-white outline-none focus:border-cyan-400/60"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-white/45">End</label>
                  <input
                    type="time"
                    value={editor.endTime}
                    onChange={(e) => setEditor((ed) => (ed ? { ...ed, endTime: e.target.value } : ed))}
                    className="w-full rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm text-white outline-none focus:border-cyan-400/60"
                  />
                </div>
                <div className="col-span-2 text-[11px] text-white/30">Leave the times empty for an all-day event.</div>
              </div>
            )}

            <label className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-white/45">Notes</label>
            <textarea
              value={editor.notes}
              onChange={(e) => setEditor((ed) => (ed ? { ...ed, notes: e.target.value } : ed))}
              rows={3}
              placeholder="Optional"
              className="mb-5 w-full resize-none rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm text-white placeholder-white/30 outline-none focus:border-cyan-400/60"
            />

            <div className="flex gap-2">
              <button
                onClick={saveEditor}
                disabled={saving}
                className="flex flex-1 items-center justify-center gap-2 rounded-lg border border-emerald-400/50 bg-emerald-400/15 px-4 py-2.5 text-sm font-bold text-emerald-100 transition-colors hover:bg-emerald-400/25 disabled:opacity-50"
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Save
              </button>
              {editor.id && (
                <button
                  onClick={() => {
                    const it = items.find((i) => i.id === editor.id);
                    setEditor(null);
                    if (it) removeItem(it);
                  }}
                  className="rounded-lg border border-rose-400/40 bg-rose-400/10 px-4 py-2.5 text-sm font-medium text-rose-200 transition-colors hover:bg-rose-400/20"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default LifeCalendar;
