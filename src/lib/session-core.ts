import { SignJWT, decodeJwt, jwtVerify } from 'jose';

/**
 * Signing and verifying the session token — and nothing else.
 *
 * Split out of session.ts because the middleware needs it: `next/headers` and
 * `server-only` cannot be imported there, but the middleware is the only place
 * that can both read the request and set a cookie on the way out, which is what
 * renewing a session takes.
 */

export { SESSION_COOKIE, SESSION_EXP_COOKIE } from './session-names';

export type AppRole = 'admin' | 'teacher' | 'student';

/**
 * How this session was obtained.
 *
 * Only `sso` sessions have a SchoolOS session standing behind them, and only
 * those may keep it alive (POST /api/auth/refresh at the Users Service). A local
 * admin has no SchoolOS session at all — heartbeating for them would be a 401
 * every ten minutes, for nothing.
 */
export type SessionVia = 'sso' | 'password';

/**
 * Which set of session windows this one is on — decided by SchoolOS, never here.
 *
 * `web` is a browser tab on a school machine: fifteen minutes of idle and a
 * cookie that dies when the browser closes. `pwa` is the platform installed as
 * an app on somebody's own phone, and gets a window of weeks plus a cookie with
 * a real max-age, because an installed app that asks for a password every time
 * it is reopened is one nobody keeps installed.
 *
 * This app cannot work out which it is looking at and must not try. The claim is
 * stamped into the platform's token at login and reaches us in the handoff
 * redeem payload, so the only correct thing to do with it is copy it. Sniffing a
 * User-Agent or reading `display-mode` here is how the phone stays signed in at
 * SchoolOS and gets thrown out of this app — two systems holding two opinions
 * about one session.
 */
export type SessionClient = 'web' | 'pwa';

export interface SessionUser {
  /** stable subject: `admin:<id>` or `person:<personId>` */
  sub: string;
  role: AppRole;
  name: string;
  /** ชื่อจริง without the คำนำหน้า — what the avatar initial is taken from */
  firstName?: string;
  /** local admin id, when the session came from a local admin account */
  adminId?: number;
  /** people.id, when the session came from a SchoolOS teacher/student */
  personId?: number;
  /**
   * A ครู holding a moderator grant (หน้าสิทธิ์) — may edit วิชาเสริม and
   * ตารางเรียนทั้งปี. Never signed into the token: authz re-reads it from the
   * database on every page load, like the role, and identityOf() leaves it out.
   */
  moderator?: boolean;
  /** how they got in — decides whether the SchoolOS session is ours to renew */
  via?: SessionVia;
  /**
   * WHICH SchoolOS session this one was handed down from — the platform's own
   * `sub` (the teacher/student code, e.g. `T00116`), exactly as the handoff
   * returned it.
   *
   * Our `sub` is `person:<personId>`, a number from our own database, and it
   * cannot be compared with anything SchoolOS says. Without a value that can be,
   * this session is unfalsifiable: it says who we admitted, never whether that
   * is still who the browser is. That gap is the whole of the bug this exists
   * for — sign out of the portal, sign in as somebody else, come back here, and
   * our cookie is still perfectly valid and still the first person.
   *
   * Only ever set on `via: 'sso'` sessions. A password login has no platform
   * session standing behind it, so there is nothing to be the same as.
   */
  ssoSub?: string;
  /**
   * `web` | `pwa`, copied from the platform. Absent on every token minted before
   * this app understood the distinction, and absent is read as `web` — the
   * shorter, safer window, which is the right way for a missing claim to fail.
   */
  client?: SessionClient;
  /**
   * The moment this session ends however active the user stays (epoch MS, not
   * seconds — it is copied verbatim from the platform's `absoluteEndsAt`).
   * `null` means the platform put no ceiling on it at all, which is the default
   * for an installed app.
   *
   * Copied rather than computed, because the platform's ceiling is not one
   * number: 24 hours for an account with `users:write`, weeks for everybody
   * else, and none at all where the school has switched it off. Re-deriving any
   * of that from settings of our own means two systems disagreeing about when a
   * session ends, and the user meets whichever is shorter without being told
   * why.
   *
   * `undefined` and `null` mean opposite things and must never be collapsed:
   * `null` is the platform saying "no cap", `undefined` is a token that predates
   * this field and falls back to `bornAt` plus our own ceiling. Writing
   * `absoluteEndsAt ?? null` anywhere on its way here turns every old session
   * into one that never expires.
   */
  capAt?: number | null;
}

