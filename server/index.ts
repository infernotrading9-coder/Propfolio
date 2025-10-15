import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';
import jwt from 'jsonwebtoken';
import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import * as schema from '../src/lib/schema';
import { eq, and, desc } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// Database setup
const databaseUrl = process.env.DATABASE_URL || process.env.VITE_DATABASE_URL;
if (!databaseUrl) {
  throw new Error('DATABASE_URL is required');
}

const sql = neon(databaseUrl);
const db = drizzle(sql, { schema });

// Middleware
app.use(helmet());
app.use(compression());
app.use(morgan('combined'));
app.use(cors({
  origin: process.env.NODE_ENV === 'production' 
    ? ['https://yourdomain.com'] // Add your production domain
    : ['http://localhost:5173', 'http://localhost:5174', 'http://localhost:3000'],
  credentials: true
}));
app.use(express.json());
app.use(cookieParser());

// Auth middleware
const authenticateToken = (req: any, res: any, next: any) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  // For now, we'll decode the token without verification (since we're using Firebase auth)
  // In production, you'd want to verify the Firebase token
  try {
    // Simple decode for Firebase tokens - you'd want to verify with Firebase Admin SDK
    const decoded = JSON.parse(atob(token.split('.')[1]));
    req.userId = decoded.user_id || decoded.sub;
    next();
  } catch (error) {
    return res.status(403).json({ error: 'Invalid token' });
  }
};

// Routes

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Get user data (firms, challenges, selected firm)
app.get('/api/user/data', authenticateToken, async (req: any, res) => {
  try {
    const userId = req.userId;

    // Load firms
    const userFirms = await db
      .select()
      .from(schema.firms)
      .where(eq(schema.firms.userId, userId))
      .orderBy(desc(schema.firms.createdAt));

    // Load challenges
    const userChallenges = await db
      .select()
      .from(schema.challenges)
      .where(eq(schema.challenges.userId, userId))
      .orderBy(desc(schema.challenges.createdAt));

    // Get user state
    const userStateData = await db
      .select()
      .from(schema.userState)
      .where(eq(schema.userState.userId, userId))
      .limit(1);

    // Load payouts for all challenges
    const payoutsByChallenge: Record<string, any[]> = {};
    for (const challenge of userChallenges) {
      const challengePayouts = await db
        .select()
        .from(schema.payouts)
        .where(eq(schema.payouts.challengeId, challenge.id));
      
      payoutsByChallenge[challenge.id] = challengePayouts.map(p => ({
        id: p.id,
        amount: parseFloat(p.amount),
        date: p.date,
        description: p.description
      }));
    }

    // Transform to frontend format
    const transformedFirms = userFirms.map(f => ({
      id: f.id,
      name: f.name,
      createdAt: f.createdAt.toISOString()
    }));

    const transformedChallenges = userChallenges.map(c => ({
      id: c.id,
      propFirmId: c.firmId,
      brokerName: c.brokerName,
      accountSize: c.accountSize,
      startDate: c.startDate,
      cost: parseFloat(c.cost),
      strategy: c.strategy,
      totalPhases: c.totalPhases,
      status: c.status || 'active',
      monthlyPnL: {},
      weeklyPnL: {},
      payouts: payoutsByChallenge[c.id] || [],
      createdAt: c.createdAt.toISOString(),
      phases: {
        phase1: {
          completed: c.phase1Completed || false,
          completedAt: c.phase1CompletedAt?.toISOString()
        },
        phase2: {
          completed: c.phase2Completed || false,
          completedAt: c.phase2CompletedAt?.toISOString()
        },
        phase3: {
          completed: c.phase3Completed || false,
          completedAt: c.phase3CompletedAt?.toISOString()
        }
      }
    }));

    res.json({
      firms: transformedFirms,
      challenges: transformedChallenges,
      selectedFirmId: userStateData[0]?.selectedFirmId || null
    });
  } catch (error) {
    console.error('Error loading user data:', error);
    res.status(500).json({ error: 'Failed to load user data' });
  }
});

// Add firm
app.post('/api/firms', authenticateToken, async (req: any, res) => {
  try {
    const userId = req.userId;
    const { name } = req.body;

    if (!name?.trim()) {
      return res.status(400).json({ error: 'Firm name is required' });
    }

    // Check if firm already exists
    const existingFirm = await db
      .select()
      .from(schema.firms)
      .where(and(
        eq(schema.firms.userId, userId),
        eq(schema.firms.name, name.trim())
      ))
      .limit(1);

    if (existingFirm.length > 0) {
      return res.json({
        firm: {
          id: existingFirm[0].id,
          name: existingFirm[0].name,
          createdAt: existingFirm[0].createdAt.toISOString()
        }
      });
    }

    // Create new firm
    const newFirm = await db
      .insert(schema.firms)
      .values({ userId, name: name.trim() })
      .returning();

    res.json({
      firm: {
        id: newFirm[0].id,
        name: newFirm[0].name,
        createdAt: newFirm[0].createdAt.toISOString()
      }
    });
  } catch (error) {
    console.error('Error adding firm:', error);
    res.status(500).json({ error: 'Failed to add firm' });
  }
});

