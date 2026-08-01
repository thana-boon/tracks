import { SignJWT, jwtVerify } from 'jose';

/**
 * Signing and verifying the session token — and nothing else.
 *
 * Split out of session.ts because the middleware needs it: `next/headers` and
 * `server-only` cannot be imported there, but the middleware is the only place
 * that can both read the request and set a cookie on the way out, which is what
 * renewing a session takes.
 */

export const SESSION_COOKIE = 'tracks_session';

export type AppRole = 'admin' | 'teacher' | 'student';

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
 * How long a token lives with no activity — the idle timeout.
 *
 * Also the cookie's Max-Age: the two used to be set independently (12h
 * hard-coded in the cookie, JWT_EXPIRES_IN in the token), so changing the env
 * var moved one clock and not the other, and whichever ran out first decided.
 */
export function sessionTtlSeconds(): number {
  const raw = (process.env.JWT_EXPIRES_IN ?? '12h').trim();
  const m = /^(\d+)\s*([smhd]?)$/i.exec(raw);
  if (!m) return 12 * 3600;
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
 */
export function sessionMaxSeconds(): number {
  const n = Number(process.env.SESSION_MAX_HOURS ?? 24);
  return (Number.isFinite(n) && n > 0 ? n : 24) * 3600;
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
