/**
 * actionLog — the undo journal.
 *
 * Kept in its own module deliberately. Both cascadeService and tradeService
 * need to write journal entries, and stateService (which reads them and
 * performs the reversals) imports CascadeError from cascadeService. Putting the
 * writer in stateService would create an import cycle:
 *
 *   cascadeService → stateService → cascadeService
 *
 * This module depends on nothing but the transaction type, so everyone can
 * import it safely.
 */

import { randomUUID } from 'crypto';
import type { TxClient } from './txConnection';

/**
 * Record what an action did and how to reverse it.
 *
 * MUST be called inside the cascade's own transaction, so the journal entry
 * commits or rolls back with the change it describes. A journal that can
 * disagree with reality is worse than no journal.
 */
export async function logAction(
  tx: TxClient,
  userId: string,
  action: string,
  summary: string,
  undoData: unknown,
): Promise<string> {
  const id = randomUUID();
  await tx.query(`
    INSERT INTO action_log (id, user_id, action, summary, undo_data, created_at)
    VALUES ($1,$2,$3,$4,$5::jsonb,NOW())`,
    [id, userId, action, summary, JSON.stringify(undoData)]);
  return id;
}
