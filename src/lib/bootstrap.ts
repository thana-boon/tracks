import { count } from 'drizzle-orm';
import { db } from '../db';
import { admins } from '../db/schema';
import { hashPassword } from './password';
import { schoolos } from './schoolos';
import { PLATFORM_IDLE_SECONDS, sessionTtlSeconds } from './session-core';

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

  // Our idle window may never outlast the platform's. If it does, this app goes
  // on believing in a session SchoolOS has already forgotten: renewing it
  // upstream fails, silent re-entry fails, and the user is "signed in" to
  // something that cannot prove who they are.
  const idle = sessionTtlSeconds();
  if (idle > PLATFORM_IDLE_SECONDS)
    console.warn(
      `[config] JWT_EXPIRES_IN is ${Math.round(idle / 60)} minutes, longer than the SchoolOS idle ` +
        `window of ${PLATFORM_IDLE_SECONDS / 60} minutes. A session here would outlive the one it ` +
        'came from — set it to 15m or less.',
    );
}

/**
 * Silent SSO's own settings. Every one of these is a warning and never a
 * refusal: a system that cannot hand sessions over is a system where people
 * type their passwords, which is exactly how it worked before. Refusing to boot
 * over it would turn a degraded feature into an outage.
 */
export function checkSsoConfig(): void {
  const audience = (process.env.SCHOOLOS_SSO_AUDIENCE ?? '').trim();
  if (process.env.SSO_ENABLED === 'false') {
    console.log('[sso] disabled by SSO_ENABLED=false — password login only.');
    return;
  }
  if (!audience) {
    console.warn(
      '[sso] SCHOOLOS_SSO_AUDIENCE is not set — silent sign-in is off. Set it to the ' +
        '"ระบบปลายทาง (audience)" on this system\'s API key (tracks), then restart.',
    );
    return;
  }
  if (!process.env.SCHOOLOS_API_KEY) {
    console.warn('[sso] SCHOOLOS_API_KEY is not set — handoff codes cannot be redeemed.');
    return;
  }

  // Ask the Users Service whether the key is actually set up, rather than
  // waiting for the first teacher of the morning to find out. Best-effort and
  // out of band: the platform may simply be slower to start than we are.
  void (async () => {
    try {
      const me = (await schoolos.me()) as { scopes?: string[]; handoffAudience?: string | null };
      if (!me.scopes?.includes('auth:handoff'))
        console.warn(
          '[sso] this API key has no `auth:handoff` scope — ask the SchoolOS admin to add it.',
        );
      else if (me.handoffAudience !== audience)
        console.warn(
          `[sso] the API key is bound to audience ${JSON.stringify(me.handoffAudience)} but this ` +
            `app asks for ${JSON.stringify(audience)} — codes will fail with audience_mismatch.`,
        );
      else console.log(`[sso] ready — audience "${audience}".`);
    } catch (e) {
      console.warn('[sso] could not verify the API key at startup:', e instanceof Error ? e.message : e);
    }
  })();
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
