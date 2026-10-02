import type { Handler } from '@netlify/functions';
import { json, getUserFromSession } from './_utils';
import { planNoteService, PLAN_NOTE_HORIZONS } from '../../server/db/service';

const MAX_TITLE = 200;
const MAX_BODY = 20000;

const isHorizon = (v: any): boolean =>
  typeof v === 'string' && (PLAN_NOTE_HORIZONS as readonly string[]).includes(v);

/**
 * Diary / plan notes — Daniel's short, mid and long-term planning board.
 *
 * Notes are user-authored text with no link to accounts or challenges, so a
 * note outlives any account that gets archived or failed.
 */
export const handler: Handler = async (event) => {
  try {
    const user = await getUserFromSession(event);
    if (!user) return json(401, { error: 'Unauthorized' });

    if (event.httpMethod === 'GET') {
      const params = event.queryStringParameters || {};
      // ?action=list-notes (default) — the only read shape today.
      if (params.action && params.action !== 'list-notes') {
        return json(400, { error: `Unknown action "${params.action}". Use: list-notes` });
      }
      const notes = await planNoteService.listByUser(user.id);
      return json(200, { notes });
    }

    if (event.httpMethod === 'POST') {
      const input = JSON.parse(event.body || '{}');

      // ── create-note ────────────────────────────────────────────────────────
      if (input.action === 'create-note') {
        if (!isHorizon(input.horizon)) {
          return json(400, {
            error: `horizon must be one of: ${PLAN_NOTE_HORIZONS.join(', ')}`,
            code: 'bad_horizon',
          });
        }
        const title = typeof input.title === 'string' ? input.title.trim() : '';
        if (!title) return json(400, { error: 'title required', code: 'no_title' });
        if (title.length > MAX_TITLE) {
          return json(400, { error: `title too long (max ${MAX_TITLE})`, code: 'title_too_long' });
        }
        if (input.body != null && String(input.body).length > MAX_BODY) {
          return json(400, { error: `body too long (max ${MAX_BODY})`, code: 'body_too_long' });
        }

        // A step must point at a goal that actually exists and is Daniel's own.
        const parentId = input.parentId ? String(input.parentId) : null;
        if (parentId) {
          const parent = await planNoteService.getById(user.id, parentId);
          if (!parent) {
            return json(404, { error: `Parent note ${parentId} not found`, code: 'no_parent' });
          }
        }

        const note = await planNoteService.create(user.id, {
          horizon: input.horizon,
          title,
          body: input.body ?? '',
          priority: Number.isFinite(Number(input.priority)) ? Math.trunc(Number(input.priority)) : 0,
          parentId,
          sortOrder: Number.isFinite(Number(input.sortOrder)) ? Math.trunc(Number(input.sortOrder)) : 0,
        });
        return json(200, { note });
      }

      // ── update-note ────────────────────────────────────────────────────────
      // Partial: send only what changed. The checkbox sends {completed} alone
      // and must not wipe the body.
      if (input.action === 'update-note') {
        if (!input.id) return json(400, { error: 'id required', code: 'no_id' });

        if (input.horizon !== undefined && !isHorizon(input.horizon)) {
          return json(400, {
            error: `horizon must be one of: ${PLAN_NOTE_HORIZONS.join(', ')}`,
            code: 'bad_horizon',
          });
        }
        if (input.title !== undefined) {
          const t = typeof input.title === 'string' ? input.title.trim() : '';
          if (!t) return json(400, { error: 'title cannot be empty', code: 'no_title' });
          if (t.length > MAX_TITLE) {
            return json(400, { error: `title too long (max ${MAX_TITLE})`, code: 'title_too_long' });
          }
        }

        // Re-parenting needs both existence and a cycle check.
        let parentId: string | null | undefined;
        if (input.parentId !== undefined) {
          parentId = input.parentId === null || input.parentId === '' ? null : String(input.parentId);
          if (parentId) {
            const parent = await planNoteService.getById(user.id, parentId);
            if (!parent) {
              return json(404, { error: `Parent note ${parentId} not found`, code: 'no_parent' });
            }
            if (await planNoteService.wouldCreateCycle(user.id, String(input.id), parentId)) {
              return json(400, {
                error: 'That would link a note to itself or to one of its own steps — which would hide both.',
                code: 'cycle',
              });
            }
          }
        }

        const note = await planNoteService.update(user.id, String(input.id), {
          horizon: input.horizon,
          title: input.title !== undefined ? String(input.title).trim() : undefined,
          body: input.body,
          priority: input.priority !== undefined
            ? (Number.isFinite(Number(input.priority)) ? Math.trunc(Number(input.priority)) : 0)
            : undefined,
          sortOrder: input.sortOrder !== undefined
            ? (Number.isFinite(Number(input.sortOrder)) ? Math.trunc(Number(input.sortOrder)) : 0)
            : undefined,
          parentId,
          completed: input.completed !== undefined ? !!input.completed : undefined,
        });
        if (!note) return json(404, { error: 'Note not found', code: 'not_found' });
        return json(200, { note });
      }

      // ── delete-note ────────────────────────────────────────────────────────
      if (input.action === 'delete-note') {
        if (!input.id) return json(400, { error: 'id required', code: 'no_id' });
        const ok = await planNoteService.delete(user.id, String(input.id));
        if (!ok) return json(404, { error: 'Note not found', code: 'not_found' });
        return json(200, { deleted: true, id: String(input.id) });
      }

      return json(400, {
        error: 'Invalid action. Use: create-note, update-note, delete-note',
      });
    }

    return json(405, { error: 'Method Not Allowed' });
  } catch (e) {
    console.error('db-notes error', e);
    return json(500, { error: 'Internal Server Error' });
  }
};