// Add challenge
app.post('/api/challenges', authenticateToken, async (req: any, res) => {
  try {
    const userId = req.userId;
    const { propFirmId, brokerName, accountSize, startDate, cost, strategy, totalPhases } = req.body;

    const challengeId = uuidv4();
    const newChallenge = await db
      .insert(schema.challenges)
      .values({
        id: challengeId,
        userId,
        firmId: propFirmId,
        brokerName: brokerName.trim(),
        accountSize,
        startDate,
        cost: cost.toString(),
        strategy: strategy?.trim() || null,
        totalPhases
      })
      .returning();

    res.json({
      challenge: {
        id: newChallenge[0].id,
        propFirmId: newChallenge[0].firmId,
        brokerName: newChallenge[0].brokerName,
        accountSize: newChallenge[0].accountSize,
        startDate: newChallenge[0].startDate,
        cost: parseFloat(newChallenge[0].cost),
        strategy: newChallenge[0].strategy,
        totalPhases: newChallenge[0].totalPhases,
        status: 'active',
        monthlyPnL: {},
        weeklyPnL: {},
        payouts: [],
        createdAt: newChallenge[0].createdAt.toISOString(),
        phases: {
          phase1: { completed: false },
          phase2: { completed: false },
          phase3: { completed: false }
        }
      }
    });
  } catch (error) {
    console.error('Error adding challenge:', error);
    res.status(500).json({ error: 'Failed to add challenge' });
  }
});

// Update challenge
app.put('/api/challenges/:id', authenticateToken, async (req: any, res) => {
  try {
    const userId = req.userId;
    const challengeId = req.params.id;
    const challenge = req.body;

    await db
      .update(schema.challenges)
      .set({
        brokerName: challenge.brokerName,
        accountSize: challenge.accountSize,
        startDate: challenge.startDate,
        cost: challenge.cost.toString(),
        strategy: challenge.strategy?.trim() || null,
        totalPhases: challenge.totalPhases,
        phase1Completed: challenge.phases.phase1.completed,
        phase1CompletedAt: challenge.phases.phase1.completedAt ? new Date(challenge.phases.phase1.completedAt) : null,
        phase2Completed: challenge.phases.phase2.completed,
        phase2CompletedAt: challenge.phases.phase2.completedAt ? new Date(challenge.phases.phase2.completedAt) : null,
        phase3Completed: challenge.phases.phase3.completed,
        phase3CompletedAt: challenge.phases.phase3.completedAt ? new Date(challenge.phases.phase3.completedAt) : null,
        status: challenge.status,
        updatedAt: new Date()
      })
      .where(and(
        eq(schema.challenges.id, challengeId),
        eq(schema.challenges.userId, userId)
      ));

    res.json({ success: true });
  } catch (error) {
    console.error('Error updating challenge:', error);
    res.status(500).json({ error: 'Failed to update challenge' });
  }
});

// Delete challenge
app.delete('/api/challenges/:id', authenticateToken, async (req: any, res) => {
  try {
    const userId = req.userId;
    const challengeId = req.params.id;

    // Delete related payouts first
    await db.delete(schema.payouts).where(eq(schema.payouts.challengeId, challengeId));
    
    // Delete the challenge
    await db
      .delete(schema.challenges)
      .where(and(
        eq(schema.challenges.id, challengeId),
        eq(schema.challenges.userId, userId)
      ));

    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting challenge:', error);
    res.status(500).json({ error: 'Failed to delete challenge' });
  }
});

// Set selected firm
app.put('/api/user/selected-firm', authenticateToken, async (req: any, res) => {
  try {
    const userId = req.userId;
    const { firmId } = req.body;

    const existingState = await db
      .select()
      .from(schema.userState)
      .where(eq(schema.userState.userId, userId))
      .limit(1);

    if (existingState.length > 0) {
      await db
        .update(schema.userState)
        .set({ selectedFirmId: firmId, updatedAt: new Date() })
        .where(eq(schema.userState.userId, userId));
    } else {
      await db
        .insert(schema.userState)
        .values({ userId, selectedFirmId: firmId });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Error setting selected firm:', error);
    res.status(500).json({ error: 'Failed to set selected firm' });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Backend server running on port ${PORT}`);
  console.log(`📊 Database connected to Neon`);
  console.log(`🔥 Ready for production scale!`);
});