import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

/**
 * Single shared PostgreSQL client. In dev, cache on globalThis so Next.js HMR
 * doesn't open a new pool on every reload.
 */
const globalForDb = globalThis as unknown as {
  __tracksSql?: ReturnType<typeof postgres>;
};

function makeClient() {
  // No hardcoded fallback: credentials belong in .env only.
  //
  // Deliberately a warning, not a throw. `next build` imports this module
  // while collecting page data, and the build image has no DATABASE_URL — so
  // throwing here would fail every build. postgres.js connects lazily, so an
  // unset URL costs nothing until a real query runs, where it surfaces as a
  // connection error naming the missing config.
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.warn('[db] DATABASE_URL is not set — see .env.example');
    return postgres({ max: 10 }); // options-only overload; never connects
  }
  return postgres(url, { max: 10 });
}

export const sql = globalForDb.__tracksSql ?? makeClient();
if (process.env.NODE_ENV !== 'production') globalForDb.__tracksSql = sql;

export const db = drizzle(sql, { schema });
export { schema };
