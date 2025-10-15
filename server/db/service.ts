import { eq, and, desc } from 'drizzle-orm';
import { db } from './connection';
import { users, subscriptions, firms, challenges, userState, payouts, sessions } from './schema';

// Type aliases for the original schema
type User = typeof users.$inferSelect;
type NewUser = typeof users.$inferInsert;
type Subscription = typeof subscriptions.$inferSelect;
type NewSubscription = typeof subscriptions.$inferInsert;
type PropFirm = typeof firms.$inferSelect;
type NewPropFirm = typeof firms.$inferInsert;
type Challenge = typeof challenges.$inferSelect;
type NewChallenge = typeof challenges.$inferInsert;
type UserState = typeof userState.$inferSelect;
type NewUserState = typeof userState.$inferInsert;
type Payout = typeof payouts.$inferSelect;
type NewPayout = typeof payouts.$inferInsert;
type Session = typeof sessions.$inferSelect;
type NewSession = typeof sessions.$inferInsert;

// User operations
export const userService = {
  async getById(id: string): Promise<User | null> {
    const result = await db.select().from(users).where(eq(users.id, id)).limit(1);
    return result[0] || null;
  },

  async getByEmail(email: string): Promise<User | null> {
    const result = await db.select().from(users).where(eq(users.email, email)).limit(1);
    return result[0] || null;
  },

  async create(userData: NewUser): Promise<User> {
    const result = await db.insert(users).values(userData).returning();
    return result[0];
  },

  async update(id: string, userData: Partial<NewUser>): Promise<User> {
    const result = await db
      .update(users)
      .set({ ...userData, updatedAt: new Date() })
      .where(eq(users.id, id))
      .returning();
    return result[0];
  },

  async delete(id: string): Promise<void> {
    await db.delete(users).where(eq(users.id, id));
  },
};

// Session operations
export const sessionService = {
  async getByTokenHash(tokenHash: string): Promise<Session | null> {
    const result = await db.select().from(sessions).where(eq(sessions.sessionToken, tokenHash)).limit(1);
    return result[0] || null;
  },
  async create(userId: string, data: Omit<NewSession, 'userId'>): Promise<Session> {
    const result = await db.insert(sessions).values({ ...data, userId }).returning();
    return result[0];
  },
  async deleteByTokenHash(tokenHash: string): Promise<void> {
    await db.delete(sessions).where(eq(sessions.sessionToken, tokenHash));
  },
};

// Subscription operations
export const subscriptionService = {
  async getByUserId(userId: string): Promise<Subscription | null> {
    const result = await db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.userId, userId))
      .limit(1);
    return result[0] || null;
  },

  async create(subData: NewSubscription): Promise<Subscription> {
    const result = await db.insert(subscriptions).values(subData).returning();
    return result[0];
  },

  async update(userId: string, subData: Partial<NewSubscription>): Promise<Subscription> {
    const result = await db
      .update(subscriptions)
      .set({ ...subData, updatedAt: new Date() })
      .where(eq(subscriptions.userId, userId))
      .returning();
    return result[0];
  },

  async upsert(userId: string, subData: Partial<NewSubscription>): Promise<Subscription> {
    const existing = await this.getByUserId(userId);
    if (existing) {
      return this.update(userId, subData);
    } else {
      return this.create({ ...subData, userId } as NewSubscription);
    }
  },
};

// Prop firm operations
export const propFirmService = {
  async getByUserId(userId: string): Promise<PropFirm[]> {
    return db
      .select()
      .from(firms)
      .where(eq(firms.userId, userId))
      .orderBy(desc(firms.createdAt));
  },

  async getById(id: string): Promise<PropFirm | null> {
    const result = await db.select().from(firms).where(eq(firms.id, id)).limit(1);
    return result[0] || null;
  },

  async create(userId: string, firmData: Omit<NewPropFirm, 'userId'>): Promise<PropFirm> {
    const result = await db
      .insert(firms)
      .values({ ...firmData, userId })
      .returning();
    return result[0];
  },

  async update(id: string, firmData: Partial<NewPropFirm>): Promise<PropFirm> {
    const result = await db
      .update(firms)
      .set({ ...firmData })
      .where(eq(firms.id, id))
      .returning();
    return result[0];
  },

  async delete(id: string): Promise<void> {
    await db.delete(firms).where(eq(firms.id, id));
  },
};

