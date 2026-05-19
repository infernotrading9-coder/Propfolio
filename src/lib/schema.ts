import { pgTable, text, integer, decimal, boolean, timestamp, uuid } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

// Users table
export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull().unique(),
  name: text('name'),
  emailVerified: timestamp('email_verified'),
  hashedPassword: text('hashed_password'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Prop firms table
export const firms = pgTable('firms', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id).notNull(),
  name: text('name').notNull(),
  firmType: text('firm_type'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// Challenges table
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
  totalPhases: integer('total_phases').default(3).notNull(),
  phase1Completed: boolean('phase1_completed').default(false),
  phase1CompletedAt: timestamp('phase1_completed_at'),
  phase2Completed: boolean('phase2_completed').default(false),
  phase2CompletedAt: timestamp('phase2_completed_at'),
  phase3Completed: boolean('phase3_completed').default(false),
  phase3CompletedAt: timestamp('phase3_completed_at'),
  status: text('status').default('active'), // 'active', 'passed', 'failed' - optional for backwards compatibility
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Payouts table
export const payouts = pgTable('payouts', {
  id: uuid('id').primaryKey().defaultRandom(),
  challengeId: uuid('challenge_id').references(() => challenges.id).notNull(),
  amount: decimal('amount', { precision: 10, scale: 2 }).notNull(),
  date: text('date').notNull(), // YYYY-MM-DD format
  description: text('description'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// Monthly PnL table
export const monthlyPnL = pgTable('monthly_pnl', {
  id: uuid('id').primaryKey().defaultRandom(),
  challengeId: uuid('challenge_id').references(() => challenges.id).notNull(),
  month: text('month').notNull(), // YYYY-MM format
  amount: decimal('amount', { precision: 10, scale: 2 }).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Weekly PnL table  
export const weeklyPnL = pgTable('weekly_pnl', {
  id: uuid('id').primaryKey().defaultRandom(),
  challengeId: uuid('challenge_id').references(() => challenges.id).notNull(),
  week: text('week').notNull(), // YYYY-WW format
  amount: decimal('amount', { precision: 10, scale: 2 }).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Relations
export const usersRelations = relations(users, ({ many }) => ({
  firms: many(firms),
  challenges: many(challenges),
}));

export const firmsRelations = relations(firms, ({ one, many }) => ({
  user: one(users, { fields: [firms.userId], references: [users.id] }),
  challenges: many(challenges),
}));

export const challengesRelations = relations(challenges, ({ one, many }) => ({
  user: one(users, { fields: [challenges.userId], references: [users.id] }),
  firm: one(firms, { fields: [challenges.firmId], references: [firms.id] }),
  payouts: many(payouts),
  monthlyPnL: many(monthlyPnL),
  weeklyPnL: many(weeklyPnL),
}));

export const payoutsRelations = relations(payouts, ({ one }) => ({
  challenge: one(challenges, { fields: [payouts.challengeId], references: [challenges.id] }),
}));

export const monthlyPnLRelations = relations(monthlyPnL, ({ one }) => ({
  challenge: one(challenges, { fields: [monthlyPnL.challengeId], references: [challenges.id] }),
}));

export const weeklyPnLRelations = relations(weeklyPnL, ({ one }) => ({
  challenge: one(challenges, { fields: [weeklyPnL.challengeId], references: [challenges.id] }),
}));

// User state table for storing user preferences
export const userState = pgTable('user_state', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id).notNull().unique(),
  selectedFirmId: uuid('selected_firm_id').references(() => firms.id),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const userStateRelations = relations(userState, ({ one }) => ({
  user: one(users, { fields: [userState.userId], references: [users.id] }),
  selectedFirm: one(firms, { fields: [userState.selectedFirmId], references: [firms.id] }),
}));

// Subscriptions table for Stripe integration
export const subscriptions = pgTable('subscriptions', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id).notNull().unique(),
  stripeCustomerId: text('stripe_customer_id').notNull(),
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

// User limits based on subscription
export const userLimits = pgTable('user_limits', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id).notNull().unique(),
  maxChallenges: integer('max_challenges').default(3), // Free: 3, Pro: unlimited (-1)
  canExportData: boolean('can_export_data').default(false),
  canShareStats: boolean('can_share_stats').default(true), // Basic sharing for free
  canSharePremium: boolean('can_share_premium').default(false), // Yearly/monthly views
  hasAdvancedAnalytics: boolean('has_advanced_analytics').default(false),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Subscription relations
export const subscriptionsRelations = relations(subscriptions, ({ one }) => ({
  user: one(users, { fields: [subscriptions.userId], references: [users.id] }),
}));

export const userLimitsRelations = relations(userLimits, ({ one }) => ({
  user: one(users, { fields: [userLimits.userId], references: [users.id] }),
}));

// Update users relations to include subscriptions
export const usersRelationsUpdated = relations(users, ({ many, one }) => ({
  firms: many(firms),
  challenges: many(challenges),
  subscription: one(subscriptions),
  limits: one(userLimits),
}));
