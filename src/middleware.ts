import { NextResponse, type NextRequest } from 'next/server';
import {
  SESSION_COOKIE,
  SESSION_EXP_COOKIE,
  createSession,
  expCookieOptions,
  identityOf,
  refusedClient,
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
function toEnd(req: NextRequest, token: string, pathname: string): NextResponse {
  // An installed app first. Its platform session is measured in weeks and is
  // almost certainly still alive — our own cookie running out is the only thing
  // that has happened — so it goes back through our login page, which tries
  // silent SSO and puts the user straight back on the page they asked for.
  //
  // Deliberately toLogin() and not `ended=idle`: that flag holds silent SSO off
  // for a whole idle window, which is right for a staffroom tab that timed out
  // and exactly wrong here. And deliberately not the portal, which is the dead
  // end of trap 4.21 — somebody who IS signed in, shown a sign-in page, left to
  // find their own way back to this app.
  if (refusedClient(token) === 'pwa') return toLogin(req, pathname);

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
  if (!claims) return toEnd(req, token, pathname);

  const res = NextResponse.next();
  if (shouldRenew(claims)) {
    // Re-sign the identity only: iat and exp are set fresh, and bornAt is
    // carried over so renewals cannot outrun the absolute cap.
    res.cookies.set(
      SESSION_COOKIE,
      await createSession(identityOf(claims), claims.bornAt),
      // The session's own client, not a default. This is the set-cookie that
      // trap 4.20 lives in: the login route remembers to pass it and this one
      // forgets, so a phone's cookie is quietly downgraded to one that dies when
      // the app is closed — on its very first navigation, by the code meant to
      // keep it alive.
      sessionCookieOptions(claims.client),
    );
    // In lockstep with the token, or the browser's renewal timer is counting
    // down to a moment that has already moved.
    res.cookies.set(
      SESSION_EXP_COOKIE,
      String(sessionExpiresAt(claims)),
      expCookieOptions(claims.client),
    );
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
