import { count } from 'drizzle-orm';
import { db } from '../db';
import { admins } from '../db/schema';
import { hashPassword } from './password';

/**
 * First-run admin bootstrap. Runs in-process at server startup
 * (see src/instrumentation.ts) so the deploy needs no seed step.
 *
 * Creates the local admin ONLY when the table holds no admin at all. It never
 * overwrites an existing one, so a password changed later survives every
 * restart and a stale SEED_ADMIN_PASSWORD in .env can't silently reset it.
 *
 * Never throws: a bad or missing credential logs a warning and leaves the app
 * running. Recovering a forgotten password is a deliberate manual step —
 *   docker compose run --rm migrate npx tsx scripts/seed-admin.ts
 */
export async function bootstrapAdmin(): Promise<void> {
  const username = process.env.SEED_ADMIN_USERNAME?.trim() || 'admin';
  const password = process.env.SEED_ADMIN_PASSWORD;
  const name = process.env.SEED_ADMIN_NAME?.trim() || 'ผู้ดูแลระบบ';

  try {
    const [row] = await db.select({ n: count() }).from(admins);
    if ((row?.n ?? 0) > 0) return; // already provisioned — nothing to do

    if (!password) {
      console.warn(
        '[bootstrap] no admin exists and SEED_ADMIN_PASSWORD is unset — ' +
          'set it in .env and restart to create the first admin.',
      );
      return;
    }

    await db.insert(admins).values({
      username,
      passwordHash: await hashPassword(password),
      name,
    });
    console.log(`[bootstrap] created first admin "${username}"`);
  } catch (e) {
    // Startup must not be fatal: the migrate service may still be finishing,
    // or the DB may be briefly unreachable. Next boot retries.
    console.warn('[bootstrap] skipped:', e instanceof Error ? e.message : e);
  }
}
