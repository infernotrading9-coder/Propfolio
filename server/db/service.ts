import { eq, and, desc, asc } from 'drizzle-orm';
import { db } from './connection';
import { users, subscriptions, firms, challenges, userState, payouts, sessions, tradingAccounts, trades, accountDailyOrder } from './schema';

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
type TradingAccount = typeof tradingAccounts.$inferSelect;
type NewTradingAccount = typeof tradingAccounts.$inferInsert;
type Trade = typeof trades.$inferSelect;
type NewTrade = typeof trades.$inferInsert;
type AccountDailyOrder = typeof accountDailyOrder.$inferSelect;
type NewAccountDailyOrder = typeof accountDailyOrder.$inferInsert;

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

// Trading account operations
export const tradingAccountService = {
  async getByUserId(userId: string): Promise<TradingAccount[]> {
    return db
      .select()
      .from(tradingAccounts)
      .where(eq(tradingAccounts.userId, userId))
      .orderBy(asc(tradingAccounts.sortOrder), desc(tradingAccounts.createdAt));
  },

  async getById(id: string): Promise<TradingAccount | null> {
    const result = await db.select().from(tradingAccounts).where(eq(tradingAccounts.id, id)).limit(1);
    return result[0] || null;
  },

  async create(userId: string, data: Omit<NewTradingAccount, 'userId'>): Promise<TradingAccount> {
    const result = await db.insert(tradingAccounts).values({ ...data, userId }).returning();
    return result[0];
  },

  async update(id: string, data: Partial<NewTradingAccount>): Promise<TradingAccount> {
    const result = await db
      .update(tradingAccounts)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(tradingAccounts.id, id))
      .returning();
    return result[0];
  },

  async delete(id: string): Promise<void> {
    await db.delete(tradingAccounts).where(eq(tradingAccounts.id, id));
  },

  async updateBalance(id: string, balance: number, drawdownUsed: number, highWaterMark: number): Promise<TradingAccount> {
    return this.update(id, { 
      balance: String(balance), 
      drawdownUsed: String(drawdownUsed), 
      highWaterMark: String(highWaterMark) 
    } as any);
  },

  async reorder(userId: string, orderedIds: string[]): Promise<void> {
    for (let i = 0; i < orderedIds.length; i++) {
      await db
        .update(tradingAccounts)
        .set({ sortOrder: i, updatedAt: new Date() })
        .where(and(eq(tradingAccounts.id, orderedIds[i]), eq(tradingAccounts.userId, userId)));
    }
  },
};

