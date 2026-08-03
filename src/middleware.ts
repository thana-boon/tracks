import { NextResponse, type NextRequest } from 'next/server';
import {
  SESSION_COOKIE,
  SESSION_EXP_COOKIE,
  createSession,
  expCookieOptions,
  identityOf,
  sessionCookieOptions,
  sessionExpiresAt,
  shouldRenew,
  verifySession,
} from '@/lib/session-core';

/**
 * The session gate, and the only place a session can be renewed.
 *
 * It used to check nothing but the presence of the cookie. That let an expired
 * token through to the page, which redirected to /login with no `next` — so a
 * session running out mid-afternoon dumped a teacher on the login screen and
 * lost the page they were on. Verifying here means the redirect can carry them
 * back, and it is also the only opportunity to hand out a fresh token: a server
 * component cannot set a cookie.
 *
 * Role checks stay in the pages (requireRole) — this decides *logged in or
 * not*, nothing about what they may see.
 */
const PROTECTED = ['/admin', '/teacher', '/student', '/attendance', '/results', '/homeroom'];

/**
 * `expired` separates "your session ran out just now" from "you were never
 * signed in here", and the login page needs the difference badly:
 *
 *  - it must not let silent SSO haul someone straight back in the instant the
 *    idle timeout throws them out — that would make the timeout meaningless,
 *    and they would never even see that it had happened.
 *  - a session that ended belongs back at the SchoolOS front door, not parked
 *    on our login form.
 *
 * Neither applies to somebody who simply opened a bookmark while signed out, and
 * doing either to them would be wrong: that person we want SSO to catch.
 */
function toLogin(req: NextRequest, pathname: string, expired: boolean): NextResponse {
  const url = req.nextUrl.clone();
  url.pathname = '/login';
  url.search = '';
  url.searchParams.set('next', pathname);
  if (expired) url.searchParams.set('expired', '1');
  const res = NextResponse.redirect(url);
  // The token is spent; leaving it on the browser only means the same bounce
  // again on the next click.
  res.cookies.delete(SESSION_COOKIE);
  res.cookies.delete(SESSION_EXP_COOKIE);
  return res;
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (!PROTECTED.some((p) => pathname.startsWith(p))) return NextResponse.next();

  const token = req.cookies.get(SESSION_COOKIE)?.value;
  if (!token) return toLogin(req, pathname, false);

  // Also refuses tokens past the absolute cap, however recently renewed. A
  // token that was here and is no longer accepted is a session that ended.
  const claims = await verifySession(token);
  if (!claims) return toLogin(req, pathname, true);

  const res = NextResponse.next();
  if (shouldRenew(claims)) {
    // Re-sign the identity only: iat and exp are set fresh, and bornAt is
    // carried over so renewals cannot outrun the absolute cap.
    res.cookies.set(
      SESSION_COOKIE,
      await createSession(identityOf(claims), claims.bornAt),
      sessionCookieOptions(),
    );
    // In lockstep with the token, or the browser's renewal timer is counting
    // down to a moment that has already moved.
    res.cookies.set(SESSION_EXP_COOKIE, String(sessionExpiresAt()), expCookieOptions());
  }
  return res;
}

export const config = {
  matcher: [
    '/admin/:path*',
    '/teacher/:path*',
    '/student/:path*',
    '/attendance/:path*',
    '/results/:path*',
    '/homeroom/:path*',
  ],
};