/** A verified session: who they are, plus the two clocks the renewal runs on. */
export interface SessionClaims extends SessionUser {
  /** epoch seconds this token was issued — renewal reads it */
  iat: number;
  /** epoch seconds the token expires */
  exp: number;
  /** epoch seconds of the ORIGINAL login, carried across every renewal */
  bornAt: number;
}

function secret(): Uint8Array {
  const s = process.env.JWT_SECRET;
  if (!s) throw new Error('JWT_SECRET is not set');
  return new TextEncoder().encode(s);
}

/**
 * The platform's idle window (Users: SESSION_IDLE_MINUTES, default 15).
 *
 * Our own idle timeout may never exceed it. If it did, a teacher would still be
 * "logged in" here for hours after SchoolOS had already forgotten them — every
 * SSO-shaped feature (renewing the upstream session, the silent re-entry) would
 * be leaning on a session that no longer exists. Used for the startup warning
 * and as the window the "just kicked out" flag is measured against.
 */
export const PLATFORM_IDLE_SECONDS = 15 * 60;

/**
 * The platform's idle window for an INSTALLED app (Users: SESSION_PWA_IDLE_DAYS).
 *
 * The same ceiling as PLATFORM_IDLE_SECONDS and for the same reason — ours may
 * not outlive SchoolOS's — but for the other kind of client. Thirty days is what
 * the platform's own compose file settles on; a school that lowers it there
 * should lower SESSION_PWA_IDLE_DAYS here to match, and if the two ever disagree
 * the clamp means we end first, never last.
 *
 * Clamping is only ever for that. Setting a ceiling here that is SHORTER than
 * the platform's is its own bug: the phone is signed out while SchoolOS is still
 * perfectly signed in, and nothing on either side can explain why.
 */
export const PLATFORM_PWA_IDLE_DAYS = 30;

/**
 * How long a token lives with no activity — the idle timeout.
 *
 * The only clock there is. It used to be spelled twice — once here and once as
 * the cookie's Max-Age — so changing the env var moved one and not the other,
 * and whichever ran out first decided. The cookie now carries no lifetime at
 * all (see sessionCookieOptions), leaving exactly one answer to "when does this
 * session end", checked by verifySession on every request.
 *
 * Defaults to the platform's own idle window rather than a value of our own:
 * a deployment that never sets it is then correct by default instead of
 * outliving SchoolOS by eleven and three-quarter hours.
 */
export function sessionTtlSeconds(client?: SessionClient): number {
  // An installed app on somebody's own phone is a different question from a tab
  // on a shared staffroom PC, and answering only the second is what threw phones
  // out mid-use: the phone locks itself in a pocket and is reopened thirty times
  // a day, so fifteen minutes there is not security, it is a password prompt
  // every time the screen wakes.
  if (client === 'pwa') {
    const n = Number(process.env.SESSION_PWA_IDLE_DAYS ?? PLATFORM_PWA_IDLE_DAYS);
    const days =
      Number.isFinite(n) && n > 0 ? Math.min(n, PLATFORM_PWA_IDLE_DAYS) : PLATFORM_PWA_IDLE_DAYS;
    return Math.round(days * 24 * 3600);
  }
  const raw = (process.env.JWT_EXPIRES_IN ?? '15m').trim();
  const m = /^(\d+)\s*([smhd]?)$/i.exec(raw);
  if (!m) return PLATFORM_IDLE_SECONDS;
  const n = Number(m[1]);
  switch (m[2].toLowerCase()) {
    case 's':
      return n;
    case 'm':
      return n * 60;
    case 'd':
      return n * 86400;
    case 'h':
    default:
      return n * 3600;
  }
}

/**
 * The hard ceiling on one login, however active the user stays. Without it a
 * sliding session on a staff-room machine that someone keeps clicking never
 * ends at all.
 *
 * Default 8 hours — one school day, and the same ceiling the Users Service puts
 * on the session ours is handed down from (SESSION_ABSOLUTE_HOURS).
 */
export function sessionMaxSeconds(): number {
  const n = Number(process.env.SESSION_MAX_HOURS ?? 8);
  return (Number.isFinite(n) && n > 0 ? n : 8) * 3600;
}

/**
 * When a token minted right now would expire (epoch ms) — the value of the
 * companion SESSION_EXP_COOKIE.
 *
 * Read at the moment the cookie is written, a hair after the token was signed,
 * so it can trail the real `exp` by a millisecond or two. That is fine: this is
 * a hint for the browser's renewal timer, never an authority. The token's own
 * `exp` is what actually ends the session.
 */
