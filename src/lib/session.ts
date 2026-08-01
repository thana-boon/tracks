import 'server-only';
import { cookies } from 'next/headers';
import { withBasePath } from './base-path';
import {
  SESSION_COOKIE,
  sessionCookieOptions,
  verifySession,
  type SessionUser,
} from './session-core';

/**
 * Reading and writing the session cookie from server components, route handlers
 * and server actions. The signing itself — and everything the middleware also
 * needs — lives in session-core.ts.
 */

export {
  SESSION_COOKIE,
  createSession,
  verifySession,
  sessionTtlSeconds,
  sessionMaxSeconds,
  shouldRenew,
  sessionCookieOptions,
} from './session-core';
export type { AppRole, SessionUser, SessionClaims } from './session-core';

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

export async function setSessionCookie(token: string): Promise<void> {
  const store = await cookies();
  store.set(SESSION_COOKIE, token, sessionCookieOptions());
}

export async function clearSessionCookie(): Promise<void> {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}
