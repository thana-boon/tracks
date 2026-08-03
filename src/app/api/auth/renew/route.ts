import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import {
  SESSION_COOKIE,
  createSession,
  identityOf,
  sessionExpiresAt,
  setSessionCookie,
  verifySession,
} from '@/lib/session';

/**
 * POST /api/auth/renew — slide our own idle window forward.
 *
 * The middleware already renews on navigation, which covers most of the day.
 * What it cannot see is someone working *inside* one page: fifteen minutes of
 * typing marks into a form makes no requests at all, and with the idle window
 * set to match SchoolOS's fifteen minutes that person would be signed out
 * mid-sentence. The browser asks for this when it has seen real activity.
 *
 * Two rules make it safe to expose:
 *
 *  - the token must still be valid. A session that has already run out cannot
 *    be renewed back to life; that is what the idle timeout means, and an
 *    endpoint that resurrected the dead would quietly remove it.
 *  - `bornAt` carries over, so this slides the session up to the absolute cap
 *    and not one second past it (verifySession refuses it beyond).
 *
 * It grants nothing the caller does not already hold, which is why a plain 401
 * — with no attempt to explain — is the whole of the failure path.
 */
export async function POST() {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return NextResponse.json({ error: 'no_session' }, { status: 401 });

  const claims = await verifySession(token);
  if (!claims) return NextResponse.json({ error: 'expired' }, { status: 401 });

  // The identity only: `iat`/`exp` are minted fresh, `bornAt` is not.
  await setSessionCookie(await createSession(identityOf(claims), claims.bornAt));

  return NextResponse.json({ ok: true, expiresAt: sessionExpiresAt() });
}
