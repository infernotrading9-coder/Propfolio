import { db } from '../server/db/connection';
import { users, firms, challenges, userState, payouts, subscriptions, sessions } from '../server/db/schema';
import { eq } from 'drizzle-orm';

const NEW_USER_ID = 'a54ddfe2-d90c-4a6b-b2cd-ee8301c1b5f4';
const EMAIL = 'infernotrading9@gmail.com';

async function migrateUserData() {
  console.log('🔄 Starting data migration...');
  console.log(`📧 Email: ${EMAIL}`);
  console.log(`🆔 New User ID: ${NEW_USER_ID}`);
  
  // Find all users with this email
  const allUsers = await db.select().from(users).where(eq(users.email, EMAIL));
  console.log(`\n👥 Found ${allUsers.length} user(s) with this email:`);
  allUsers.forEach(u => console.log(`   - ${u.id} (created: ${u.createdAt})`));
  
  // Find the old user (not the new Identity one)
  const oldUser = allUsers.find(u => u.id !== NEW_USER_ID);
  
  if (!oldUser) {
    console.log('\n❌ No old user found to migrate from. Your data might already be migrated or was never created.');
    return;
  }
  
  const OLD_USER_ID = oldUser.id;
  console.log(`\n📦 Migrating from OLD ID: ${OLD_USER_ID} → NEW ID: ${NEW_USER_ID}`);
  
  // Count data to migrate
  const [oldFirms, oldChallenges, oldPayouts, oldState, oldSubscription] = await Promise.all([
    db.select().from(firms).where(eq(firms.userId, OLD_USER_ID)),
    db.select().from(challenges).where(eq(challenges.userId, OLD_USER_ID)),
    db.select().from(payouts).where(eq(payouts.userId, OLD_USER_ID)),
    db.select().from(userState).where(eq(userState.userId, OLD_USER_ID)),
    db.select().from(subscriptions).where(eq(subscriptions.userId, OLD_USER_ID)),
  ]);
  
  console.log(`\n📊 Data to migrate:`);
  console.log(`   - Firms: ${oldFirms.length}`);
  console.log(`   - Challenges: ${oldChallenges.length}`);
  console.log(`   - Payouts: ${oldPayouts.length}`);
  console.log(`   - User State: ${oldState.length}`);
  console.log(`   - Subscriptions: ${oldSubscription.length}`);
  
  if (oldFirms.length === 0 && oldChallenges.length === 0 && oldPayouts.length === 0) {
    console.log('\n✅ No data to migrate.');
    return;
  }
  
  // Migrate firms
  if (oldFirms.length > 0) {
    await db.update(firms)
      .set({ userId: NEW_USER_ID })
      .where(eq(firms.userId, OLD_USER_ID));
    console.log(`✅ Migrated ${oldFirms.length} firm(s)`);
  }
  
  // Migrate challenges
  if (oldChallenges.length > 0) {
    await db.update(challenges)
      .set({ userId: NEW_USER_ID })
      .where(eq(challenges.userId, OLD_USER_ID));
    console.log(`✅ Migrated ${oldChallenges.length} challenge(s)`);
  }
  
  // Migrate payouts
  if (oldPayouts.length > 0) {
    await db.update(payouts)
      .set({ userId: NEW_USER_ID })
      .where(eq(payouts.userId, OLD_USER_ID));
    console.log(`✅ Migrated ${oldPayouts.length} payout(s)`);
  }
  
  // Migrate user state
  if (oldState.length > 0) {
    await db.update(userState)
      .set({ userId: NEW_USER_ID })
      .where(eq(userState.userId, OLD_USER_ID));
    console.log(`✅ Migrated user state`);
  }
  
  // Migrate subscription
  if (oldSubscription.length > 0) {
    await db.update(subscriptions)
      .set({ userId: NEW_USER_ID })
      .where(eq(subscriptions.userId, OLD_USER_ID));
    console.log(`✅ Migrated subscription`);
  }
  
  // Clean up old sessions (optional)
  await db.delete(sessions).where(eq(sessions.userId, OLD_USER_ID));
  console.log(`🗑️  Cleaned up old sessions`);
  
  // Optionally delete the old user record
  await db.delete(users).where(eq(users.id, OLD_USER_ID));
  console.log(`🗑️  Deleted old user record`);
  
  console.log(`\n✨ Migration complete! Refresh your app to see your data.`);
}

migrateUserData()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('❌ Migration failed:', err);
    process.exit(1);
  });
