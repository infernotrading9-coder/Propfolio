// Database connection disabled for browser environments
// This prevents WebAssembly compilation errors in the browser
// All database operations are handled via API calls to the backend

if (typeof window !== 'undefined') {
  // We're in the browser - don't create database connection
  throw new Error('Database connections are not allowed in browser environment. Use API calls instead.');
}

// Server-side database connection (for backend API use)
import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import * as schema from './schema';

// Use DATABASE_URL from environment (works with both local and Netlify)
const databaseUrl = import.meta.env.VITE_DATABASE_URL || 
  (typeof process !== 'undefined' ? (process.env.DATABASE_URL || process.env.NETLIFY_DATABASE_URL) : null);

if (!databaseUrl) {
  throw new Error('DATABASE_URL environment variable is required');
}

// Create the Neon client
const sql = neon(databaseUrl);

// Create the Drizzle database instance
export const db = drizzle(sql, { schema });
