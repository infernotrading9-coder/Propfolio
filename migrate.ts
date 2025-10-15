import { drizzle } from 'drizzle-orm/neon-http';
import { migrate } from 'drizzle-orm/neon-http/migrator';
import { neon } from '@neondatabase/serverless';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config();
const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error('DATABASE_URL environment variable is required');
}

const sql = neon(databaseUrl);
const db = drizzle(sql);

async function main() {
  console.log('Running migrations...');
  
  try {
    // Create tables using raw SQL since we don't have migration files
    await sql`
      -- Users table
      CREATE TABLE IF NOT EXISTS users (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        email TEXT NOT NULL UNIQUE,
        name TEXT,
        email_verified TIMESTAMP,
        hashed_password TEXT,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      );
    `;

    await sql`
      -- Firms table
      CREATE TABLE IF NOT EXISTS firms (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      );
    `;

    await sql`
      -- Challenges table
      CREATE TABLE IF NOT EXISTS challenges (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        firm_id UUID NOT NULL REFERENCES firms(id) ON DELETE CASCADE,
        broker_name TEXT NOT NULL,
        account_size INTEGER NOT NULL,
        start_date TEXT NOT NULL,
        cost DECIMAL(10,2) NOT NULL,
        strategy TEXT,
        total_phases INTEGER NOT NULL DEFAULT 3,
        phase1_completed BOOLEAN DEFAULT FALSE,
        phase1_completed_at TIMESTAMP,
        phase2_completed BOOLEAN DEFAULT FALSE,
        phase2_completed_at TIMESTAMP,
        phase3_completed BOOLEAN DEFAULT FALSE,
        phase3_completed_at TIMESTAMP,
        status TEXT DEFAULT 'active',
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      );
    `;

    await sql`
      -- Payouts table
      CREATE TABLE IF NOT EXISTS payouts (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        challenge_id UUID NOT NULL REFERENCES challenges(id) ON DELETE CASCADE,
        amount DECIMAL(10,2) NOT NULL,
        date TEXT NOT NULL,
        description TEXT,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      );
    `;

    await sql`
      -- Monthly PnL table
      CREATE TABLE IF NOT EXISTS monthly_pnl (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        challenge_id UUID NOT NULL REFERENCES challenges(id) ON DELETE CASCADE,
        month TEXT NOT NULL,
        amount DECIMAL(10,2) NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
        UNIQUE(challenge_id, month)
      );
    `;

    await sql`
      -- Weekly PnL table
      CREATE TABLE IF NOT EXISTS weekly_pnl (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        challenge_id UUID NOT NULL REFERENCES challenges(id) ON DELETE CASCADE,
        week TEXT NOT NULL,
        amount DECIMAL(10,2) NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
        UNIQUE(challenge_id, week)
      );
    `;

    await sql`
      -- User state table
      CREATE TABLE IF NOT EXISTS user_state (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE UNIQUE,
        selected_firm_id UUID REFERENCES firms(id) ON DELETE SET NULL,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      );
    `;

    console.log('✅ All tables created successfully!');
    
    // Add missing columns if they don't exist
    console.log('Adding missing columns...');
    
    try {
      // Add strategy column if it doesn't exist
      await sql`ALTER TABLE challenges ADD COLUMN IF NOT EXISTS strategy TEXT;`;
      console.log('✅ Added strategy column');
    } catch (error) {
      console.log('Strategy column might already exist, continuing...');
    }
    
    try {
      // Add status column if it doesn't exist
      await sql`ALTER TABLE challenges ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active';`;
      console.log('✅ Added status column');
    } catch (error) {
      console.log('Status column might already exist, continuing...');
    }
    
    console.log('✅ Column migration completed!');
    
    // Create indexes for better performance
    await sql`CREATE INDEX IF NOT EXISTS idx_firms_user_id ON firms(user_id);`;
    await sql`CREATE INDEX IF NOT EXISTS idx_challenges_user_id ON challenges(user_id);`;
    await sql`CREATE INDEX IF NOT EXISTS idx_challenges_firm_id ON challenges(firm_id);`;
    await sql`CREATE INDEX IF NOT EXISTS idx_payouts_challenge_id ON payouts(challenge_id);`;
    await sql`CREATE INDEX IF NOT EXISTS idx_monthly_pnl_challenge_id ON monthly_pnl(challenge_id);`;
    await sql`CREATE INDEX IF NOT EXISTS idx_weekly_pnl_challenge_id ON weekly_pnl(challenge_id);`;
    await sql`CREATE INDEX IF NOT EXISTS idx_user_state_user_id ON user_state(user_id);`;
    
    console.log('✅ Indexes created successfully!');
    console.log('🎉 Database migration completed!');
    
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('❌ Migration script failed:', err);
  process.exit(1);
});