// Trade operations
export const tradeService = {
  async getByUserId(userId: string, limit?: number): Promise<Trade[]> {
    if (limit) {
      return db.select().from(trades).where(eq(trades.userId, userId)).orderBy(desc(trades.tradeDate)).limit(limit);
    }
    return db.select().from(trades).where(eq(trades.userId, userId)).orderBy(desc(trades.tradeDate));
  },

  async getByAccountId(accountId: string): Promise<Trade[]> {
    return db.select().from(trades).where(eq(trades.accountId, accountId)).orderBy(desc(trades.tradeDate));
  },

  async create(userId: string, data: Omit<NewTrade, 'userId'>): Promise<Trade> {
    const result = await db.insert(trades).values({ ...data, userId }).returning();
    return result[0];
  },

  async delete(id: string): Promise<void> {
    await db.delete(trades).where(eq(trades.id, id));
  },

  async getStats(userId: string): Promise<{
    totalTrades: number;
    wins: number;
    losses: number;
    winRate: number;
    totalPnL: number;
    avgRR: number;
    avgWin: number;
    avgLoss: number;
    bestTrade: number;
    worstTrade: number;
    behaviorStats: { behavior: string; count: number; wins: number; losses: number; winRate: number; totalPnL: number }[];
    ruleCompliance: { rule: string; total: number; broken: number; complianceRate: number }[];
  }> {
    const allTrades = await db.select().from(trades).where(eq(trades.userId, userId));
    const wins = allTrades.filter(t => t.result === 'win');
    const losses = allTrades.filter(t => t.result === 'loss');
    const totalPnL = allTrades.reduce((sum, t) => sum + parseFloat(String(t.amount)), 0);
    const rrValues = allTrades.filter(t => t.riskReward).map(t => parseFloat(String(t.riskReward)));
    const winAmounts = wins.map(t => parseFloat(String(t.amount)));
    const lossAmounts = losses.map(t => parseFloat(String(t.amount)));

    // Behavior stats
    const behaviorMap = new Map<string, { count: number; wins: number; losses: number; pnl: number }>();
    for (const t of allTrades) {
      const behaviors = (t.behaviors as string[]) || [];
      for (const b of behaviors) {
        if (!behaviorMap.has(b)) behaviorMap.set(b, { count: 0, wins: 0, losses: 0, pnl: 0 });
        const s = behaviorMap.get(b)!;
        s.count++;
        if (t.result === 'win') s.wins++; else s.losses++;
        s.pnl += parseFloat(String(t.amount));
      }
    }
    const behaviorStats = Array.from(behaviorMap.entries()).map(([behavior, s]) => ({
      behavior,
      count: s.count,
      wins: s.wins,
      losses: s.losses,
      winRate: s.count > 0 ? (s.wins / s.count) * 100 : 0,
      totalPnL: s.pnl,
    })).sort((a, b) => b.count - a.count);

    // Rule compliance stats
    const ruleMap = new Map<string, { total: number; broken: number }>();
    for (const t of allTrades) {
      const broken = (t.rulesBroken as string[]) || [];
      for (const r of broken) {
        if (!ruleMap.has(r)) ruleMap.set(r, { total: 0, broken: 0 });
        const s = ruleMap.get(r)!;
        s.total++;
        s.broken++;
      }
    }
    const ruleCompliance = Array.from(ruleMap.entries()).map(([rule, s]) => ({
      rule,
      total: s.total,
      broken: s.broken,
      complianceRate: 0, // will be filled in below
    }));
    // Also count total trades where rules were checked
    const totalRulesChecked = allTrades.length;
    for (const rc of ruleCompliance) {
      rc.complianceRate = totalRulesChecked > 0 ? ((totalRulesChecked - rc.broken) / totalRulesChecked) * 100 : 100;
    }

    return {
      totalTrades: allTrades.length,
      wins: wins.length,
      losses: losses.length,
      winRate: allTrades.length > 0 ? (wins.length / allTrades.length) * 100 : 0,
      totalPnL,
      avgRR: rrValues.length > 0 ? rrValues.reduce((a, b) => a + b, 0) / rrValues.length : 0,
      avgWin: winAmounts.length > 0 ? winAmounts.reduce((a, b) => a + b, 0) / winAmounts.length : 0,
      avgLoss: lossAmounts.length > 0 ? lossAmounts.reduce((a, b) => a + b, 0) / lossAmounts.length : 0,
      bestTrade: winAmounts.length > 0 ? Math.max(...winAmounts) : 0,
      worstTrade: lossAmounts.length > 0 ? Math.min(...lossAmounts) : 0,
      behaviorStats,
      ruleCompliance,
    };
  },
};

// Daily account order operations
export const accountDailyOrderService = {
  async getByDate(userId: string, date: string): Promise<AccountDailyOrder | null> {
    const result = await db
      .select()
      .from(accountDailyOrder)
      .where(and(eq(accountDailyOrder.userId, userId), eq(accountDailyOrder.orderDate, date)))
      .limit(1);
    return result[0] || null;
  },

  async getByUserId(userId: string): Promise<AccountDailyOrder[]> {
    return db
      .select()
      .from(accountDailyOrder)
      .where(eq(accountDailyOrder.userId, userId))
      .orderBy(desc(accountDailyOrder.orderDate));
  },

  async upsert(userId: string, data: { orderDate: string; orderedAccountIds: string[]; notes?: string }): Promise<AccountDailyOrder> {
    const existing = await this.getByDate(userId, data.orderDate);
    if (existing) {
      const result = await db
        .update(accountDailyOrder)
        .set({ 
          orderedAccountIds: data.orderedAccountIds, 
          notes: data.notes || null,
          updatedAt: new Date() 
        })
        .where(eq(accountDailyOrder.id, existing.id))
        .returning();
      return result[0];
    } else {
      const result = await db
        .insert(accountDailyOrder)
        .values({ ...data, userId })
        .returning();
      return result[0];
    }
  },

  async delete(id: string): Promise<void> {
    await db.delete(accountDailyOrder).where(eq(accountDailyOrder.id, id));
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
