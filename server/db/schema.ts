import { pgTable, text, timestamp, integer, boolean, decimal, uuid } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

// Users table (matches existing structure)
export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull().unique(),
  name: text('name'),
  emailVerified: timestamp('email_verified'),
  hashedPassword: text('hashed_password'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Prop firms table (matches existing structure)
export const firms = pgTable('firms', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id).notNull(),
  name: text('name').notNull(),
  firmType: text('firm_type'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// Sessions table for DB-backed auth
export const sessions = pgTable('sessions', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id).notNull(),
  // store a hashed token (sha256) to avoid plain token in DB
  sessionToken: text('session_token').notNull().unique(),
  expiresAt: timestamp('expires_at').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// Subscriptions table (matches existing structure)
export const subscriptions = pgTable('subscriptions', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id).notNull().unique(),
  stripeCustomerId: text('stripe_customer_id'),
  stripeSubscriptionId: text('stripe_subscription_id'),
  stripePriceId: text('stripe_price_id'),
  status: text('status').notNull(), // 'active', 'canceled', 'incomplete', 'past_due', 'unpaid'
  plan: text('plan').notNull().default('free'), // 'free', 'pro', 'elite'
  currentPeriodStart: timestamp('current_period_start'),
  currentPeriodEnd: timestamp('current_period_end'),
  cancelAtPeriodEnd: boolean('cancel_at_period_end').default(false),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Challenges table (matches existing structure)
export const challenges = pgTable('challenges', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id).notNull(),
  firmId: uuid('firm_id').references(() => firms.id).notNull(),
  brokerName: text('broker_name').notNull(),
  purchaseGroupId: text('purchase_group_id'),
  purchaseGroupLabel: text('purchase_group_label'),
  purchaseGroupSize: integer('purchase_group_size'),
  purchaseGroupIndex: integer('purchase_group_index'),
  accountSize: integer('account_size').notNull(),
  startDate: text('start_date').notNull(), // YYYY-MM-DD format
  cost: decimal('cost', { precision: 10, scale: 2 }).notNull(),
  initialCost: decimal('initial_cost', { precision: 10, scale: 2 }).default('0').notNull(),
  hasActivationFee: boolean('has_activation_fee').default(false).notNull(),
  activationFeeAmount: decimal('activation_fee_amount', { precision: 10, scale: 2 }),
  strategy: text('strategy'),
  firmType: text('firm_type'),
  evalType: text('eval_type'),
  liveAccount: boolean('live_account').default(false),
  totalPhases: integer('total_phases').default(3).notNull(),
  phase1Completed: boolean('phase1_completed').default(false),
  phase1CompletedAt: timestamp('phase1_completed_at'),
  phase2Completed: boolean('phase2_completed').default(false),
  phase2CompletedAt: timestamp('phase2_completed_at'),
  phase3Completed: boolean('phase3_completed').default(false),
  phase3CompletedAt: timestamp('phase3_completed_at'),
  status: text('status').default('active'), // 'active', 'passed', 'failed'
  accountLast4: text('account_last4'), // last 4 digits of account number, links to Focus Hub
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Payouts table for withdrawn funds
export const payouts = pgTable('payouts', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id).notNull(),
  challengeId: uuid('challenge_id').references(() => challenges.id).notNull(),
  amount: decimal('amount', { precision: 12, scale: 2 }).notNull(),
  date: text('date').notNull(), // store as YYYY-MM-DD string
  description: text('description'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// Trading accounts table (migrated from Focus Hub blobs)
export const tradingAccounts = pgTable('trading_accounts', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id).notNull(),
  name: text('name').notNull(), // e.g. "Acct 0006"
  firm: text('firm').notNull(), // e.g. "Tradify", "Apex"
  accountNumberLast4: text('account_number_last4'), // last 4 digits
  accountSize: decimal('account_size', { precision: 12, scale: 2 }).notNull().default('0'),
  balance: decimal('balance', { precision: 12, scale: 2 }).notNull().default('0'),
  drawdownUsed: decimal('drawdown_used', { precision: 12, scale: 2 }).notNull().default('0'),
  highWaterMark: decimal('high_water_mark', { precision: 12, scale: 2 }).notNull().default('0'),
  maxDrawdown: decimal('max_drawdown', { precision: 12, scale: 2 }).default('0'),
  dailyDrawdown: decimal('daily_drawdown', { precision: 12, scale: 2 }).default('0'),
  riskPerTrade: decimal('risk_per_trade', { precision: 12, scale: 2 }).default('0'),
  rules: text('rules').array(), // array of rule strings
  notes: text('notes'),
  status: text('status').default('active'), // 'active', 'paused', 'failed', 'passed'
  phase: text('phase').default('challenge'), // 'challenge', 'funded', 'live'
  platform: text('platform'),
  groupName: text('group_name'),
  sortOrder: integer('sort_order').default(0),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Trades table - individual trade log
export const trades = pgTable('trades', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id).notNull(),
  accountId: uuid('account_id').references(() => tradingAccounts.id).notNull(),
  direction: text('direction'), // 'long' or 'short'
  instrument: text('instrument'), // e.g. "NQ", "ES", "CL"
  entryPrice: decimal('entry_price', { precision: 12, scale: 4 }),
  exitPrice: decimal('exit_price', { precision: 12, scale: 4 }),
  amount: decimal('amount', { precision: 12, scale: 2 }).notNull(), // P&L in dollars
  result: text('result').notNull(), // 'win' or 'loss'
  riskReward: decimal('risk_reward', { precision: 6, scale: 2 }), // e.g. 2.5 = 2.5R
  rulesFollowed: boolean('rules_followed').default(true),
  notes: text('notes'),
  tradeDate: timestamp('trade_date').defaultNow().notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// Daily account ordering - which accounts to trade first each day
export const accountDailyOrder = pgTable('account_daily_order', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id).notNull(),
  orderDate: text('order_date').notNull(), // YYYY-MM-DD
  orderedAccountIds: text('ordered_account_ids').array().notNull(), // array of trading_accounts IDs in priority order
  notes: text('notes'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// User state table for storing user preferences
export const userState = pgTable('user_state', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id).notNull().unique(),
  selectedFirmId: uuid('selected_firm_id').references(() => firms.id),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Relations
export const usersRelations = relations(users, ({ many, one }) => ({
  firms: many(firms),
  challenges: many(challenges),
  subscription: one(subscriptions),
  userState: one(userState),
}));

export const firmsRelations = relations(firms, ({ one, many }) => ({
  user: one(users, { fields: [firms.userId], references: [users.id] }),
  challenges: many(challenges),
}));

export const challengesRelations = relations(challenges, ({ one }) => ({
  user: one(users, { fields: [challenges.userId], references: [users.id] }),
  firm: one(firms, { fields: [challenges.firmId], references: [firms.id] }),
}));

export const payoutsRelations = relations(payouts, ({ one }) => ({
  user: one(users, { fields: [payouts.userId], references: [users.id] }),
  challenge: one(challenges, { fields: [payouts.challengeId], references: [challenges.id] }),
}));

export const sessionsRelations = relations(sessions, ({ one }) => ({
  user: one(users, { fields: [sessions.userId], references: [users.id] }),
}));

export const subscriptionsRelations = relations(subscriptions, ({ one }) => ({
  user: one(users, { fields: [subscriptions.userId], references: [users.id] }),
}));

export const userStateRelations = relations(userState, ({ one }) => ({
  user: one(users, { fields: [userState.userId], references: [users.id] }),
  selectedFirm: one(firms, { fields: [userState.selectedFirmId], references: [firms.id] }),
}));

// Export types
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Session = typeof sessions.$inferSelect;
export type NewSession = typeof sessions.$inferInsert;
export type Subscription = typeof subscriptions.$inferSelect;
export type NewSubscription = typeof subscriptions.$inferInsert;
export type PropFirm = typeof firms.$inferSelect;
export type NewPropFirm = typeof firms.$inferInsert;
export type Challenge = typeof challenges.$inferSelect;
export type NewChallenge = typeof challenges.$inferInsert;
export type Payout = typeof payouts.$inferSelect;
export type NewPayout = typeof payouts.$inferInsert;
export type UserState = typeof userState.$inferSelect;
export type NewUserState = typeof userState.$inferInsert;
export type TradingAccount = typeof tradingAccounts.$inferSelect;
export type NewTradingAccount = typeof tradingAccounts.$inferInsert;
export type Trade = typeof trades.$inferSelect;
export type NewTrade = typeof trades.$inferInsert;
export type AccountDailyOrder = typeof accountDailyOrder.$inferSelect;
export type NewAccountDailyOrder = typeof accountDailyOrder.$inferInsert;
