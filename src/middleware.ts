import { NextResponse, type NextRequest } from 'next/server';
import { SESSION_COOKIE } from '@/lib/session';

/**
 * Lightweight gate: bounce unauthenticated users away from app pages before
 * they render. Full JWT verification (and role checks) happens in the server
 * components via requireUser/requireRole — here we only check cookie presence
 * to keep the middleware edge-safe and fast.
 */
const PROTECTED = ['/admin', '/teacher', '/student', '/attendance', '/results', '/homeroom'];

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const needsAuth = PROTECTED.some((p) => pathname.startsWith(p));
  if (!needsAuth) return NextResponse.next();

  const hasCookie = req.cookies.has(SESSION_COOKIE);
  if (!hasCookie) {
    const url = req.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('next', pathname);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
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
