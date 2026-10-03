/**
 * botNoteService — Ticksensei's own scratchpad.
 *
 * Facts the bot keeps for itself so it doesn't have to carry them in memory or
 * in its skill: bill minimum payments, due days, standing instructions. Daniel
 * tells it once, the bot writes it here, and every `getFullState` hands it back.
 *
 * Upsert is keyed on `lower(key)`, so re-stating a fact UPDATES it instead of
 * accumulating near-duplicates. That matters: a due-date that changes twice a
 * year must not leave three contradicting rows behind.
 *
 * Raw SQL rather than the Drizzle query builder because the conflict target is a
 * FUNCTIONAL index — `(user_id, lower(key))` — which `onConflictDoUpdate` cannot
 * express.
 */
import { sql } from 'drizzle-orm';
import { db } from './connection';

export const BOT_NOTE_MAX_KEY = 200;
export const BOT_NOTE_MAX_VALUE = 4000;

export const BOT_NOTE_CATEGORIES = [
  'bill',        // a recurring payment: minimum, due day
  'deadline',    // a one-off date that matters
  'rule',        // a standing instruction from Daniel
  'account',     // a fact about a specific budget/trading account
  'general',
] as const;

export interface BotNote {
  id: string;
  key: string;
  value: string;
  category: string | null;
  accountRef: string | null;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

const SELECT_COLS = sql`
  id, key, value, category,
  account_ref AS "accountRef", sort_order AS "sortOrder",
  created_at AS "createdAt", updated_at AS "updatedAt"`;

export const botNoteService = {
  async listByUser(userId: string): Promise<BotNote[]> {
    const r = await db.execute(sql`
      SELECT ${SELECT_COLS} FROM bot_notes
       WHERE user_id = ${userId}::uuid
       ORDER BY sort_order, lower(key)`);
    return (r.rows as any[]) as BotNote[];
  },

  async getByKey(userId: string, key: string): Promise<BotNote | null> {
    const r = await db.execute(sql`
      SELECT ${SELECT_COLS} FROM bot_notes
       WHERE user_id = ${userId}::uuid AND lower(key) = lower(${key})
       LIMIT 1`);
    return ((r.rows as any[])[0] ?? null) as BotNote | null;
  },

  /**
   * Create or update one fact. Returns the stored row plus whether it was new,
   * so the bot can say "noted" vs "updated that" honestly.
   *
   * PARTIAL UPDATE SEMANTICS on the optional fields: omitting `category` (or
   * `accountRef`) KEEPS the stored value, while passing an empty string clears
   * it. A full replace would mean the bot saying "the minimum is now $40" wipes
   * the category and the account link that made the note useful — which is
   * exactly the degradation this store exists to avoid.
   */
  async setNote(
    userId: string,
    data: { key: string; value: string; category?: string | null; accountRef?: string | null; sortOrder?: number },
  ): Promise<{ note: BotNote; created: boolean }> {
    const key = String(data.key).trim();
    const value = String(data.value).trim();
    const keepCategory = !('category' in data) || data.category === undefined;
    const keepAccountRef = !('accountRef' in data) || data.accountRef === undefined;
    const category = data.category == null || data.category === '' ? null : String(data.category).trim();
    const accountRef = data.accountRef == null || data.accountRef === '' ? null : String(data.accountRef).trim();
    const sortOrder = Number.isFinite(Number(data.sortOrder)) ? Math.trunc(Number(data.sortOrder)) : 0;

    // Check first so `created` is accurate — the upsert can't tell us.
    const existing = await this.getByKey(userId, key);

    const r = await db.execute(sql`
      INSERT INTO bot_notes (user_id, key, value, category, account_ref, sort_order)
      VALUES (${userId}::uuid, ${key}, ${value}, ${category}, ${accountRef}, ${sortOrder})
      ON CONFLICT (user_id, lower(key)) DO UPDATE SET
        value       = EXCLUDED.value,
        category    = CASE WHEN ${keepCategory}   THEN bot_notes.category    ELSE EXCLUDED.category    END,
        account_ref = CASE WHEN ${keepAccountRef} THEN bot_notes.account_ref ELSE EXCLUDED.account_ref END,
        sort_order  = EXCLUDED.sort_order,
        updated_at  = NOW()
      RETURNING ${SELECT_COLS}`);

    return { note: (r.rows as any[])[0] as BotNote, created: existing === null };
  },

  async deleteByKey(userId: string, key: string): Promise<boolean> {
    // RETURNING rather than rowCount — the HTTP driver doesn't reliably report
    // rowCount, and a silent false here would look like "already deleted".
    const r = await db.execute(sql`
      DELETE FROM bot_notes
       WHERE user_id = ${userId}::uuid AND lower(key) = lower(${key})
      RETURNING id`);
    return ((r.rows as any[]) ?? []).length > 0;
  },

  async deleteById(userId: string, id: string): Promise<boolean> {
    const r = await db.execute(sql`
      DELETE FROM bot_notes WHERE user_id = ${userId}::uuid AND id = ${id}::uuid
      RETURNING id`);
    return ((r.rows as any[]) ?? []).length > 0;
  },
};
