# Personal Tab Multi-Account Support (Oct 11 2026)

## Background

Personal tab previously had no concept of "which account" a trade belonged to. All trades from the cockpit strategy logging and MCP trade logging went into `personal_trades` with no account identifier.

## Schema change

Added `account_name text DEFAULT 'NinjaTrader'` column to `personal_trades` (ALTER TABLE, no migration file — applied directly).

## Frontend

**PersonalTab.tsx** — account filter dropdown at the top of the tab:
- `setAccountFilter('all')` by default
- Unique `accountName` values are extracted from all trades: `[...new Set(trades.map(t => t.accountName || 'NinjaTrader'))]`
- `filteredTrades` memo applies the filter before stats computation and table rendering
- Dropdown rendered as a `<select>` element with "All Accounts" default plus each unique account name

**TradingModeCockpit.tsx** — when in Personal mode (`!propMode`), strategy logging now includes `accountName: selectedAccountId || 'NinjaTrader'` in the POST to `db-personal-trades`.

**db-personal-trades.ts** — `log-trade` action accepts `accountName: input.accountName || 'NinjaTrader'`

## Usage

- Group Leader posts trades with `accountName: 'NinjaTrader'` via MCP
- Cockpit strategy logging passes the selected personal account's nickname
- New personal accounts can be added by posting trades with a new `accountName` — the filter auto-populates

## Future

Daniel plans to trade crypto again and will need a "Crypto" personal account alongside NinjaTrader.