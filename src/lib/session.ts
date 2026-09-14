import 'server-only';
import { cookies } from 'next/headers';
import { withBasePath } from './base-path';
import {
  SESSION_COOKIE,
  SESSION_EXP_COOKIE,
  expCookieOptions,
  sessionCookieOptions,
  sessionExpiresAt,
  verifySession,
  type SessionClient,
  type SessionUser,
} from './session-core';

/**
 * Reading and writing the session cookie from server components, route handlers
 * and server actions. The signing itself — and everything the middleware also
 * needs — lives in session-core.ts.
 */

export {
  SESSION_COOKIE,
  SESSION_EXP_COOKIE,
  PLATFORM_IDLE_SECONDS,
  createSession,
  verifySession,
  identityOf,
  sessionTtlSeconds,
  sessionMaxSeconds,
  sessionExpiresAt,
  shouldRenew,
  sessionCookieOptions,
  expCookieOptions,
} from './session-core';
export type { AppRole, SessionUser, SessionClaims, SessionVia } from './session-core';

/** Where the shell reads this user's account photo, if they can have one. */
export function photoUrlOf(user: SessionUser): string | null {
  // Handed straight to <img src>, so it needs the basePath itself.
  return user.personId ? withBasePath(`/api/photo/${user.personId}`) : null;
}

/** Read the current session from the request cookies (server components / routes). */
export async function getSession(): Promise<SessionUser | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return verifySession(token);
}

/**
 * Write the session. Both cookies, always together — the token and the expiry
 * hint the browser reads it by. Setting one without the other is how a page ends
 * up renewing a session that has already gone, or never renewing one that is
 * about to.
 */
export async function setSessionCookie(
  token: string,
  session: { client?: SessionClient; capAt?: number | null; bornAt?: number },
): Promise<void> {
  const store = await cookies();
  // The identity is asked for rather than optional, so that adding a new place
  // that writes a session is a compile error until it says which windows the
  // session is on. The alternative — a default — is trap 4.20: one forgotten
  // call site silently downgrades a phone's cookie to one that dies when the app
  // is closed, and nothing anywhere reads as wrong.
  store.set(SESSION_COOKIE, token, sessionCookieOptions(session.client));
  store.set(SESSION_EXP_COOKIE, String(sessionExpiresAt(session)), expCookieOptions(session.client));
}

export async function clearSessionCookie(): Promise<void> {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
  store.delete(SESSION_EXP_COOKIE);
}