/**
 * The moment a session must end no matter what (epoch MS), or null when nothing
 * caps it.
 *
 * One place, because three call sites ask it — minting, verifying, and deciding
 * whether a renewal is worth making — and a disagreement between them is a
 * session that either outlives its ceiling or is refused before reaching it.
 *
 * `capAt` wins when the platform gave us one, `null` included: that is a real
 * answer meaning "no ceiling", and it must not be confused with the `undefined`
 * of a token minted before this existed, which falls back to `bornAt` plus our
 * own eight hours.
 */
export function sessionCapAt(claims: { capAt?: number | null; bornAt?: number }): number | null {
  if (claims.capAt !== undefined) return claims.capAt;
  return typeof claims.bornAt === 'number'
    ? (claims.bornAt + sessionMaxSeconds()) * 1000
    : null;
}

export function sessionExpiresAt(claims?: {
  client?: SessionClient;
  capAt?: number | null;
  bornAt?: number;
}): number {
  const idleEnd = Date.now() + sessionTtlSeconds(claims?.client) * 1000;
  const cap = claims ? sessionCapAt(claims) : null;
  // Never past the ceiling. A hint written beyond it would have the browser's
  // renewal timer counting down to a moment the token itself can never reach,
  // and verifySession would refuse the session before the countdown got there.
  return cap === null ? idleEnd : Math.min(idleEnd, cap);
}

/** Mint a token. `bornAt` carries the original login time through renewals. */
export async function createSession(
  user: SessionUser,
  bornAt?: number,
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const born = bornAt ?? now;
  // Sized from the session's own client, so renewing a `pwa` session mints
  // another one. The window cannot quietly shrink to fifteen minutes halfway
  // through a phone's week because one call site forgot to pass the claim along
  // — that is what identityOf() is for.
  const idleEnd = now + sessionTtlSeconds(user.client);
  const cap = sessionCapAt({ capAt: user.capAt, bornAt: born });
  return new SignJWT({ ...user, typ: 'session', bornAt: born })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt(now)
    .setExpirationTime(cap === null ? idleEnd : Math.min(idleEnd, Math.floor(cap / 1000)))
    .sign(secret());
}

export async function verifySession(token: string): Promise<SessionClaims | null> {
  try {
    const { payload } = await jwtVerify(token, secret());
    if (payload.typ !== 'session') return null;
    const claims = payload as unknown as SessionClaims;
    // Pre-`bornAt` tokens are still in flight when this ships; treat their issue
    // time as the birth so nobody is thrown out mid-afternoon by the upgrade.
    if (typeof claims.bornAt !== 'number') claims.bornAt = claims.iat;
    // The absolute ceiling — the platform's own where it gave us one, otherwise
    // `bornAt` plus ours. A token carrying `capAt: null` is deliberately not
    // capped at all: that is the platform saying so, not a value going missing.
    const cap = sessionCapAt(claims);
    if (cap !== null && cap < Date.now()) return null;
    return claims;
  } catch {
    return null;
  }
}

/**
 * How a token that has just been REFUSED was obtained.
 *
 * The one question left to ask about a session that has ended: an SSO session
 * goes back to the SchoolOS front door, a password session stays on our own
 * form, because a local ผู้ดูแล has nothing to sign in with over there.
 *
 * Reads the claims without verifying them, and that is safe for exactly this:
 * the token is already refused, nothing is granted on the answer, and the worst
 * a forged `via` can buy its author is being sent to the wrong login screen.
 * Verifying is not an option anyway — it just failed, which is why we are here.
 */
export function refusedVia(token: string): SessionVia | null {
  try {
    const via = decodeJwt(token).via;
    return via === 'sso' || via === 'password' ? via : null;
  } catch {
    return null;
  }
}

/**
 * Which windows a token that has ALREADY been refused was on.
 *
 * Unverified, for the same reason and with the same limits as refusedVia: an
 * expired token cannot be verified, this picks between two public pages, and its
 * answer must never reach an authorisation decision.
 *
 * It exists because the two clients deserve different endings. A staffroom tab
 * that idled out belongs at the SchoolOS front door: the timeout was the point,
 * and signing back in is a deliberate act. A phone does not — its platform
 * session is measured in weeks and is almost certainly still alive, so our
 * cookie expiring is the only thing that happened. Sending it to the portal is a
 * dead end that reads as a bug: the user is signed in, is shown a sign-in page,
 * and has to find their own way back to this app. Our own login page lets silent
 * SSO put them straight back where they were.
 */
export function refusedClient(token: string): SessionClient | null {
  try {
    const client = decodeJwt(token).client;
    return client === 'pwa' || client === 'web' ? client : null;
  } catch {
    return null;
  }
}

