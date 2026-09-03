import { Pool, neonConfig } from '@neondatabase/serverless';
import ws from 'ws';

/**
 * Transactional connection for the cascade service layer.
 * ------------------------------------------------------
 * `connection.ts` exports a drizzle instance backed by neon's HTTP driver.
 * That driver sends each statement as an independent HTTP request, so it
 * CANNOT hold a transaction open — BEGIN/COMMIT are meaningless on it.
 *
 * Every cascade in cascadeService.ts must be all-or-nothing (that is the whole
 * point: a half-applied "pass eval" is exactly the bug we are fixing), so those
 * writes go through this pooled WebSocket connection instead, which supports
 * real Postgres transactions.
 *
 * Read paths can keep using the HTTP driver — it is cheaper per query.
 */

// In Node (Netlify Functions) the WebSocket global may be absent; supply one.
if (typeof globalThis.WebSocket === 'undefined') {
  neonConfig.webSocketConstructor = ws as unknown as typeof WebSocket;
}

const getUrl = (): string => {
  let url = process.env.DATABASE_URL || process.env.NETLIFY_DATABASE_URL || '';
  if (!url) throw new Error('DATABASE_URL not found in environment variables.');
  url = url.replace(/[?&]channel_binding=require/gi, '');
  url = url.replace(/[?&]{2,}/g, '?').replace(/[?&]$/, '');
  return url;
};

let pool: Pool | null = null;
const getPool = (): Pool => {
  if (!pool) pool = new Pool({ connectionString: getUrl() });
  return pool;
};

/** A client bound to one connection, inside an open transaction. */
export interface TxClient {
  query<T = any>(text: string, params?: unknown[]): Promise<{ rows: T[]; rowCount: number }>;
}

/**
 * Run `fn` inside a single Postgres transaction.
 * Commits on success; rolls back and rethrows on any error.
 */
export async function withTransaction<T>(fn: (tx: TxClient) => Promise<T>): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const result = await fn({
      query: async (text: string, params?: unknown[]) => {
        const r = await client.query(text, params as any[]);
        return { rows: r.rows as any[], rowCount: r.rowCount ?? 0 };
      },
    });
    await client.query('COMMIT');
    return result;
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch { /* connection already dead */ }
    throw err;
  } finally {
    client.release();
  }
}
