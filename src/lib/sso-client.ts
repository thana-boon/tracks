import { withBasePath } from './base-path';

/**
 * The browser half of silent SSO.
 *
 * Nothing secret lives here. The one-time code this fetches is a credential —
 * briefly — so it is passed straight to our own server and never written down:
 * not to localStorage, not into a URL, not into a log line. Sixty seconds and
 * one use is the entire budget, and it buys nothing at all without the API key
 * sitting on our server.
 */

export interface SsoConfig {
  enabled: boolean;
  /** where the browser reaches the Users Service (a path, behind the school nginx) */
  usersBase: string;
  audience: string;
  portalUrl: string;
}

/**
 * How long a timeout keeps silent SSO switched off, measured from the moment it
 * happened.
 *
 * A plain "was signed out" flag — cleared only by a successful login — was the
 * shape this started as, and it rotted: a browser that had timed out once never
 * got SSO again, not the next lesson and not the next day, until somebody typed
 * a password into it by hand. The symptom reaching the staff room was "it signs
 * me in on that computer but not on this one", which is close to unfindable.
 *
 * One idle window is the right length because it is exactly long enough to stop
 * SSO undoing the timeout that just happened, and no longer.
 */
const SUPPRESS_MS = 15 * 60 * 1000;
const SUPPRESS_KEY = 'tracks:signed-out-at';

/** Session storage is per tab; this has to be per browser — see above. */
function store(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    // Private mode, or storage disabled entirely. SSO then simply always
    // retries, which is the harmless direction to fail in.
    return null;
  }
}

/** Remember that a session ended here, so SSO does not immediately undo it. */
export function markSignedOut(): void {
  try {
    store()?.setItem(SUPPRESS_KEY, String(Date.now()));
  } catch {
    /* nothing worth breaking a logout over */
  }
}

/** True while a just-ended session should keep silent SSO from firing. */
export function recentlySignedOut(): boolean {
  const raw = store()?.getItem(SUPPRESS_KEY);
  if (!raw) return false;
  const at = Number(raw);
  if (!Number.isFinite(at)) return false;
  if (Date.now() - at < SUPPRESS_MS) return true;
  // Past the window — drop it rather than re-reading a dead flag forever.
  clearSignedOut();
  return false;
}

export function clearSignedOut(): void {
  try {
    store()?.removeItem(SUPPRESS_KEY);
  } catch {
    /* ignore */
  }
}

