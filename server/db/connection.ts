import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import * as schema from './schema';

// Get database URL from environment variables
const getDatabaseUrl = (): string => {
  // Check if running in browser - this file should only run server-side
  if (typeof window !== 'undefined') {
    throw new Error(
      'Database connection cannot be used in browser. This is a server-only module.\n' +
      'Use apiClient to make API calls to Netlify Functions instead.'
    );
  }
  
  // For Netlify Functions, use process.env (Node.js environment)
  let url = process.env.DATABASE_URL || process.env.NETLIFY_DATABASE_URL || '';
  if (!url) {
    throw new Error(
      'DATABASE_URL not found in environment variables.\n' +
      'Set DATABASE_URL in your .env file or Netlify environment variables.\n' +
      'Get it from Neon: https://console.neon.tech/'
    );
  }
  // @neondatabase/serverless doesn't support channel_binding — strip it
  url = url.replace(/[?&]channel_binding=require/ig, '');
  // Clean up any leftover ?& or && from the removal
  url = url.replace(/[?&]{2,}/g, '?').replace(/[?&]$/, '');
  return url;
};

// Create the database connection
const sql = neon(getDatabaseUrl());
export const db = drizzle(sql, { schema });

// Helper function to test database connection
export const testConnection = async (): Promise<boolean> => {
  try {
    await sql`SELECT 1`;
    return true;
  } catch (error) {
    console.error('Database connection failed:', error);
    return false;
  }
};
