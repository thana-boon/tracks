/**
 * Manual admin reset — the escape hatch for a FORGOTTEN admin password.
 * (First-run creation happens automatically at app startup; this script is
 * only needed to overwrite an existing credential.)
 *
 *   docker compose run --rm migrate npx tsx scripts/seed-admin.ts
 *
 * Reads SEED_ADMIN_USERNAME / SEED_ADMIN_PASSWORD / SEED_ADMIN_NAME from the
 * environment and upserts that admin.
 */
import 'dotenv/config';
import { eq } from 'drizzle-orm';
import { db, sql } from '../src/db';
import { admins } from '../src/db/schema';
import { hashPassword } from '../src/lib/password';

async function main() {
  const username = process.env.SEED_ADMIN_USERNAME?.trim() || 'admin';
  const password = process.env.SEED_ADMIN_PASSWORD;
  const name = process.env.SEED_ADMIN_NAME?.trim() || 'ผู้ดูแลระบบ';
  if (!password) throw new Error('SEED_ADMIN_PASSWORD is not set');

  const passwordHash = await hashPassword(password);
  const [existing] = await db
    .select({ id: admins.id })
    .from(admins)
    .where(eq(admins.username, username))
    .limit(1);

  if (existing) {
    await db
      .update(admins)
      .set({ passwordHash, name, active: true })
      .where(eq(admins.id, existing.id));
    console.log(`[seed-admin] updated admin "${username}"`);
  } else {
    await db.insert(admins).values({ username, passwordHash, name });
    console.log(`[seed-admin] created admin "${username}"`);
  }
}

main()
  .then(() => sql.end())
  .catch((e) => {
    console.error('[seed-admin] failed:', e);
    process.exitCode = 1;
    return sql.end();
  });
