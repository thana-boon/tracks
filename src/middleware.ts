import { NextResponse, type NextRequest } from 'next/server';
import {
  SESSION_COOKIE,
  createSession,
  sessionCookieOptions,
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

function toLogin(req: NextRequest, pathname: string): NextResponse {
  const url = req.nextUrl.clone();
  url.pathname = '/login';
  url.search = '';
  url.searchParams.set('next', pathname);
  const res = NextResponse.redirect(url);
  // The token is spent; leaving it on the browser only means the same bounce
  // again on the next click.
  res.cookies.delete(SESSION_COOKIE);
  return res;
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (!PROTECTED.some((p) => pathname.startsWith(p))) return NextResponse.next();

  const token = req.cookies.get(SESSION_COOKIE)?.value;
  if (!token) return toLogin(req, pathname);

  // Also refuses tokens past the absolute cap, however recently renewed.
  const claims = await verifySession(token);
  if (!claims) return toLogin(req, pathname);

  const res = NextResponse.next();
  if (shouldRenew(claims)) {
    // Re-sign the identity only: iat and exp are set fresh, and bornAt is
    // carried over so renewals cannot outrun the absolute cap.
    const user = {
      sub: claims.sub,
      role: claims.role,
      name: claims.name,
      firstName: claims.firstName,
      adminId: claims.adminId,
      personId: claims.personId,
    };
    res.cookies.set(
      SESSION_COOKIE,
      await createSession(user, claims.bornAt),
      sessionCookieOptions(),
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