/** The deployment's SSO settings, read from our own server at runtime. */
export async function fetchSsoConfig(): Promise<SsoConfig | null> {
  try {
    const res = await fetch(withBasePath('/api/auth/sso/config'), {
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) return null;
    return (await res.json()) as SsoConfig;
  } catch {
    return null;
  }
}

/**
 * Ask the Users Service for a one-time code proving this browser's SchoolOS
 * session.
 *
 * `credentials: 'include'` is the line the whole thing hangs on — without it the
 * SchoolOS cookie never goes, and the answer is a cheerful `valid:false` every
 * single time, with nothing anywhere reading like an error.
 *
 * Every failure returns null, and null means one thing: show the login form.
 * Not an error toast, not a spinner that stays. A person who is not signed in
 * to SchoolOS is the ordinary case, not a fault.
 */
export async function getHandoffCode(cfg: SsoConfig): Promise<string | null> {
  try {
    const res = await fetch(
      `${cfg.usersBase}/api/auth/handoff?audience=${encodeURIComponent(cfg.audience)}`,
      { credentials: 'include', signal: AbortSignal.timeout(6000) },
    );
    // 400 (bad audience), 403 (origin), 429 (asking too often) — all of them
    // just mean "not this time".
    if (!res.ok) return null;
    const data = (await res.json()) as { valid?: boolean; code?: string | null };
    // The field, not the status: "nobody is signed in" is answered with a 200.
    return data.valid && data.code ? data.code : null;
  } catch {
    return null;
  }
}

/** Who the browser is signed in to SchoolOS as, right now. */
export interface LiveSession {
  valid: boolean;
  /** the platform's subject — the teacher/student code — when there is one */
  sub: string | null;
  code: string | null;
}

/**
 * Ask SchoolOS who this browser currently is.
 *
 * The cheap counterpart to a handoff: no code is minted, nothing is spent, and
 * the Users Service deliberately does NOT slide its idle window for it — so it
 * is safe to call on every page load, which is exactly what it is for.
 *
 * `null` means the question could not be asked — offline, CORS, the service
 * down. That is emphatically not the same as `{valid:false}`, and the two must
 * never be collapsed: the caller signs people out on the second answer, and
 * doing that on the first would throw a staff room off the system every time
 * the network hiccuped.
 */
export async function fetchLiveSession(cfg: SsoConfig): Promise<LiveSession | null> {
  try {
    const res = await fetch(`${cfg.usersBase}/api/auth/session`, {
      credentials: 'include',
      cache: 'no-store',
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      valid?: boolean;
      user?: { sub?: string | null; code?: string | null } | null;
    };
    return {
      // The field, not the status: "nobody is signed in" is answered with a 200.
      valid: Boolean(data.valid && data.user),
      sub: data.user?.sub ?? null,
      code: data.user?.code ?? null,
    };
  } catch {
    return null;
  }
}

export interface SsoAttempt {
  ok: boolean;
  /** where to go on success */
  redirect?: string;
  name?: string;
  /** shown to the user only when they are known but refused, or we are broken */
  error?: string;
  status?: number;
}

/**
 * Hand the code to our own server, which is the only side that can spend it.
 *
 * The code is used once here and then forgotten. If this fails there is nothing
 * to retry with — a fresh code has to be fetched, because the old one is either
 * expired or, worse, already spent.
 */
export async function exchangeCode(code: string): Promise<SsoAttempt> {
  try {
    const res = await fetch(withBasePath('/api/auth/sso'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code }),
      signal: AbortSignal.timeout(15000),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: data.error, status: res.status };
    return { ok: true, redirect: data.redirect, name: data.name };
  } catch {
    return { ok: false, status: 0 };
  }
}

/**
 * Sign out of SchoolOS as well as out of here.
 *
 * A top-level navigation, not a background POST. A `fetch` fired off and
 * abandoned as the page changes is cancelled by the browser often enough to
 * matter, and the failure is completely silent: the user is back at a login
 * screen believing they have left, while their SchoolOS session is still open —
 * and silent SSO will walk the next person straight back into their account. On
 * the shared machines this school actually has, that is the whole ballgame.
 */
/**
 * `next` defaults to the portal, which is where signing out belongs — signing
 * out of SchoolOS signs you out of everything, so its front door is the honest
 * place to land. The exception is somebody swapping accounts *here*: they are
 * about to type into our own login form, and sending them to the portal first
 * only makes them find their way back.
 */
export function logoutUrl(cfg: SsoConfig, next: string = cfg.portalUrl): string {
  return `${cfg.usersBase}/api/auth/logout?next=${encodeURIComponent(next)}`;
}

/**
 * Tell the Users Service this person is still working.
 *
 * SchoolOS deliberately does not count activity in a satellite system as
 * activity — the handoff and probe endpoints do not slide its idle window,
 * because a consumer polling them would keep a walked-away session alive for
 * ever. So an hour of marking here is invisible to it unless we say so, and the
 * teacher gets signed out of the platform mid-lesson. This is how we say so, and
 * it must only ever be called when somebody has genuinely moved.
 */
export async function refreshSchoolOsSession(cfg: SsoConfig): Promise<boolean> {
  try {
    const res = await fetch(`${cfg.usersBase}/api/auth/refresh`, {
      method: 'POST',
      credentials: 'include',
      signal: AbortSignal.timeout(6000),
    });
    return res.ok;
  } catch {
    return false;
  }
}
