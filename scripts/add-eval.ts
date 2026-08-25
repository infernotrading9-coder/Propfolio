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
 *   node add-eval.mjs "<firmName>" <accountSize> <cost> <totalPhases> <startDate> <strategy> ["<brokerName>"] [maxDD] [dailyDD] [riskPerTrade] [accountLast4] [budgetAccountId]
 * Example:
 *   node add-eval.mjs "Lucid Trading" 50000 89 1 2026-08-25 "EW" "Trading Account" 2000 1200 200 0044 acc_sofi
 *
 * Spawns ALL FOUR surfaces (single source of truth):
 *   1. challenge row            (Prop Firm Dashboard)
 *   2. trading account card     (Accounts tab)
 *   3. budget expense           (Budget tab, tagged isPropFirm + balance deducted)
 *   4. rule calendar account    (Rule Calendar, linked to the challenge)
 */
import 'dotenv/config';
import { purchaseEval } from '../server/db/purchaseService';

const USER_ID = '293080f9-a395-4482-9ec2-ad31bf105848';

const [firmName, accountSizeStr, costStr, totalPhasesStr, startDate, strategy, brokerName, maxDDStr, dailyDDStr, riskStr, last4, budgetAccountId] = process.argv.slice(2);

if (!firmName || !accountSizeStr || !costStr) {
  console.error('Usage: node add-eval.mjs "<firmName>" <accountSize> <cost> <totalPhases> <startDate> <strategy> ["<brokerName>"] [maxDD] [dailyDD] [riskPerTrade] [accountLast4] [budgetAccountId]');
  process.exit(1);
}

async function main() {
  const accountSize = Math.max(0, Math.round(Number(accountSizeStr) || 0));
  const cost = Math.round((Number(costStr) || 0) * 100) / 100;

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
  });

  const sizeK = Math.round(accountSize / 1000);
  console.log('Eval purchase created — all surfaces:');
  console.log(`  Challenge:     ${result.firmName} ${sizeK}K @ $${cost} (${result.challengeId})`);
  console.log(`  Account card:  ${last4 ? `Acct ${last4}` : `${result.firmName} ${sizeK}K`} (${result.accountId})`);
  console.log(`  Budget expense: $${cost} from ${budgetAccountId || 'acc_sofi'} (isPropFirm)`);
  console.log(`  Rule calendar:  ${result.calendarAccountId ? `linked (${result.calendarAccountId})` : 'skipped'}`);
}

main().catch((e) => { console.error('Error:', e.message); process.exit(1); });
