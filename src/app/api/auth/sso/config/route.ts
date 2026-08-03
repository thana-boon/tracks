import { NextResponse } from 'next/server';
import { ssoConfig } from '@/lib/sso';

/**
 * GET /api/auth/sso/config — the handful of deployment facts the login page
 * needs before it can try SSO: where the Users Service is *as the browser sees
 * it*, which audience to ask for, and where a finished session goes.
 *
 * Deliberately unauthenticated. Nobody is signed in yet when this is read — that
 * is the whole point of it — and none of it is secret; it is the same
 * information anyone can see in the address bar. The API key is not here and
 * never will be.
 *
 * It exists as an endpoint rather than a build-time constant so that moving the
 * platform to another path is an .env edit and a restart. Compiled into the
 * bundle instead, it would take a rebuild of every satellite system.
 */
export async function GET() {
  const { enabled, usersBase, audience, portalUrl } = ssoConfig();
  return NextResponse.json(
    { enabled, usersBase, audience, portalUrl },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
