import { SignJWT, jwtVerify } from 'jose';

/**
 * Signing and verifying the session token — and nothing else.
 *
 * Split out of session.ts because the middleware needs it: `next/headers` and
 * `server-only` cannot be imported there, but the middleware is the only place
 * that can both read the request and set a cookie on the way out, which is what
 * renewing a session takes.
 */

export { SESSION_COOKIE, SESSION_EXP_COOKIE } from './session-names';

export type AppRole = 'admin' | 'teacher' | 'student';

/**
 * How this session was obtained.
 *
 * Only `sso` sessions have a SchoolOS session standing behind them, and only
 * those may keep it alive (POST /api/auth/refresh at the Users Service). A local
 * admin has no SchoolOS session at all — heartbeating for them would be a 401
 * every ten minutes, for nothing.
 */
export type SessionVia = 'sso' | 'password';

export interface SessionUser {
  /** stable subject: `admin:<id>` or `person:<personId>` */
  sub: string;
  role: AppRole;
  name: string;
  /** ชื่อจริง without the คำนำหน้า — what the avatar initial is taken from */
  firstName?: string;
  /** local admin id, when the session came from a local admin account */
  adminId?: number;
  /** people.id, when the session came from a SchoolOS teacher/student */
  personId?: number;
  /** how they got in — decides whether the SchoolOS session is ours to renew */
  via?: SessionVia;
  /**
   * WHICH SchoolOS session this one was handed down from — the platform's own
   * `sub` (the teacher/student code, e.g. `T00116`), exactly as the handoff
   * returned it.
   *
   * Our `sub` is `person:<personId>`, a number from our own database, and it
   * cannot be compared with anything SchoolOS says. Without a value that can be,
   * this session is unfalsifiable: it says who we admitted, never whether that
   * is still who the browser is. That gap is the whole of the bug this exists
   * for — sign out of the portal, sign in as somebody else, come back here, and
   * our cookie is still perfectly valid and still the first person.
   *
   * Only ever set on `via: 'sso'` sessions. A password login has no platform
   * session standing behind it, so there is nothing to be the same as.
   */
  ssoSub?: string;
}

/** A verified session: who they are, plus the two clocks the renewal runs on. */
export interface SessionClaims extends SessionUser {
  /** epoch seconds this token was issued — renewal reads it */
  iat: number;
  /** epoch seconds the token expires */
  exp: number;
  /** epoch seconds of the ORIGINAL login, carried across every renewal */
  bornAt: number;
}

function secret(): Uint8Array {
  const s = process.env.JWT_SECRET;
  if (!s) throw new Error('JWT_SECRET is not set');
  return new TextEncoder().encode(s);
}

/**
 * The platform's idle window (Users: SESSION_IDLE_MINUTES, default 15).
 *
 * Our own idle timeout may never exceed it. If it did, a teacher would still be
 * "logged in" here for hours after SchoolOS had already forgotten them — every
 * SSO-shaped feature (renewing the upstream session, the silent re-entry) would
 * be leaning on a session that no longer exists. Used for the startup warning
 * and as the window the "just kicked out" flag is measured against.
 */
export const PLATFORM_IDLE_SECONDS = 15 * 60;

/**
 * How long a token lives with no activity — the idle timeout.
 *
 * Also the cookie's Max-Age: the two used to be set independently (12h
 * hard-coded in the cookie, JWT_EXPIRES_IN in the token), so changing the env
 * var moved one clock and not the other, and whichever ran out first decided.
 *
 * Defaults to the platform's own idle window rather than a value of our own:
 * a deployment that never sets it is then correct by default instead of
 * outliving SchoolOS by eleven and three-quarter hours.
 */
export function sessionTtlSeconds(): number {
  const raw = (process.env.JWT_EXPIRES_IN ?? '15m').trim();
  const m = /^(\d+)\s*([smhd]?)$/i.exec(raw);
  if (!m) return PLATFORM_IDLE_SECONDS;
  const n = Number(m[1]);
  switch (m[2].toLowerCase()) {
    case 's':
      return n;
    case 'm':
      return n * 60;
    case 'd':
      return n * 86400;
    case 'h':
    default:
      return n * 3600;
  }
}

