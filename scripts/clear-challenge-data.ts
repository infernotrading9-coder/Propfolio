// Clear all challenge-related data from Neon database
// Keeps: users, sessions (for authentication)
// Clears: challenges, firms, subscriptions, payouts, user_state

import { neon } from '@neondatabase/serverless';
import * as dotenv from 'dotenv';

dotenv.config();

const sql = neon(process.env.DATABASE_URL!);

async function clearChallengeData() {
  try {
    console.log('🗑️  Clearing challenge data from Neon database...\n');
    
    // Delete in order to respect foreign key constraints
    console.log('Deleting payouts...');
    const payouts = await sql`DELETE FROM payouts RETURNING id`;
    console.log(`✓ Deleted ${payouts.length} payouts`);
    
    console.log('Deleting challenges...');
    const challenges = await sql`DELETE FROM challenges RETURNING id`;
    console.log(`✓ Deleted ${challenges.length} challenges`);
    
    console.log('Deleting firms...');
    const firms = await sql`DELETE FROM firms RETURNING id`;
    console.log(`✓ Deleted ${firms.length} firms`);
    
    console.log('Deleting user_state...');
    const userState = await sql`DELETE FROM user_state RETURNING user_id`;
    console.log(`✓ Deleted ${userState.length} user_state records`);
    
    console.log('Deleting subscriptions...');
    const subscriptions = await sql`DELETE FROM subscriptions RETURNING id`;
    console.log(`✓ Deleted ${subscriptions.length} subscriptions`);
    
    console.log('\n✅ Challenge data cleared successfully!');
    console.log('👤 User accounts and sessions preserved.\n');
    
  } catch (error) {
    console.error('❌ Error clearing data:', error);
    process.exit(1);
  }
}

clearChallengeData();
