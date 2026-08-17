import { NextResponse, type NextRequest } from 'next/server';
import {
  SESSION_COOKIE,
  SESSION_EXP_COOKIE,
  createSession,
  expCookieOptions,
  identityOf,
  refusedVia,
  sessionCookieOptions,
  sessionExpiresAt,
  shouldRenew,
  verifySession,
} from '@/lib/session-core';
import { ENDED_PARAM, portalOf } from '@/lib/session-end';

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
 * Off to the login page: this browser has no session, and never had one on this
 * visit. `next` carries the page they were reaching for, so signing in lands
 * them on it rather than on a dashboard.
 *
 * Not the portal, and it matters: somebody who IS signed in to SchoolOS is
 * carried through this page silently and never sees it, and somebody who is not
 * is sent on to the portal from there — after the page has asked SchoolOS,
 * rather than on the strength of a missing cookie. That order is what keeps a
 * bookmark from bouncing between the two systems.
 */
function toLogin(req: NextRequest, pathname: string): NextResponse {
  const url = req.nextUrl.clone();
  url.pathname = '/login';
  url.search = '';
  url.searchParams.set('next', pathname);
  return signedOut(NextResponse.redirect(url));
}

/**
 * Off to the SchoolOS front door: a session this gate accepted before has run
 * out (our idle window, or the absolute cap). `next` is dropped with it — they
 * are leaving this app, and will come back through a fresh handoff.
 *
 * `ended=idle` — our own login page — is the destination only for those who
 * cannot use the portal: a local ผู้ดูแล, whose password is the way in on the
 * day SchoolOS is down, and a deployment with SSO off or no portal set. The
 * environment is read directly, and per request: ssoConfig() cannot come here
 * (it pulls in `server-only`), and moving the platform must stay an .env edit
 * rather than a rebuild.
 */
function toEnd(req: NextRequest, token: string): NextResponse {
  const stayHere = refusedVia(token) === 'password' || process.env.SSO_ENABLED === 'false';
  const portal = stayHere ? null : portalOf(process.env.SCHOOLOS_PORTAL_URL);
  if (portal) return signedOut(NextResponse.redirect(new URL(portal, req.nextUrl.origin)));

  const url = req.nextUrl.clone();
  url.pathname = '/login';
  url.search = '';
  url.searchParams.set(ENDED_PARAM, 'idle');
  return signedOut(NextResponse.redirect(url));
}

/** The token is spent; leaving it on the browser only means the same bounce again. */
function signedOut(res: NextResponse): NextResponse {
  res.cookies.delete(SESSION_COOKIE);
  res.cookies.delete(SESSION_EXP_COOKIE);
  return res;
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (!PROTECTED.some((p) => pathname.startsWith(p))) return NextResponse.next();

  const token = req.cookies.get(SESSION_COOKIE)?.value;
  if (!token) return toLogin(req, pathname);

  // Also refuses tokens past the absolute cap, however recently renewed. A
  // token that was here and is no longer accepted is a session that ended —
  // and a session that ended goes back to the front door, not to a form.
  const claims = await verifySession(token);
  if (!claims) return toEnd(req, token);

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