/**
 * The hard ceiling on one login, however active the user stays. Without it a
 * sliding session on a staff-room machine that someone keeps clicking never
 * ends at all.
 *
 * Default 8 hours — one school day, and the same ceiling the Users Service puts
 * on the session ours is handed down from (SESSION_ABSOLUTE_HOURS).
 */
export function sessionMaxSeconds(): number {
  const n = Number(process.env.SESSION_MAX_HOURS ?? 8);
  return (Number.isFinite(n) && n > 0 ? n : 8) * 3600;
}

/**
 * When a token minted right now would expire (epoch ms) — the value of the
 * companion SESSION_EXP_COOKIE.
 *
 * Read at the moment the cookie is written, a hair after the token was signed,
 * so it can trail the real `exp` by a millisecond or two. That is fine: this is
 * a hint for the browser's renewal timer, never an authority. The token's own
 * `exp` is what actually ends the session.
 */
export function sessionExpiresAt(): number {
  return Date.now() + sessionTtlSeconds() * 1000;
}

/** Mint a token. `bornAt` carries the original login time through renewals. */
export async function createSession(
  user: SessionUser,
  bornAt?: number,
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({ ...user, typ: 'session', bornAt: bornAt ?? now })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt(now)
    .setExpirationTime(now + sessionTtlSeconds())
    .sign(secret());
}

export async function verifySession(token: string): Promise<SessionClaims | null> {
  try {
    const { payload } = await jwtVerify(token, secret());
    if (payload.typ !== 'session') return null;
    const claims = payload as unknown as SessionClaims;
    // Pre-`bornAt` tokens are still in flight when this ships; treat their issue
    // time as the birth so nobody is thrown out mid-afternoon by the upgrade.
    if (typeof claims.bornAt !== 'number') claims.bornAt = claims.iat;
    if (claims.bornAt + sessionMaxSeconds() < Math.floor(Date.now() / 1000)) return null;
    return claims;
  } catch {
    return null;
  }
}

/**
 * The identity out of a verified token, with the clocks left behind — what a
 * renewal re-signs.
 *
 * A helper rather than an object literal at each call site, because there are
 * two of them (the middleware and /api/auth/renew) and they must not disagree.
 * They were literals until `ssoSub` was added, and the failure mode is silent:
 * whichever site forgets a field strips it from the session on the first
 * renewal, so the claim survives fifteen minutes of sitting still and vanishes
 * the moment somebody works.
 */
export function identityOf(claims: SessionClaims): SessionUser {
  return {
    sub: claims.sub,
    role: claims.role,
    name: claims.name,
    firstName: claims.firstName,
    adminId: claims.adminId,
    personId: claims.personId,
    via: claims.via,
    ssoSub: claims.ssoSub,
  };
}

/**
 * Renew once the token is past half its life — not on every request, which
 * would re-sign and re-set a cookie on every navigation for no gain.
 */
export function shouldRenew(claims: SessionClaims): boolean {
  const now = Math.floor(Date.now() / 1000);
  if (claims.bornAt + sessionMaxSeconds() <= now + 60) return false; // no point
  return now - claims.iat >= sessionTtlSeconds() / 2;
}

/** The cookie attributes, in one place so route/middleware cannot disagree. */
export function sessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    // Secure unless explicitly turned off for a plain-HTTP LAN deployment.
    secure: process.env.COOKIE_SECURE !== 'false',
    path: '/',
    maxAge: sessionTtlSeconds(),
  };
}

/**
 * The expiry-hint cookie. Same lifetime and same Secure rule as the token it
 * describes, but `httpOnly: false` — being readable from JavaScript is the
 * entire point of it (see SESSION_EXP_COOKIE).
 */
export function expCookieOptions() {
  return { ...sessionCookieOptions(), httpOnly: false };
}
