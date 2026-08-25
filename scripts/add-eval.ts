#!/usr/bin/env -S npx tsx
/**
 * add-eval — buy a prop-firm eval from the CLI.
 *
 * This is a THIN WRAPPER. All logic lives in the app's own purchase service
 * (/root/Propfolio/server/db/purchaseService.ts), the exact same code path the
 * website uses. Nothing is duplicated here, so the CLI and the web app can
 * never drift apart.
 *
 * Usage:
 *   node add-eval.mjs "<firmName>" <accountSize> <cost> <totalPhases> <startDate> <strategy> ["<brokerName>"] [maxDD] [dailyDD] [riskPerTrade] [accountLast4] [budgetAccountId] [--eval-type "<type>"] [--lock-level <n>]
 * Example:
 *   node add-eval.mjs "Lucid Trading" 50000 89 1 2026-08-25 "EW" "Trading Account" 2000 1200 200 0044 acc_sofi --eval-type "Lucid Flex"
 *
 * --eval-type is the firm's PRODUCT variant (Builder, Flex, Daily, Rapid, Zero,
 * Select Flex...), not the phase count. It drives the drawdown ruleset, so it is
 * prompted for when omitted.
 * --lock-level overrides where the trailing max-DD floor freezes (default size + 100).
 *
 * Spawns ALL FOUR surfaces (single source of truth):
 *   1. challenge row            (Prop Firm Dashboard)
 *   2. trading account card     (Accounts tab)
 *   3. budget expense           (Budget tab, tagged isPropFirm + balance deducted)
 *   4. rule calendar account    (Rule Calendar, linked to the challenge)
 */
import 'dotenv/config';
import { createInterface } from 'readline';
import { purchaseEval } from '../server/db/purchaseService';

const USER_ID = '293080f9-a395-4482-9ec2-ad31bf105848';

/** Pull `--flag value` pairs out of argv so positionals keep their old order. */
function extractFlag(argv: string[], flag: string): string | undefined {
  const i = argv.indexOf(flag);
  if (i === -1) return undefined;
  const v = argv[i + 1];
  argv.splice(i, v !== undefined && !v.startsWith('--') ? 2 : 1);
  return v;
}

const argv = process.argv.slice(2);
let evalTypeArg = extractFlag(argv, '--eval-type');
const lockLevelArg = extractFlag(argv, '--lock-level');

const [firmName, accountSizeStr, costStr, totalPhasesStr, startDate, strategy, brokerName, maxDDStr, dailyDDStr, riskStr, last4, budgetAccountId] = argv;

if (!firmName || !accountSizeStr || !costStr) {
  console.error('Usage: node add-eval.mjs "<firmName>" <accountSize> <cost> <totalPhases> <startDate> <strategy> ["<brokerName>"] [maxDD] [dailyDD] [riskPerTrade] [accountLast4] [budgetAccountId] [--eval-type "<type>"] [--lock-level <n>]');
  process.exit(1);
}

function ask(q: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((res) => rl.question(q, (a) => { rl.close(); res(a.trim()); }));
}

async function main() {
  const accountSize = Math.max(0, Math.round(Number(accountSizeStr) || 0));
  const cost = Math.round((Number(costStr) || 0) * 100) / 100;

  // Eval type drives the DD ruleset — prompt rather than silently storing null.
  if (!evalTypeArg && process.stdin.isTTY) {
    evalTypeArg = await ask(`Eval type for ${firmName} ${Math.round(accountSize / 1000)}K (Builder / Flex / Daily / Rapid / Zero / other, blank to skip): `);
  }

  const result = await purchaseEval({
    userId: USER_ID,
    propFirmName: firmName,
    brokerName: brokerName || 'Trading Account',
    accountSize,
    cost,
    totalPhases: Number(totalPhasesStr) || 3,
    startDate: startDate || undefined,
    strategy: strategy || '',
    firmType: 'futures',
    accountLast4: last4 || null,
    maxDrawdown: maxDDStr ? Number(maxDDStr) : 0,
    dailyDrawdown: dailyDDStr ? Number(dailyDDStr) : 0,
    riskPerTrade: riskStr ? Number(riskStr) : 0,
    budgetAccountId: budgetAccountId || undefined,
    evalType: evalTypeArg || undefined,
    floorLockLevel: lockLevelArg ? Number(lockLevelArg) : undefined,
  } as any);

  const sizeK = Math.round(accountSize / 1000);
  console.log('Eval purchase created — all surfaces:');
  console.log(`  Challenge:     ${result.firmName} ${sizeK}K @ $${cost}${evalTypeArg ? ` [${evalTypeArg}]` : ''} (${result.challengeId})`);
  console.log(`  Account card:  ${last4 ? `Acct ${last4}` : `${result.firmName} ${sizeK}K`} (${result.accountId})`);
  console.log(`  Budget expense: $${cost} from ${budgetAccountId || 'acc_sofi'} (isPropFirm)`);
  console.log(`  Rule calendar:  ${result.calendarAccountId ? `linked (${result.calendarAccountId})` : 'skipped'}`);
}

main().catch((e) => { console.error('Error:', e.message); process.exit(1); });
