/**
 * correctPlan — fix a mistyped plan on an existing account.
 * =========================================================
 *
 * Daniel told the trading bot he'd bought a Lucid Flex when it was actually a
 * Lucid Daily. There was no way to correct that through the API, so a dead
 * eval's $101.60 was polluting Lucid Flex's stats.
 *
 * Why this needs its own action rather than the generic PUT:
 *
 *   - it must update BOTH the account card and the challenge, or the two
 *     disagree and the Dashboard/Accounts split reappears
 *   - it must work on DEAD accounts (the whole point is fixing history)
 *   - it must re-resolve drawdown_style from the plan_rules catalogue, because
 *     the old plan's style is now wrong for this account
 *   - it must be journalled so it can be undone
 *
 * What it deliberately does NOT do: change lifecycle, cost, balance, size, or
 * anything about money. This corrects a LABEL and the rules that follow from
 * it. Nothing else.
 */
import { withTransaction, type TxClient } from './txConnection';
import { CascadeError } from './cascadeService';
import { logAction } from './actionLog';

export interface CorrectPlanResult {
  label: string;
  firm: string;
  wasPlan: string;
  nowPlan: string;
  accountSize: number;
  drawdownStyle: string | null;
  styleSource: 'catalogue' | 'unknown';
  lifecycle: string;
  warnings: string[];
}

export async function correctPlan(input: {
  userId: string;
  accountRef: string;
  evalType: string;
  /** Also correct the firm, if that was wrong too. */
  firmName?: string;
}): Promise<CorrectPlanResult> {
  const { userId } = input;
  const ref = String(input.accountRef || '').trim();
  const newPlan = String(input.evalType || '').trim();
  if (!ref) throw new CascadeError('No account reference given', 'no_ref');
  if (!newPlan) throw new CascadeError('No plan name given', 'no_plan');

  return withTransaction(async (tx: TxClient) => {
    // Deliberately NOT filtered by status='active' — correcting a dead eval's
    // label is the main use case.
    const parts = ref.includes('-') ? ref.split('-') : null;
    const pf = parts && parts.length === 2 ? parts[0] : null;
    const pl = parts && parts.length === 2 ? parts[1] : null;

    const { rows } = await tx.query(`
      SELECT ta.id, ta.display_label, ta.firm, ta.eval_type, ta.account_size, ta.status,
             ch.id AS challenge_id, ch.eval_type AS ch_eval_type, ch.lifecycle
        FROM trading_accounts ta
        LEFT JOIN challenges ch ON ch.account_id = ta.id
       WHERE ta.user_id = $1
         AND ( lower(ta.nickname) = lower($2)
               OR ta.display_label = $2
               OR ta.account_number_last4 = $2
               OR upper(ta.account_first4) = upper($2)
               OR ($3::text IS NOT NULL
                   AND upper(ta.account_first4) = upper($3)
                   AND ta.account_number_last4 = $4) )`,
      [userId, ref, pf, pl]);

    if (rows.length === 0) {
      throw new CascadeError(`No account matching "${ref}" (active or closed)`, 'not_found');
    }
    if (rows.length > 1) {
      throw new CascadeError(
        `"${ref}" matches ${rows.length} accounts (${rows.map(r => r.display_label).join(', ')}). Say which one.`,
        'ambiguous');
    }

    const a = rows[0];
    const wasPlan = String(a.eval_type ?? '');
    const firm = String(input.firmName ?? a.firm ?? '');
    const size = Number(a.account_size) || 0;
    const warnings: string[] = [];

    if (wasPlan === newPlan && firm === String(a.firm ?? '')) {
      warnings.push(`${a.display_label} was already "${newPlan}" — nothing to change.`);
    }

    // Re-resolve the drawdown style for the NEW plan, merging generic then
    // size-specific rows exactly like getPlanRule does.
    const { rows: ruleRows } = await tx.query(`
      SELECT drawdown_style, account_size
        FROM plan_rules
       WHERE user_id = $1 AND lower(firm_name) = lower($2) AND lower(eval_type) = lower($3)
         AND (account_size IS NULL OR account_size = $4)
         AND stage IN ('any', 'eval', 'funded')
       ORDER BY (account_size IS NULL) DESC`,
      [userId, firm, newPlan, size || null]);

    let style: string | null = null;
    for (const r of ruleRows) if (r.drawdown_style) style = r.drawdown_style;

    if (!style) {
      warnings.push(
        `No drawdown style recorded for ${firm} "${newPlan}"${size ? ` ${size / 1000}K` : ''}. ` +
        `Left as-is — tell me the style and I'll store it with set-plan-rule.`);
    }

    await tx.query(`
      UPDATE trading_accounts
         SET eval_type = $2, firm = $3,
             drawdown_style = COALESCE($4, drawdown_style),
             updated_at = NOW()
       WHERE id = $1`, [a.id, newPlan, firm, style]);

    if (a.challenge_id) {
      await tx.query(`
        UPDATE challenges SET eval_type = $2, updated_at = NOW() WHERE id = $1`,
        [a.challenge_id, newPlan]);
    } else {
      warnings.push(`${a.display_label} has no challenge row — only the card was updated.`);
    }

    await logAction(tx, userId, 'correct-plan',
      `${a.display_label}: plan "${wasPlan}" -> "${newPlan}"`,
      {
        accountId: a.id,
        challengeId: a.challenge_id,
        priorEvalType: wasPlan,
        priorFirm: a.firm,
        priorChEvalType: a.ch_eval_type,
      });

    return {
      label: String(a.display_label),
      firm,
      wasPlan,
      nowPlan: newPlan,
      accountSize: size,
      drawdownStyle: style,
      styleSource: style ? 'catalogue' : 'unknown',
      lifecycle: String(a.lifecycle ?? ''),
      warnings,
    };
  });
}
