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
  accountSize: integer('account_size').notNull(),
  startDate: text('start_date').notNull(), // YYYY-MM-DD format
  cost: decimal('cost', { precision: 10, scale: 2 }).notNull(),
  strategy: text('strategy'),
  totalPhases: integer('total_phases').default(3).notNull(),
  phase1Completed: boolean('phase1_completed').default(false),
  phase1CompletedAt: timestamp('phase1_completed_at'),
  phase2Completed: boolean('phase2_completed').default(false),
  phase2CompletedAt: timestamp('phase2_completed_at'),
  phase3Completed: boolean('phase3_completed').default(false),
  phase3CompletedAt: timestamp('phase3_completed_at'),
  status: text('status').default('active'), // 'active', 'passed', 'failed'
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