/**
 * The identity out of a verified token, with the clocks left behind — what a
 * renewal re-signs.
 *
 * A helper rather than an object literal at each call site, because there are
 * two of them (the middleware and /api/auth/renew) and they must not disagree.
 * They were literals until `ssoSub` was added, and the failure mode is silent:
 * whichever site forgets a field strips it from the session on the first
 * renewal, so the claim survives fifteen minutes of sitting still and vanishes
 * the moment somebody works.
 */
export function identityOf(claims: SessionClaims): SessionUser {
  return {
    sub: claims.sub,
    role: claims.role,
    name: claims.name,
    firstName: claims.firstName,
    adminId: claims.adminId,
    personId: claims.personId,
    via: claims.via,
    ssoSub: claims.ssoSub,
    // Both of these size the next token's clocks. Drop either on a renewal and a
    // phone's session silently becomes a fifteen-minute desktop one on the first
    // navigation — the very thing that was meant to keep it alive is then what
    // ends it.
    client: claims.client,
    capAt: claims.capAt,
  };
}

/**
 * Renew once the token is past half its life — not on every request, which
 * would re-sign and re-set a cookie on every navigation for no gain.
 */
export function shouldRenew(claims: SessionClaims): boolean {
  const now = Math.floor(Date.now() / 1000);
  const cap = sessionCapAt(claims);
  if (cap !== null && cap <= (now + 60) * 1000) return false; // no point
  // Sized from the session's own client, so a `pwa` token is not re-signed on
  // every single navigation for the fortnight before its half-life.
  return now - claims.iat >= sessionTtlSeconds(claims.client) / 2;
}

/**
 * The cookie attributes, in one place so route/middleware cannot disagree.
 *
 * Note what is NOT here: no `maxAge`, no `expires`. That makes both of ours
 * *session cookies* in the browser's sense — closing the browser deletes them,
 * so on a shared staffroom machine "I closed the window" really does mean
 * signed out, with no window in which the next person to open it inherits the
 * last one's account. That window is not hypothetical: it is how a student
 * signing in here met the previous student's timetable instead of the login
 * form, because our cookie outlived the browser by a quarter of an hour.
 *
 * It is also what the Users Service already does (users/src/lib/jwt.ts), and
 * the two must not disagree: SchoolOS's `sso_session` dies with the browser, so
 * a Track cookie that survives it is a session with nothing left standing
 * behind it — signed in here, signed out of the platform we take our word from.
 *
 * This costs nothing in enforcement. The idle window and the absolute cap live
 * in the token's own claims and are re-checked by verifySession() on every
 * request, so they hold whatever the browser chooses to keep — a cookie that
 * outlives its token buys the holder nothing but a redirect to the login page.
 * The old Max-Age was only ever tidiness.
 */
/**
 * Chrome and the browsers built on it silently clamp any cookie expiry to 400
 * days, so asking for longer quietly gets 400 anyway. Ask for what we will get.
 */
const MAX_COOKIE_SECONDS = 400 * 24 * 3600;

/** ชนิดที่ประกาศไว้ตรง ๆ เพื่อให้ `maxAge` เป็น optional ของผลลัพธ์เดียว ไม่ใช่ union
 * สองแบบที่ผู้เรียกต้องมานั่งแยกเอง */
export function sessionCookieOptions(client?: SessionClient): {
  httpOnly: boolean;
  sameSite: 'lax';
  secure: boolean;
  path: string;
  maxAge?: number;
} {
  const base = {
    httpOnly: true,
    sameSite: 'lax' as const,
    // Secure unless explicitly turned off for a plain-HTTP LAN deployment.
    secure: process.env.COOKIE_SECURE !== 'false',
    path: '/',
  };
  if (client !== 'pwa') return base;
  // An installed app is closed and reopened all day, and a cookie with no
  // max-age is thrown away on every close — so the user comes back to a system
  // that has forgotten them while SchoolOS, whose own `pwa` cookie carries a
  // real one, is still perfectly signed in. Nothing about that reads as a
  // timeout to the person holding the phone; it reads as being logged out at
  // random. This costs nothing in enforcement: both clocks live in the token's
  // claims and are re-checked on every request, so they hold whatever the
  // browser chooses to keep.
  return { ...base, maxAge: Math.min(sessionTtlSeconds(client), MAX_COOKIE_SECONDS) };
}

/**
 * The expiry-hint cookie. Same attributes as the token it describes — it must
 * die at the same moment, and it dies with the browser too — but
 * `httpOnly: false`: being readable from JavaScript is the entire point of it
 * (see SESSION_EXP_COOKIE).
 */
export function expCookieOptions(client?: SessionClient) {
  return { ...sessionCookieOptions(client), httpOnly: false };
}