// Challenge operations
export const challengeService = {
  async getByUserId(userId: string): Promise<Challenge[]> {
    return db
      .select()
      .from(challenges)
      .where(eq(challenges.userId, userId))
      .orderBy(desc(challenges.createdAt));
  },

  async getById(id: string): Promise<Challenge | null> {
    const result = await db.select().from(challenges).where(eq(challenges.id, id)).limit(1);
    return result[0] || null;
  },

  async create(userId: string, challengeData: Omit<NewChallenge, 'userId'>): Promise<Challenge> {
    const result = await db
      .insert(challenges)
      .values({ ...challengeData, userId })
      .returning();
    return result[0];
  },

  async update(id: string, challengeData: Partial<NewChallenge>): Promise<Challenge> {
    const result = await db
      .update(challenges)
      .set({ ...challengeData, updatedAt: new Date() })
      .where(eq(challenges.id, id))
      .returning();
    return result[0];
  },

  async delete(id: string): Promise<void> {
    await db.delete(challenges).where(eq(challenges.id, id));
  },

  async getByFirmId(userId: string, firmId: string): Promise<Challenge[]> {
    return db
      .select()
      .from(challenges)
      .where(and(eq(challenges.userId, userId), eq(challenges.firmId, firmId)))
      .orderBy(desc(challenges.createdAt));
  },
};

// Payout operations
export const payoutService = {
  async getByUserId(userId: string): Promise<Payout[]> {
    return db.select().from(payouts).where(eq(payouts.userId, userId)).orderBy(desc(payouts.date));
  },
  async getByChallengeId(challengeId: string): Promise<Payout[]> {
    return db.select().from(payouts).where(eq(payouts.challengeId, challengeId)).orderBy(desc(payouts.date));
  },
  async create(userId: string, data: Omit<NewPayout, 'userId'>): Promise<Payout> {
    const result = await db.insert(payouts).values({ ...data, userId }).returning();
    return result[0];
  },
  async delete(id: string): Promise<void> {
    await db.delete(payouts).where(eq(payouts.id, id));
  },
};

// User state operations
export const userStateService = {
  async getByUserId(userId: string): Promise<UserState | null> {
    const result = await db
      .select()
      .from(userState)
      .where(eq(userState.userId, userId))
      .limit(1);
    return result[0] || null;
  },

  async create(userId: string, stateData: Omit<NewUserState, 'userId'>): Promise<UserState> {
    const result = await db
      .insert(userState)
      .values({ ...stateData, userId })
      .returning();
    return result[0];
  },

  async update(userId: string, stateData: Partial<NewUserState>): Promise<UserState> {
    const result = await db
      .update(userState)
      .set({ ...stateData })
      .where(eq(userState.userId, userId))
      .returning();
    return result[0];
  },

  async upsert(userId: string, stateData: Partial<NewUserState>): Promise<UserState> {
    const existing = await this.getByUserId(userId);
    if (existing) {
      return this.update(userId, stateData);
    } else {
      return this.create(userId, stateData as Omit<NewUserState, 'userId'>);
    }
  },
};

// Combined operations for dashboard
export const dashboardService = {
  async getUserData(userId: string) {
    console.log('📊 Dashboard service loading data for user:', userId);
    const [user, subscription, firms, userChallenges, state] = await Promise.all([
      userService.getById(userId),
      subscriptionService.getByUserId(userId),
      propFirmService.getByUserId(userId),
      challengeService.getByUserId(userId),
      userStateService.getByUserId(userId),
    ]);
    
    console.log('📊 Database query results:');
    console.log('  User:', user);
    console.log('  Subscription:', subscription);
    console.log('  Firms:', firms);
    console.log('  Challenges:', userChallenges);
    console.log('  State:', state);

    return {
      user,
      subscription,
      firms,
      challenges: userChallenges,
      selectedFirmId: state?.selectedFirmId || null,
    };
  },

  async updateSelectedFirm(userId: string, firmId: string | null): Promise<void> {
    await userStateService.upsert(userId, { selectedFirmId: firmId });
  },
};
