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
/** The value shipped in .env.example — a deployment still using it has none. */
const PLACEHOLDER_SECRET = 'change-me-to-a-long-random-secret';

/**
 * Check the two settings that decide whether sessions mean anything, before the
 * first request rather than after the first incident.
 *
 * A placeholder JWT_SECRET is fatal in production and nowhere else: it is
 * public knowledge in this repository, so anyone could mint themselves an admin
 * session — refusing to start is the only honest response, and it fails the
 * deploy loudly instead of running something that only looks secure. A merely
 * short secret, or a session cookie without Secure, is the operator's call:
 * both are warned about and both keep running.
 */
export function checkSessionConfig(): void {
  const secret = process.env.JWT_SECRET ?? '';
  const production = process.env.NODE_ENV === 'production';

  if (!secret || secret === PLACEHOLDER_SECRET) {
    const message =
      '[config] JWT_SECRET is missing or still the example value — ' +
      'generate one:  node -e "console.log(require(\'crypto\').randomBytes(48).toString(\'hex\'))"';
    if (production) throw new Error(message);
    console.warn(message);
  } else if (secret.length < 32) {
    console.warn(`[config] JWT_SECRET is only ${secret.length} characters — use at least 32.`);
  }

  if (process.env.COOKIE_SECURE === 'false')
    console.warn(
      '[config] COOKIE_SECURE=false — the session cookie will travel in clear text. ' +
        'Correct for a plain-HTTP LAN deployment; behind the school HTTPS nginx set it to true.',
    );
}

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
