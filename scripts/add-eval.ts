#!/usr/bin/env -S npx tsx
/**
 * add-eval — buy a prop-firm eval from the CLI.
 *
 * Thin wrapper around the app's cascade service (cascadeService.buyEval),
 * the exact same code path the website and the Telegram bot API use.
 * Nothing is duplicated here, so the CLI and the web app can never drift apart.
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
 * --rules "<r1>;<r2>" sets the account's rules (prompted when omitted) — the Rule
 * Calendar has nothing to check without them.
 * --cfd marks this as a CFD firm. This matters: on CFD firms a daily-DD breach
 * LOSES the account, while on futures it's only a lockout until the next session.
 * Defaults to futures.
 *
 * Spawns ALL FOUR surfaces in ONE transaction (single source of truth):
 *   1. challenge row            (Prop Firm Dashboard)
 *   2. trading account card     (Accounts tab)
 *   3. budget expense           (Budget tab, tagged isPropFirm + balance deducted)
 *   4. rule calendar account     (Rule Calendar, linked to the challenge)
 */
import 'dotenv/config';
import { createInterface } from 'readline';
import { buyEval, CascadeError } from '../server/db/cascadeService';

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
let rulesArg = extractFlag(argv, '--rules');
// Market type decides what a daily-DD breach MEANS: futures = session lockout
// (account survives), CFD = account lost. Defaults to futures.
const cfdFlagIdx = argv.indexOf('--cfd');
if (cfdFlagIdx !== -1) argv.splice(cfdFlagIdx, 1);
const firmType = cfdFlagIdx !== -1 ? 'cfd' : 'futures';

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

  // Rules are the whole point of the Rule Calendar — an account with none is
  // dead weight there. Prompt when they weren't supplied.
  if (!rulesArg && process.stdin.isTTY) {
    rulesArg = await ask('Rules for this account (semicolon-separated, blank to skip): ');
  }
  const rules = (rulesArg || '').split(';').map((r) => r.trim()).filter(Boolean);
  if (rules.length === 0) {
    console.warn('WARNING: no rules set for this account. The Rule Calendar will have nothing to check against.');
  }

  if (cost > 0 && !budgetAccountId) {
    throw new CascadeError('budgetAccountId is required when cost > 0 — which account paid?', 'no_funding_source');
  }

  const result = await buyEval({
    userId: USER_ID,
    firmName,
    brokerName: brokerName || 'Trading Account',
    accountSize,
    cost,
    accountFirst4: undefined, // CLI doesn't collect first4; set it via the API later
    accountLast4: last4 || '',
    evalType: evalTypeArg || undefined,
    firmType: firmType as 'futures' | 'cfd',
    maxDrawdown: maxDDStr ? Number(maxDDStr) : 0,
    dailyDrawdown: dailyDDStr ? Number(dailyDDStr) : 0,
    riskPerTrade: riskStr ? Number(riskStr) : 0,
    rules,
    budgetAccountId: budgetAccountId || undefined,
    totalPhases: Number(totalPhasesStr) || 3,
  });

  const sizeK = Math.round(accountSize / 1000);
  console.log('Eval purchase created — all surfaces (one transaction):');
  console.log(`  Challenge:      ${firmName} ${sizeK}K @ $${cost}${evalTypeArg ? ` [${evalTypeArg}]` : ''} (${result.challengeId})`);
  console.log(`  Account card:   ${result.label} (${result.accountId})`);
  console.log(`  Budget expense: $${cost} from ${budgetAccountId || 'acc_sofi'} (isPropFirm)`);
  console.log(`  Rule calendar:  linked (${result.calendarAccountId})`);
  if (result.warnings.length) {
    console.log(`  Warnings:`);
    result.warnings.forEach((w) => console.log(`    - ${w}`));
  }
}

main().catch((e) => {
  if (e instanceof CascadeError) {
    console.error(`Error: ${e.message} (code: ${e.code})`);
  } else {
    console.error('Error:', e.message);
  }
  process.exit(1);
});
