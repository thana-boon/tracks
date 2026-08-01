import 'server-only';

/**
 * A fixed-window counter, in memory.
 *
 * Sized for what this actually guards: the login endpoint of one school's app,
 * running as a single container. A shared store (Redis) would survive a restart
 * and cover a second replica — neither of which exists here, and neither of
 * which is worth a new dependency for. What it does buy is the thing that was
 * missing entirely: the local admin password is checked by this app alone (the
 * SchoolOS accounts at least sit behind the Users Service's own 429), so
 * without this, guessing it was limited only by how fast scrypt runs.
 */

interface Window {
  count: number;
  /** epoch ms the window resets */
  resetAt: number;
}

const windows = new Map<string, Window>();

/** Drop expired windows; called on write, so an idle process holds nothing. */
function sweep(now: number): void {
  if (windows.size < 512) return;
  for (const [key, w] of windows) if (w.resetAt <= now) windows.delete(key);
}

export interface RateLimitResult {
  ok: boolean;
  /** seconds until the window resets — what Retry-After should say */
  retryAfter: number;
}

/**
 * Count one attempt against `key`. Returns ok:false once `limit` attempts have
 * been made inside `windowMs`.
 */
export function hit(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now();
  sweep(now);
  const w = windows.get(key);
  if (!w || w.resetAt <= now) {
    windows.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, retryAfter: 0 };
  }
  w.count += 1;
  return {
    ok: w.count <= limit,
    retryAfter: Math.max(1, Math.ceil((w.resetAt - now) / 1000)),
  };
}

/** Forget a key — called after a successful login so one typo costs nothing. */
export function reset(key: string): void {
  windows.delete(key);
}

/**
 * The client's address, as far as it can be trusted. nginx sets
 * X-Forwarded-For (see deploy/nginx-track.conf); the left-most entry is the
 * original client. Only ever used as a rate-limit bucket, never for authz.
 */
export function clientIp(headers: Headers): string {
  const fwd = headers.get('x-forwarded-for');
  if (fwd) return fwd.split(',')[0].trim();
  return headers.get('x-real-ip')?.trim() || 'unknown';
}
