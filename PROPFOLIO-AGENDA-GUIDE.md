# Propfolio — Daily Agenda contract (Whispersonalbot)

**Audience:** Whispersonalbot (the `personal` profile bot) — and anyone else who reads or
writes the day-by-day agenda.
**Site:** https://silly-gaufre-f1dd14.netlify.app
**Endpoint:** `/.netlify/functions/daily-agenda`
**Bot procedure:** skill `daily-agenda-push` in the personal profile.

The agenda is pushed from Daniel's Obsidian vault (`/root/Brain/Life/Calendar/YYYY-MM-DD*.md`)
and rendered inside **Propfolio → Life → Calendar**, as the dashed "from your agenda" chips.

---

## 1. Auth

Standard headers — the handler resolves the user from them:

```
X-User-Id:    293080f9-a395-4482-9ec2-ad31bf105848
X-User-Email: infernotrading9@gmail.com
Content-Type: application/json
```

---

## 2. ⚠️ POST REPLACES THE WHOLE DAY

```
POST /.netlify/functions/daily-agenda
{ "date": "2026-11-26", "entries": [ ... ] }
```

The body's `entries` array **replaces** everything stored for that `date`. Not a merge, not an
append.

So: **always send the COMPLETE list of that day's entries.** Sending one entry deletes the rest of
that date. Sending `[]` clears the day. A date you omit is untouched, which is the safe direction.

There is no DELETE endpoint. To remove one entry, re-POST the day without it.

**Never write a past date.** Past days are the record of what happened.

---

## 3. ⚠️ Daniel edits the agenda from the SITE — read this before you push

He can drag an agenda chip in Propfolio to a different **time** or **day**. That edit is NOT
written into `daily_agenda` (your push would silently revert it). It is stored as an **override**,
and the calendar renders `stored entry + override`.

**The override WINS over the stored entry.** Consequences you must plan for:

- **Re-pushing does not undo his edit.** If you push 09:30 over an override of 13:00, the site
  still shows 13:00.
- **Only clearing the override hands the value back to you.**
- So a pushed change that disagrees with an override is INVISIBLE until the override is cleared —
  if you believe your version is right, clear the override too (or ask him), do not just re-push.

### Read his edits

Both GET forms return an `overrides` array:

```
GET ?from=YYYY-MM-DD&to=YYYY-MM-DD   → { from, to, days: [...], overrides: [...] }
GET ?date=YYYY-MM-DD                 → { date, entries: [...], overrides: [...] }
```

```json
{ "id": "...", "date": "2026-11-26", "title": "💼 Trading",
  "movedToDate": null, "startTime": "16:00", "endTime": "21:30" }
```

| Field | Meaning |
|---|---|
| `date` | The day the entry lives on in `daily_agenda` — **this is the key, not an index.** |
| `title` | Must match the entry's title exactly, emoji included. |
| `movedToDate` | `null` = same day. Set = he dragged it onto another day; that is where it belongs now. |
| `startTime` / `endTime` | `"HH:MM"`, or `null` for all-day. |

### Reconcile loop (the point of all this)

Overrides are **keyed by (date, title)**, never by array index, because your push rewrites the whole
array — an index would point at a different entry the moment anything is added or removed.

1. Read the agenda range and take `overrides`.
2. For each one, open the Obsidian file for `date` (or `movedToDate` when set) and edit that
   entry: move or change its times, or move the line to the other day's file. Carry the override's
   `startTime`/`endTime` across verbatim.
3. **Then** clear it, once the file actually matches:
   ```
   POST { "action": "clear-overrides", "keys": [{ "date": "2026-11-26", "title": "💼 Trading" }] }
   ```
   A whole day in one go: `POST { "action": "clear-overrides", "date": "2026-11-26" }`
4. Read the day back and confirm.

Clearing is only safe AFTER the file matches — clear early and the site snaps back to the stored
value, which looks to Daniel like his edit vanished.

If you never reconcile, nothing breaks: his edit stays on the site and your stored entry keeps the
original. The override just sits there quietly winning.

---

## 4. GET

| Call | Returns |
|---|---|
| `GET ?date=2026-11-26` | one day: `{ date, entries, overrides, updatedAt }` |
| `GET ?from=2026-11-01&to=2026-11-30` | range: `{ from, to, days: [...], overrides: [...] }` — **non-empty days only** |

The range form was added Nov 26 2026 for the Life calendar, which loads a whole month in one
request (one call per day would be 30+ round trips).

---

## 5. Entry shape

```json
{
  "title": "🏋️ Legs reps - quads hams glutes calves",
  "startTime": "20:00",
  "endTime": "21:30",
  "category": "workouts",
  "icon": "🏋️"
}
```

| Field | Notes |
|---|---|
| `title` | **Required.** Emoji prefix is fine and is displayed as-is. |
| `startTime` / `endTime` | `"HH:MM"` 24-hour. Omit both for all-day (the UI then shows **All day** rather than guessing). |
| `category` | Free text. **Drives the colour** (see below). |
| `icon` | Emoji shown beside the title in the day panel. Omit and it falls back to 📌. |

The array is stored as JSON, so extra keys survive — but nothing else is rendered.

---

## 6. Categories and colour

Categories in use today: `trading`, `spark`, `workouts`, `prep`, `work`.

The calendar has a fixed palette for `trading` / `work` / `health` / `study` / `personal` / `other`.
Any **other** category gets a stable colour picked by hashing its name — the same category is
always the same colour, but two different names are not guaranteed to differ. So:

- **Prefer reusing a category name** rather than inventing a near-duplicate
  (`workout` vs `workouts` vs `gym` are three different colours for one thing).
- An entry with no `category` renders as grey "Other".

---

## 7. What the agenda layer is NOT

Propfolio's **Life → Calendar** has two layers and they are stored separately on purpose:

| Layer | Storage | Who writes it |
|---|---|---|
| **"from your agenda"** — dashed chips | `daily_agenda` + `agenda_overrides` | **this endpoint (you)**, plus Daniel's overrides |
| Daniel's own events and todos — solid chips, tickable | `life_calendar_items` | `db-life-calendar` (the UI) |

Because they are different tables, **a push can never wipe an item Daniel added by hand**, and he
cannot edit your stored entries from the UI (he writes an override instead). Do not write to
`life_calendar_items`, and do not expect his items in `daily_agenda`.

The calendar displays both layers **mixed in chronological order** for a day, and anything with no
clock time sits in the all-day strip above the hour grid.

---

## 8. Verifying a push

```bash
curl -s "https://silly-gaufre-f1dd14.netlify.app/.netlify/functions/daily-agenda?date=2026-11-26" \
  -H "X-User-Id: 293080f9-a395-4482-9ec2-ad31bf105848" \
  -H "X-User-Email: infernotrading9@gmail.com"
```

Read it back and confirm the entry count matches what you sent — a `200` means the write was
accepted, not that the day is correct.
