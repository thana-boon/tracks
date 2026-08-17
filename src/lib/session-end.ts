import { withBasePath } from './base-path';

/**
 * Where a browser goes when its session ends, and why.
 *
 * The destination is the SchoolOS front door, directly — no stop at our own
 * login page on the way. A session that has ended belongs back where sessions
 * are handed out, and pausing on a form nobody who lands on it can use (their
 * password lives at SchoolOS, not here) only puts a screen between the user and
 * the one place that can sign them in again.
 *
 * Our login page is the destination in exactly two cases, and both mean the
 * portal was never an option: a deployment with no `SCHOOLOS_PORTAL_URL`, and a
 * session that was signed in with a password (`via: 'password'`) — a local
 * ผู้ดูแล has no SchoolOS account, so sending them to the portal would strand
 * them on the very day SchoolOS is down and that account is the way in. Only
 * then is `?ended=` carried, and the page shows the reason above the form
 * rather than passing anybody on anywhere.
 *
 * The reason still has to be two values rather than a flag, because of what it
 * does to silent SSO when the login page IS the destination:
 *
 *  - `idle`  our own idle window ran out. SSO is held off for one window
 *            (markSignedOut), or it would haul the user straight back in and the
 *            timeout would mean nothing — they would never even see it happened.
 *  - `sso`   the SchoolOS session behind ours is gone (the live check answered
 *            `valid:false`). Nothing to hold off: there is no platform session
 *            left to sign them back in with.
 *
 * Neither is set for somebody who simply opened a bookmark while signed out.
 * That person sees the ordinary login page and is exactly who SSO is for.
 *
 * Kept in its own file, free of `jose` and `server-only`, because all four
 * sides need it: the middleware (edge), two client components, and the login
 * page.
 */

export const ENDED_PARAM = 'ended';

export type SessionEnd = 'idle' | 'sso';

/** Read the reason off a query string, ignoring anything we did not write. */
export function sessionEndOf(value: string | null | undefined): SessionEnd | null {
  return value === 'idle' || value === 'sso' ? value : null;
}

/**
 * The configured front door, or null when there is not one.
 *
 * "/" is what an unset `SCHOOLOS_PORTAL_URL` falls back to, and on a
 * root-mounted deploy that is this app's own front page — sending a browser
 * there instead of to the portal is a loop, not a trip.
 */
export function portalOf(raw: string | null | undefined): string | null {
  const url = (raw ?? '').trim().replace(/\/+$/, '');
  return url ? url : null;
}

/**
 * Where a browser goes when its session ends. A plain string for
 * `window.location.assign`, so the fallback carries the app's base path itself —
 * nothing parses it on the way out.
 */
export function endedUrl(reason: SessionEnd, portal: string | null): string {
  return portal ?? withBasePath(`/login?${ENDED_PARAM}=${reason}`);
}
